import type { VercelRequest, VercelResponse } from '@vercel/node';
import YahooFinance from 'yahoo-finance2';
import {
  eventOverlapsRange,
  eventsFromYahooQuote,
  isIsoDate,
  todayNyISO,
  type EarningsEvent,
} from '../lib/earningsDate';
import { UNIVERSE_TICKERS } from '../lib/universeTickers';

/**
 * GET /api/earnings-calendar?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Tracked-universe earnings dates for the News calendar.
 *
 * DATA SOURCE: yahoo-finance2 `quote()` — Yahoo Finance's public quote
 * payload (`earningsTimestamp`, `earningsTimestampStart`,
 * `earningsTimestampEnd`, `isEarningsDateEstimate`). Same vendor as
 * `api/prices.ts`. We never invent a date: tickers Yahoo does not date
 * are omitted. Dates are grouped in America/New_York.
 *
 * Not a Claude route — public market data, no JWT, no Upstash bucket.
 * Do not wire this through `gateClaudeRoute`.
 *
 * Cache: in-process snapshot ≥1h + `Cache-Control: s-maxage=3600`.
 *
 * UNIVERSE_TICKERS lives in `lib/universeTickers.ts` — a hand-synced copy of
 * `src/config/tickers.ts` ALL_TICKERS. Update both on universe changes.
 */

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour — required minimum
const MAX_RANGE_DAYS = 93;
const BATCH_SIZE = 8;

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

interface Snapshot {
  fetchedAt: number;
  events: EarningsEvent[];
}

let snapshot: Snapshot | null = null;
let inflight: Promise<Snapshot> | null = null;

function monthBoundsNy(now = new Date()): { from: string; to: string } {
  const today = todayNyISO(now);
  const from = `${today.slice(0, 7)}-01`;
  const [y, m] = from.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0));
  return { from, to: last.toISOString().slice(0, 10) };
}

function queryString(param: string | string[] | undefined): string | undefined {
  if (Array.isArray(param)) return param[0];
  return param;
}

function daysInclusive(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / (86400 * 1000)) + 1;
}

async function mapInBatches<T, R>(
  items: readonly T[],
  size: number,
  fn: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const out: PromiseSettledResult<R>[] = [];
  for (let i = 0; i < items.length; i += size) {
    const chunk = items.slice(i, i + size);
    out.push(...await Promise.allSettled(chunk.map(fn)));
  }
  return out;
}

async function fetchUniverseSnapshot(): Promise<Snapshot> {
  const results = await mapInBatches(UNIVERSE_TICKERS, BATCH_SIZE, async (ticker) => {
    const quote = await yahooFinance.quote(ticker);
    return eventsFromYahooQuote(ticker, {
      earningsTimestamp: quote.earningsTimestamp,
      earningsTimestampStart: quote.earningsTimestampStart,
      earningsTimestampEnd: quote.earningsTimestampEnd,
      isEarningsDateEstimate: quote.isEarningsDateEstimate,
    });
  });

  const events: EarningsEvent[] = [];
  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      events.push(...result.value);
      return;
    }
    console.error(
      `[earnings-calendar] quote failed for ${UNIVERSE_TICKERS[i]}:`,
      result.reason instanceof Error ? result.reason.message : result.reason,
    );
  });

  return { fetchedAt: Date.now(), events };
}

async function loadSnapshot(): Promise<Snapshot> {
  if (snapshot && Date.now() - snapshot.fetchedAt < CACHE_TTL_MS) {
    return snapshot;
  }
  if (!inflight) {
    inflight = fetchUniverseSnapshot()
      .then((snap) => {
        snapshot = snap;
        return snap;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const defaults = monthBoundsNy();
  const fromRaw = queryString(req.query.from) ?? defaults.from;
  const toRaw = queryString(req.query.to) ?? defaults.to;

  if (!isIsoDate(fromRaw) || !isIsoDate(toRaw)) {
    return res.status(400).json({ error: 'from and to must be YYYY-MM-DD' });
  }
  if (fromRaw > toRaw) {
    return res.status(400).json({ error: 'from must be on or before to' });
  }
  if (daysInclusive(fromRaw, toRaw) > MAX_RANGE_DAYS) {
    return res.status(400).json({ error: `Range exceeds ${MAX_RANGE_DAYS} days` });
  }

  try {
    const snap = await loadSnapshot();
    const events = snap.events
      .filter((e) => eventOverlapsRange(e, fromRaw, toRaw))
      .sort((a, b) => a.date.localeCompare(b.date) || a.ticker.localeCompare(b.ticker));

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).json({
      timezone: 'America/New_York',
      source:
        'yahoo-finance2 quote() — earningsTimestamp / earningsTimestampStart / earningsTimestampEnd / isEarningsDateEstimate',
      from: fromRaw,
      to: toRaw,
      fetchedAt: new Date(snap.fetchedAt).toISOString(),
      events,
    });
  } catch (err) {
    console.error('[earnings-calendar] fetch failed', err);
    return res.status(502).json({ error: 'Yahoo Finance earnings fetch failed' });
  }
}
