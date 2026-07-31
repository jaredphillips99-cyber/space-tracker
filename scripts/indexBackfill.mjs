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
  INDEX_BASE_DATE,
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
  //
  // Divisor anchoring: base=100 must land on INDEX_BASE_DATE, not on whatever
  // date happens to be first in the trailing lookback window. dates before
  // INDEX_BASE_DATE are walked BACKWARD from the anchor so the whole series is
  // continuous and consistent with the live/cron path, which always seeds
  // against INDEX_BASE_DATE too.
  for (const indexName of INDEX_NAMES) {
    const members = tickersForIndex(indexName);
    const datesAsc = dates; // already sorted ascending
    const anchorIdx = datesAsc.findIndex((d) => d >= INDEX_BASE_DATE);
    // Fallback: if no backfilled date reaches the base date yet (base date is
    // in the future relative to the data), anchor on the last available date.
    const safeAnchorIdx = anchorIdx === -1 ? datesAsc.length - 1 : anchorIdx;

    function buildConstituents(date, presentSet, divisorSet) {
      return members
        .filter((t) => isEligible(t, date) && closeByDate[t].has(date) && loaded[t].shares > 0)
        .map((t) => ({
          ticker: t,
          price: closeByDate[t].get(date),
          sharesOutstanding: loaded[t].shares,
          prevClose: prevCloseAt[t].get(date) ?? 0,
          isNewEntrant: divisorSet && !presentSet.has(t),
        }));
    }

    // Forward pass: anchor date → end of window.
    let divisor = null;
    let presentSet = new Set();
    for (let i = safeAnchorIdx; i < datesAsc.length; i++) {
      const date = datesAsc[i];
      const constituents = buildConstituents(date, presentSet, divisor != null);
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
    // Backward pass: anchor date → start of window, using the divisor
    // established at the anchor, held fixed (no entrant/exit continuity
    // adjustment walking backward — a ticker that simply doesn't have price
    // history that far back, e.g. SPCX pre-IPO, just drops out of that date's
    // numerator; this is already covered by the UI's "approximated, not exact
    // reconstruction" caveat, same as the share-count approximation).
    const anchorDivisor = divisor; // divisor as of the anchor date, from the forward pass above
    for (let i = safeAnchorIdx - 1; i >= 0; i--) {
      const date = datesAsc[i];
      const constituents = buildConstituents(date, new Set(), false);
      if (constituents.length === 0 || anchorDivisor == null) continue;

      const comp = computeIndexValue(constituents, anchorDivisor);

      historyRows.push({
        date,
        index_name: indexName,
        value: comp.value,
        divisor: anchorDivisor,
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

    console.log(`[backfill] ${indexName}: ${historyRows.filter((r) => r.index_name === indexName).length} daily rows (anchored ${datesAsc[safeAnchorIdx]})`);
  }

  // Completeness check: which of the 50 tracked tickers actually made it into
  // the composite's most recent (anchor-date-or-later) constituent rows? A
  // quote/chart fetch failure for any ticker silently drops it from every
  // index it belongs to (see the per-ticker [warn] lines above) — this
  // summary is the single place that would have caught the Cyber/megacap gap
  // from the July 30 2026 float-on bug.
  const latestCompositeDate = historyRows
    .filter((r) => r.index_name === 'composite')
    .reduce((max, r) => (r.date > max ? r.date : max), '');
  const latestCompositeTickers = new Set(
    constituentRows
      .filter((r) => r.index_name === 'composite' && r.date === latestCompositeDate)
      .map((r) => r.ticker),
  );
  const missing = ALL_TICKERS.filter((t) => !latestCompositeTickers.has(t));
  console.log(
    `[backfill] Composite completeness on ${latestCompositeDate || '(none written)'}: ` +
    `${latestCompositeTickers.size}/${ALL_TICKERS.length} tracked tickers present.`,
  );
  if (missing.length > 0) {
    console.warn(`[backfill] ⚠ MISSING from composite: ${missing.join(', ')} — check the [warn] lines above for why.`);
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
