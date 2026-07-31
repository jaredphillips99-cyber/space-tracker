/**
 * scripts/indexBackfill.mjs
 *
 * ONE-TIME manual backfill of ~1 year of AI Index history. Run locally by Jared
 * once, then never again — this is NOT wired into GitHub Actions (the daily
 * scripts/indexCalc.mjs handles ongoing writes).
 *
 * ─── July 31 2026 rewrite (per Jared) ─────────────────────────────────────────
 * The index moved from market-cap-weighted to EQUAL-WEIGHT, buy-and-hold (see
 * scripts/indexCalc.mjs header for the full rationale), and INDEX_BASE_DATE
 * moved from the launch date to exactly one year before it. Two big
 * simplifications fall out of this:
 *
 *   1. No share counts needed anywhere. The old backfill fetched each
 *      ticker's CURRENT share count and multiplied it by historical closes to
 *      approximate historical market cap — a real approximation, since share
 *      counts drift (buybacks/issuance/dilution). Equal-weight math only needs
 *      PRICE (price / basePrice), so that entire approximation is gone. This
 *      backfill is now an EXACT reconstruction from real historical closes,
 *      not an estimate.
 *   2. No backward pass. The old script anchored the divisor at
 *      INDEX_BASE_DATE and had to walk backward through the lookback window to
 *      fill in "before launch" history, holding the divisor fixed. Since the
 *      base date is now the START of the window (one year back) rather than
 *      the END, everything is a single FORWARD pass: base date = 100, and each
 *      later date is that ticker's own cumulative return on its fixed
 *      base-date allocation.
 *
 * For each tracked ticker it fetches ~1 year of daily closes (yahoo-finance2
 * historical chart) starting from INDEX_BASE_DATE. A ticker without a close on
 * or before INDEX_BASE_DATE (e.g. SPCX, which IPO'd after that date) enters the
 * index on ITS first available close, at that point getting its own equal
 * slice sized so the index value doesn't jump (same continuity rule as a
 * live float-on).
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

// Fetch from a little before INDEX_BASE_DATE through today, so the base date
// itself is guaranteed to be inside the returned window even accounting for
// weekends/holidays right at the boundary.
const FETCH_FROM = new Date(new Date(INDEX_BASE_DATE).getTime() - 10 * 24 * 60 * 60 * 1000);

// ─── Fetch 1y+ daily closes per ticker (no share counts needed) ───────────────
async function loadTicker(ticker) {
  let series = []; // [{ date: 'YYYY-MM-DD', close }]
  try {
    const chart = await yahooFinance.chart(ticker, {
      period1: FETCH_FROM,
      period2: new Date(),
      interval: '1d',
    });
    series = (chart.quotes ?? [])
      .filter((q) => q.date && q.close != null)
      .map((q) => ({ date: new Date(q.date).toISOString().split('T')[0], close: q.close }));
  } catch (err) {
    console.warn(`  [warn] ${ticker}: chart failed — ${err.message}`);
  }
  return { ticker, series };
}

async function main() {
  console.log(`[backfill] Starting index backfill — ${new Date().toISOString()}`);
  console.log(`[backfill] Base date ${INDEX_BASE_DATE} · equal-weight, buy-and-hold, exact reconstruction from real closes`);

  // Load every ticker (sequential — gentle on Yahoo, this runs once).
  const loaded = {};
  for (const t of ALL_TICKERS) {
    loaded[t] = await loadTicker(t);
    console.log(`  ${t}: ${loaded[t].series.length} daily closes`);
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

  // Master trading-date list = sorted union of all dates seen, restricted to
  // INDEX_BASE_DATE forward (equal-weight has nothing "before base" — the base
  // date IS day one).
  const dateSet = new Set();
  for (const t of ALL_TICKERS) {
    for (const d of closeByDate[t].keys()) {
      if (d >= INDEX_BASE_DATE) dateSet.add(d);
    }
  }
  const dates = Array.from(dateSet).sort();
  console.log(`[backfill] ${dates.length} trading dates from ${INDEX_BASE_DATE} forward`);

  const historyRows = [];
  const constituentRows = [];

  // Iterate each index independently, carrying its per-ticker basePrice/
  // baseAllocation state forward. Single FORWARD pass — no backward pass, no
  // divisor. Each date's computeIndexValue call resolves any not-yet-based
  // ticker (first-ever appearance for this index, whether at the base date or
  // a later float-on / late-IPO entry) and the base is then carried forward by
  // hand into `state` for the next date's call.
  for (const indexName of INDEX_NAMES) {
    const members = tickersForIndex(indexName);
    const state = {}; // ticker → { basePrice, baseAllocation }, persists across dates

    let rowsForIndex = 0;
    for (const date of dates) {
      const constituents = members
        .filter((t) => isEligible(t, date) && closeByDate[t].has(date))
        .map((t) => ({
          ticker: t,
          price: closeByDate[t].get(date),
          prevClose: prevCloseAt[t].get(date) ?? 0,
          basePrice: state[t]?.basePrice ?? null,
          baseAllocation: state[t]?.baseAllocation ?? null,
        }));

      if (constituents.length === 0) continue;

      const comp = computeIndexValue(constituents);

      // Persist any newly-established base forward for next iteration.
      for (const c of comp.perTickerContribution) {
        if (!state[c.ticker]) {
          state[c.ticker] = { basePrice: c.basePrice, baseAllocation: c.baseAllocation };
        }
      }

      historyRows.push({
        date,
        index_name: indexName,
        value: comp.value,
        divisor: comp.totalBaseAllocation, // diagnostic only — see indexCalc.mjs header
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
          base_price: c.basePrice,
          base_allocation: c.baseAllocation,
        });
      }
      rowsForIndex++;
    }

    console.log(`[backfill] ${indexName}: ${rowsForIndex} daily rows (${dates[0]} → ${dates[dates.length - 1]})`);
  }

  // Completeness check: which of the tracked tickers actually made it into the
  // composite's most recent constituent rows? A chart-fetch failure for any
  // ticker silently drops it from every index it belongs to (see the per-
  // ticker [warn] lines above).
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
