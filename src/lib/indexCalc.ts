// ─── AI Index — pure calculation module ──────────────────────────────────────
// EQUAL-WEIGHT, buy-and-hold (no rebalancing) index math. NO I/O here — pure,
// unit-testable functions, mirroring the rankFrontPage() pattern in
// src/lib/newsRanking.ts (calc separated from fetch).
//
// One composite index across the full tracked universe + one sub-index per
// dashboard sector pill. Sub-index membership is PRIMARY sector only
// (ticker.sectors[0]) — crossover tags never place a ticker in a second
// sub-index. The composite includes every tracked ticker exactly once.
//
// July 31 2026 rewrite (per Jared): previously market-cap-weighted, which let
// SPCX's market cap dwarf the rest of the Space sub-index and dominate its
// value/day-change almost entirely. Equal-weight means every constituent gets
// an identical initial allocation at INDEX_BASE_DATE; from then on each
// ticker's OWN cumulative price return drives its slice of the index, and
// slices are never rebalanced back to equal — a big winner is allowed to grow
// its weight over time (true buy-and-hold behavior, same convention as an
// equal-weight ETF between reconstitution dates, except this index never
// reconstitutes).
//
//   index value = Σ_i  baseAllocation_i × (price_i(date) / basePrice_i)
//   baseAllocation_i = INDEX_BASE_VALUE / N   (N = constituent count at base)
//
// This replaces the old "divisor" (Σcap / divisor) entirely. A new entrant
// ("floats on") is folded in at its entry date by giving it its own
// baseAllocation sized so the index value is CONTINUOUS at the instant of
// entry (see computeIndexValue below) — same continuity principle as the old
// divisor recalculation, just applied per-ticker instead of via one shared
// divisor.
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

// Base date = one year back from the index's launch, so "1 year ago = 100,
// today shows the cumulative return since then" reads the way every standard
// index chart does. Previously this was pinned to the launch date itself
// (2026-07-31) with history computed BACKWARD from there, which made a
// year-ago value read as some sub-100 number instead of the intuitive 100 —
// that backward pass is now gone; everything is computed FORWARD from this
// date. History before this date is approximated (current share counts don't
// apply here anymore, but historical index membership/price-availability
// still does) — see the backfill script and the UI caveat text.
export const INDEX_BASE_DATE = '2025-07-31';

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
// Keep this map in sync with scripts/indexCalc.mjs's TICKER_INTRO_MONTH by
// hand (same duplication convention as TICKERS/COMPANY_ALIASES elsewhere).
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
  prevClose: number;
  // Base-date reference price for this ticker in this index. Established once
  // (on the ticker's first eligible date) and held fixed forever after —
  // that's what makes this "buy-and-hold, no rebalancing." Callers must look
  // this up from the previously stored PerTickerBase set and pass it in;
  // computeIndexValue treats a ticker with no prior base as entering today.
  basePrice: number | null;
  // This ticker's fixed initial allocation in index points (INDEX_BASE_VALUE / N
  // at whatever date it entered). Null on the very first computation for a
  // brand-new index (no prior state at all) — computeIndexValue seeds it.
  baseAllocation: number | null;
}

export interface PerTickerContribution {
  ticker: string;
  weightPct: number;        // this ticker's share of the index's value today
  dayChangePct: number;     // this ticker's own 1-day % move
  contributionPct: number;  // pp contributed to the index's day_change_pct
  basePrice: number;        // persisted forward unchanged once set
  baseAllocation: number;   // persisted forward unchanged once set
}

export interface IndexComputation {
  value: number;
  dayChangePct: number;
  perTickerContribution: PerTickerContribution[];
}

/**
 * Computes an equal-weight, buy-and-hold index value from its constituents.
 *
 * Each ticker's contribution = baseAllocation × (price / basePrice). A ticker
 * with basePrice/baseAllocation both null is entering the index right now: it
 * is assigned baseAllocation = INDEX_BASE_VALUE / N_at_entry (N = count of
 * constituents priced today), and basePrice = its price today — so its
 * contribution today is exactly its own baseAllocation (continuity: the index
 * value does not jump when a name floats on), and its subsequent contribution
 * tracks its OWN return from this entry point forward.
 *
 * On the very first-ever computation for an index (all tickers entering at
 * once, e.g. INDEX_BASE_DATE itself), every ticker gets baseAllocation =
 * INDEX_BASE_VALUE / N, so the summed index value is exactly INDEX_BASE_VALUE.
 */
export function computeIndexValue(
  constituents: IndexConstituentInput[],
): IndexComputation {
  const valid = constituents.filter((c) => c.price > 0);
  const n = valid.length;

  // Assign baseAllocation/basePrice to any ticker missing one (first-ever
  // appearance in this index, whether at genuine launch or a later float-on).
  const equalSlice = n > 0 ? INDEX_BASE_VALUE / n : 0;
  const resolved = valid.map((c) => {
    const hasBase = c.basePrice != null && c.basePrice > 0 && c.baseAllocation != null;
    return {
      ...c,
      basePrice: hasBase ? (c.basePrice as number) : c.price,
      baseAllocation: hasBase ? (c.baseAllocation as number) : equalSlice,
      isNewEntrant: !hasBase,
    };
  });

  const value = resolved.reduce(
    (sum, c) => sum + c.baseAllocation * (c.price / c.basePrice),
    0,
  );

  // Day-change basis: only constituents with a real prior close that were
  // already established (not just-entered today).
  const basis = resolved.filter((c) => !c.isNewEntrant && c.prevClose > 0);
  const basisNow = basis.reduce((s, c) => s + c.baseAllocation * (c.price / c.basePrice), 0);
  const basisPrev = basis.reduce((s, c) => s + c.baseAllocation * (c.prevClose / c.basePrice), 0);
  const dayChangePct = basisPrev > 0 ? ((basisNow - basisPrev) / basisPrev) * 100 : 0;

  const perTickerContribution: PerTickerContribution[] = resolved
    .map((c) => {
      const contribution = c.baseAllocation * (c.price / c.basePrice);
      const weightPct = value > 0 ? (contribution / value) * 100 : 0;
      const inBasis = !c.isNewEntrant && c.prevClose > 0;
      const own = inBasis ? ((c.price - c.prevClose) / c.prevClose) * 100 : 0;
      const prevContribution = c.baseAllocation * (c.prevClose / c.basePrice);
      const contributionPct = inBasis && basisPrev > 0
        ? ((prevContribution / basisPrev) * ((c.price - c.prevClose) / c.prevClose)) * 100
        : 0;
      return {
        ticker: c.ticker,
        weightPct,
        dayChangePct: own,
        contributionPct,
        basePrice: c.basePrice,
        baseAllocation: c.baseAllocation,
      };
    })
    .sort((a, b) => b.weightPct - a.weightPct);

  return { value, dayChangePct, perTickerContribution };
}
