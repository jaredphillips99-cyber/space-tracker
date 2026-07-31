// ─── AI Index — pure calculation module ──────────────────────────────────────
// Market-cap-weighted (uncapped, free-float principle, same as the S&P 500)
// index math. NO I/O here — pure, unit-testable functions, mirroring the
// rankFrontPage() pattern in src/lib/newsRanking.ts (calc separated from fetch).
//
// One composite index across the full tracked universe + one sub-index per
// dashboard sector pill. Sub-index membership is PRIMARY sector only
// (ticker.sectors[0]) — crossover tags never place a ticker in a second
// sub-index. The composite includes every tracked ticker exactly once.
//
// index value = Σ(price × sharesOutstanding) / divisor
// The divisor absorbs constituent changes so the value never jumps when a
// ticker floats on. Base = 100 on INDEX_BASE_DATE.
//
// The daily persistence script (scripts/indexCalc.mjs) and the one-time
// backfill (scripts/indexBackfill.mjs) DUPLICATE this math rather than
// importing it — plain .mjs can't import .ts, the same convention already used
// for TICKERS / COMPANY_ALIASES in scripts/newswire.mjs. Keep the three copies
// in sync.
// ─────────────────────────────────────────────────────────────────────────────

import { TICKERS } from '../config/tickers';

export type IndexName =
  | 'composite'
  | 'space'
  | 'ai_infrastructure'
  | 'defense'
  | 'clean_energy'
  | 'cyber';

export const INDEX_NAMES: IndexName[] = [
  'composite',
  'space',
  'ai_infrastructure',
  'defense',
  'clean_energy',
  'cyber',
];

// The sub-index names are exactly the dashboard Sector values (from src/types).
export const SUB_INDEX_NAMES: IndexName[] = INDEX_NAMES.filter((n) => n !== 'composite');

export const INDEX_BASE_VALUE = 100;

// Base date = the feature's first daily cron write. History written before this
// date (via scripts/indexBackfill.mjs) is approximated — see the backfill
// script and the UI caveat text.
export const INDEX_BASE_DATE = '2026-07-31';

export const INDEX_DISPLAY: Record<IndexName, string> = {
  composite: 'AI Index',
  space: 'Space',
  ai_infrastructure: 'AI Infrastructure',
  defense: 'Defense',
  clean_energy: 'Clean Energy',
  cyber: 'Cyber',
};

// Composite accent = brand cyan; sub-indices reuse SECTOR_COLORS (single source
// of truth). Imported lazily by callers via SECTOR_COLORS; provided here only
// as a convenience for the composite, which has no Sector entry.
export const COMPOSITE_COLOR = '#00c8ff';

/**
 * Tickers belonging to an index, by PRIMARY sector (ticker.sectors[0]) only.
 * Composite = the full tracked universe. This is the single source of index
 * membership on the client; scripts/*.mjs duplicate the equivalent map.
 */
export function tickersForIndex(indexName: IndexName): string[] {
  if (indexName === 'composite') return TICKERS.map((t) => t.ticker);
  return TICKERS.filter((t) => t.sectors[0] === indexName).map((t) => t.ticker);
}

// ─── "Float on" eligibility — mirrors scripts/indexCalc.mjs ──────────────────
// July 30 2026 fix: the live client path previously had NO eligibility gate
// at all, while the daily cron / backfill scripts did — so a not-yet-eligible
// ticker (mid-float-on) would count in the live headline number but be absent
// from stored history, producing a live-vs-chart value mismatch. Keep this
// map in sync with scripts/indexCalc.mjs's TICKER_INTRO_MONTH by hand (same
// duplication convention as TICKERS/COMPANY_ALIASES elsewhere in the app).
const TICKER_INTRO_MONTH: Record<string, string> = {
  // (none currently)
};

function eligibleFrom(ticker: string): Date | null {
  const intro = TICKER_INTRO_MONTH[ticker];
  if (!intro) return null;
  const [y, m] = intro.split('-').map(Number);
  return new Date(Date.UTC(y, m, 1)); // m is 1-based; Date month index m === next month
}

export function isEligible(ticker: string, dateStr: string): boolean {
  const from = eligibleFrom(ticker);
  if (!from) return true;
  return new Date(dateStr) >= from;
}

/** tickersForIndex(), filtered to only tickers eligible as of today. Use this
 *  (not tickersForIndex directly) for any live/current-value computation. */
export function eligibleTickersForIndex(indexName: IndexName, todayISODate: string): string[] {
  return tickersForIndex(indexName).filter((t) => isEligible(t, todayISODate));
}

// ─── Calculation ──────────────────────────────────────────────────────────────

export interface IndexConstituentInput {
  ticker: string;
  price: number;
  sharesOutstanding: number;
  prevClose: number;
  // True when the ticker is entering the index this period ("floats on"): it is
  // counted in today's weight but EXCLUDED from the day-change basis (it has no
  // prior close within the index), and the divisor is recalculated so the index
  // value does not jump.
  isNewEntrant?: boolean;
}

export interface PerTickerContribution {
  ticker: string;
  weightPct: number;        // this ticker's weight in the index today
  dayChangePct: number;     // this ticker's own 1-day % move
  contributionPct: number;  // pp contributed to the index's day_change_pct
}

export interface IndexComputation {
  value: number;
  divisor: number;
  dayChangePct: number;
  totalMarketCap: number;
  perTickerContribution: PerTickerContribution[];
}

/**
 * Computes an index value from its constituents and the prior divisor.
 *
 * @param constituents live/close data per ticker
 * @param prevDivisor  the previous stored divisor, or null on the base date
 *                     (first-ever computation), where the divisor is seeded so
 *                     the value equals INDEX_BASE_VALUE (100).
 */
export function computeIndexValue(
  constituents: IndexConstituentInput[],
  prevDivisor: number | null,
): IndexComputation {
  const valid = constituents.filter((c) => c.price > 0 && c.sharesOutstanding > 0);
  const capOf = (c: IndexConstituentInput) => c.price * c.sharesOutstanding;

  const totalMarketCap = valid.reduce((s, c) => s + capOf(c), 0);

  // Day-change basis: only constituents with a real prior close that were
  // already in the index (not just-entered). This is divisor-independent.
  const basis = valid.filter((c) => !c.isNewEntrant && c.prevClose > 0);
  const basisNow = basis.reduce((s, c) => s + capOf(c), 0);
  const basisPrev = basis.reduce((s, c) => s + c.prevClose * c.sharesOutstanding, 0);
  const dayChangePct = basisPrev > 0 ? ((basisNow - basisPrev) / basisPrev) * 100 : 0;

  // Divisor.
  let divisor: number;
  if (prevDivisor == null || prevDivisor <= 0) {
    // Base date — seed so value === INDEX_BASE_VALUE.
    divisor = totalMarketCap > 0 ? totalMarketCap / INDEX_BASE_VALUE : 1;
  } else {
    const newCaps = valid
      .filter((c) => c.isNewEntrant)
      .reduce((s, c) => s + capOf(c), 0);
    if (newCaps > 0) {
      // Continuity adjustment: value must be unchanged at the instant of entry.
      //   value_before = mcBefore / D_old   (constituents present yesterday)
      //   value_after  = totalMC  / D_new   → D_new = D_old × totalMC / mcBefore
      const mcBefore = totalMarketCap - newCaps;
      divisor = mcBefore > 0 ? prevDivisor * (totalMarketCap / mcBefore) : prevDivisor;
    } else {
      divisor = prevDivisor;
    }
  }

  const value = divisor > 0 ? totalMarketCap / divisor : INDEX_BASE_VALUE;

  // Per-ticker contribution. contribution_i = prevWeight_i × ownDayChange_i,
  // which sums to dayChangePct across the basis set. New entrants contribute 0.
  const perTickerContribution: PerTickerContribution[] = valid
    .map((c) => {
      const cap = capOf(c);
      const weightPct = totalMarketCap > 0 ? (cap / totalMarketCap) * 100 : 0;
      const inBasis = !c.isNewEntrant && c.prevClose > 0;
      const own = inBasis ? ((c.price - c.prevClose) / c.prevClose) * 100 : 0;
      const prevWeight = basisPrev > 0 ? (c.prevClose * c.sharesOutstanding) / basisPrev : 0;
      const contributionPct = inBasis ? prevWeight * own : 0;
      return { ticker: c.ticker, weightPct, dayChangePct: own, contributionPct };
    })
    .sort((a, b) => b.weightPct - a.weightPct);

  return { value, divisor, dayChangePct, totalMarketCap, perTickerContribution };
}
