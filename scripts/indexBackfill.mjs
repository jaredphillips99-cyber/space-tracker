/**
 * scripts/indexBackfill.mjs
 *
 * ONE-TIME manual backfill of ~1 year of AI Index history. Run locally by Jared
 * once, then never again — this is NOT wired into GitHub Actions (the daily
 * scripts/indexCalc.mjs handles ongoing writes).
 *
 * For each tracked ticker it fetches 1 year of daily closes (yahoo-finance2
 * historical chart) and approximates historical market cap as:
 *
 *     current shares outstanding × historical daily close
 *
 * ⚠️  APPROXIMATION: share counts drift over time (buybacks, issuance, dilution),
 *     so applying today's share count to a year-old close is an ESTIMATE of past
 *     weighting, not an exact reconstruction. This caveat is surfaced in the UI
 *     (IndexDetail page caveat text). Values from INDEX_BASE_DATE forward come
 *     from real captured market caps and are exact.
 *
 * Each ticker enters the index at the first available close AFTER the month it
 * was introduced (the same "float on" rule as the live index — reused via the
 * exported isEligible() from indexCalc.mjs), and the divisor is recalculated at
 * entry so the value never jumps.
 *
 * Needs NO API key of any kind — only SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 * and network access to Yahoo. Zero Claude cost.
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/indexBackfill.mjs
 */

import { createClient } from '@supabase/supabase-js';
import YahooFinance from 'yahoo-finance2';
import {
  ALL_TICKERS,
  INDEX_NAMES,
  tickersForIndex,
  isEligible,
  computeIndexValue,
} from './indexCalc.mjs';

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { realtime: { enabled: false } },
);

const LOOKBACK_DAYS = 365;

// ─── Fetch current shares + 1y daily closes per ticker ────────────────────────
async function loadTicker(ticker) {
  let shares = 0;
  try {
    const q = await yahooFinance.quote(ticker);
    shares = q.sharesOutstanding ?? (q.marketCap && q.regularMarketPrice ? q.marketCap / q.regularMarketPrice : 0);
  } catch (err) {
    console.warn(`  [warn] ${ticker}: quote failed — ${err.message}`);
  }

  let series = []; // [{ date: 'YYYY-MM-DD', close }]
  try {
    const chart = await yahooFinance.chart(ticker, {
      period1: new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000),
      period2: new Date(),
      interval: '1d',
    });
    series = (chart.quotes ?? [])
      .filter((q) => q.date && q.close != null)
      .map((q) => ({ date: new Date(q.date).toISOString().split('T')[0], close: q.close }));
  } catch (err) {
    console.warn(`  [warn] ${ticker}: chart failed — ${err.message}`);
  }

  return { ticker, shares: shares ?? 0, series };
}

async function main() {
  console.log(`[backfill] Starting 1-year index backfill — ${new Date().toISOString()}`);
  console.log('[backfill] NOTE: historical market caps use CURRENT share counts (approximation).');

  // Load every ticker (sequential — gentle on Yahoo, this runs once).
  const loaded = {};
  for (const t of ALL_TICKERS) {
    loaded[t] = await loadTicker(t);
    console.log(`  ${t}: ${loaded[t].series.length} daily closes, shares ${loaded[t].shares ? loaded[t].shares.toExponential(3) : 'n/a'}`);
  }

  // Per-ticker date→close map + previous-close lookup.
  const closeByDate = {};   // ticker → Map(date → close)
  const prevCloseAt = {};   // ticker → Map(date → prevClose)
  for (const t of ALL_TICKERS) {
    const m = new Map();
    const pm = new Map();
    let prev = null;
    for (const pt of loaded[t].series) {
      m.set(pt.date, pt.close);
      pm.set(pt.date, prev ?? 0);
      prev = pt.close;
    }
    closeByDate[t] = m;
    prevCloseAt[t] = pm;
  }

  // Master trading-date list = sorted union of all dates seen.
  const dateSet = new Set();
  for (const t of ALL_TICKERS) for (const d of closeByDate[t].keys()) dateSet.add(d);
  const dates = Array.from(dateSet).sort();
  console.log(`[backfill] ${dates.length} trading dates across the universe`);

  const historyRows = [];
  const constituentRows = [];

  // Iterate each index independently, carrying its divisor + present set.
  for (const indexName of INDEX_NAMES) {
    const members = tickersForIndex(indexName);
    let divisor = null;                 // null until the first populated date
    let presentSet = new Set();

    for (const date of dates) {
      const constituents = members
        .filter((t) => isEligible(t, date) && closeByDate[t].has(date) && loaded[t].shares > 0)
        .map((t) => ({
          ticker: t,
          price: closeByDate[t].get(date),
          sharesOutstanding: loaded[t].shares,
          prevClose: prevCloseAt[t].get(date) ?? 0,
          // New entrant once the index is already established (divisor set) and
          // this ticker wasn't in the prior populated date's set.
          isNewEntrant: divisor != null && !presentSet.has(t),
        }));

      if (constituents.length === 0) continue;

      const comp = computeIndexValue(constituents, divisor);
      divisor = comp.divisor;
      presentSet = new Set(constituents.map((c) => c.ticker));

      historyRows.push({
        date,
        index_name: indexName,
        value: comp.value,
        divisor: comp.divisor,
        day_change_pct: comp.dayChangePct,
      });
      for (const c of comp.perTickerContribution) {
        constituentRows.push({
          date,
          index_name: indexName,
          ticker: c.ticker,
          weight_pct: c.weightPct,
          day_change_pct: c.dayChangePct,
          contribution_pct: c.contributionPct,
        });
      }
    }
    console.log(`[backfill] ${indexName}: ${historyRows.filter((r) => r.index_name === indexName).length} daily rows`);
  }

  // Bulk upsert in pages.
  console.log(`[backfill] Writing ${historyRows.length} history rows + ${constituentRows.length} constituent rows…`);

  const HPAGE = 500;
  for (let i = 0; i < historyRows.length; i += HPAGE) {
    const page = historyRows.slice(i, i + HPAGE);
    const { error } = await supabase.from('index_history').upsert(page, { onConflict: 'date,index_name' });
    if (error) { console.error('[backfill] index_history write failed:', error.message); process.exit(1); }
  }

  const CPAGE = 500;
  for (let i = 0; i < constituentRows.length; i += CPAGE) {
    const page = constituentRows.slice(i, i + CPAGE);
    const { error } = await supabase.from('index_constituents').upsert(page, { onConflict: 'date,index_name,ticker' });
    if (error) { console.error('[backfill] index_constituents write failed:', error.message); process.exit(1); }
  }

  console.log('[backfill] ✓ Done.');
}

main().catch((err) => {
  console.error('[backfill] Fatal error:', err);
  process.exit(1);
});
