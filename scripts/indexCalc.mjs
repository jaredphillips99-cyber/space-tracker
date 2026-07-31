/**
 * scripts/indexCalc.mjs
 *
 * Daily AI Index close writer for InvestAI.
 * Fetches live prices for the full tracked universe (yahoo-finance2, same as
 * api/prices.ts — runs server-side in the GitHub Action, NOT through the Vercel
 * endpoint), computes the composite index + 5 sub-indices with EQUAL-WEIGHT,
 * buy-and-hold math, and upserts one row per index into index_history plus one
 * row per ticker into index_constituents for the day.
 *
 * Zero Claude API calls. Zero cost beyond Supabase writes. Needs no
 * ANTHROPIC_API_KEY — only SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 *
 * Run once per day (post-market). The Daily Newswire workflow gates this step
 * to its 5pm-ET (21:00 UTC) leg only — the index is a single daily close value,
 * not two.
 *
 *   node scripts/indexCalc.mjs
 *
 * The membership map + computeIndexValue math below DUPLICATE src/lib/indexCalc.ts
 * (plain .mjs cannot import the .ts module — same convention as TICKERS /
 * COMPANY_ALIASES in scripts/newswire.mjs). Keep the two copies in sync.
 *
 * ─── July 31 2026 rewrite (per Jared) ─────────────────────────────────────────
 * Two changes, both driven by the same conversation:
 *   1. EQUAL-WEIGHT, no rebalancing (was market-cap-weighted). SPCX's market
 *      cap dwarfed the rest of Space and dominated that sub-index almost
 *      entirely — every index now gives each constituent an identical initial
 *      allocation and lets it drift with its OWN price return afterward
 *      (never rebalanced back to equal — true buy-and-hold, same convention
 *      as an equal-weight ETF between reconstitution dates, except this index
 *      never reconstitutes).
 *   2. INDEX_BASE_DATE moved from the launch date (2026-07-31, "today") to one
 *      year back (2025-07-31), and history is now computed FORWARD ONLY from
 *      that date. Previously the base was pinned to launch and a backward pass
 *      filled in history, so "1 year ago" read as some sub-100 number instead
 *      of the standard "started at 100." That backward pass is gone.
 *   3. `divisor` is gone from the math (replaced by per-ticker basePrice +
 *      baseAllocation, persisted in index_constituents). The index_history
 *      table's `divisor` numeric column is repurposed here to carry a
 *      per-index diagnostic (sum of baseAllocations, i.e. INDEX_BASE_VALUE by
 *      construction, or slightly above it once float-on entrants have added
 *      their own slice) rather than being dropped — no schema change needed.
 */

import { createClient } from '@supabase/supabase-js';
import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

// ─── Membership: ticker → PRIMARY dashboard sector (ticker.sectors[0]) ────────
// Mirrors src/config/tickers.ts sectors[0]. Crossover tags are intentionally
// omitted — a ticker belongs to exactly ONE sub-index (its primary), and to the
// composite once.
const PRIMARY_SECTOR = {
  // Space
  RKLB: 'space', PL: 'space', RDW: 'space', LUNR: 'space', ASTS: 'space',
  BKSY: 'space', FLY: 'space', SATS: 'space', SPCX: 'space',
  // Defense
  KTOS: 'defense', LHX: 'defense', AVAV: 'defense',
  // AI Infrastructure
  NVDA: 'ai_infrastructure', PLTR: 'ai_infrastructure', CRWV: 'ai_infrastructure',
  IREN: 'ai_infrastructure', NBIS: 'ai_infrastructure', CIFR: 'ai_infrastructure',
  RIOT: 'ai_infrastructure', VRT: 'ai_infrastructure', MOD: 'ai_infrastructure',
  MSFT: 'ai_infrastructure', GOOGL: 'ai_infrastructure', AMZN: 'ai_infrastructure',
  META: 'ai_infrastructure', ANET: 'ai_infrastructure', MU: 'ai_infrastructure',
  SMCI: 'ai_infrastructure', AVGO: 'ai_infrastructure', INTC: 'ai_infrastructure',
  DELL: 'ai_infrastructure', PWR: 'ai_infrastructure', ETN: 'ai_infrastructure',
  EQIX: 'ai_infrastructure', GNRC: 'ai_infrastructure',
  // Clean Energy / Nuclear
  CEG: 'clean_energy', VST: 'clean_energy', BWXT: 'clean_energy', GEV: 'clean_energy',
  BE: 'clean_energy', CCJ: 'clean_energy', LEU: 'clean_energy', NXE: 'clean_energy',
  OKLO: 'clean_energy', NNE: 'clean_energy',
  // Cyber
  CRWD: 'cyber', PANW: 'cyber', NET: 'cyber', ZS: 'cyber', FTNT: 'cyber',
};

export { PRIMARY_SECTOR };
export const ALL_TICKERS = Object.keys(PRIMARY_SECTOR);
export const SUB_INDEX_NAMES = ['space', 'ai_infrastructure', 'defense', 'clean_energy', 'cyber'];
export const INDEX_NAMES = ['composite', ...SUB_INDEX_NAMES];

export const INDEX_BASE_VALUE = 100;

// Mirrors src/lib/indexCalc.ts INDEX_BASE_DATE. One year back from launch, so
// "1 year ago = 100" reads the standard way. Computed FORWARD ONLY from here —
// no more backward pass (see file header).
export const INDEX_BASE_DATE = '2025-07-31';

// ─── "Float on" — introduction month per ticker ───────────────────────────────
// A ticker enters the index at the first available close AFTER the month it was
// introduced to the app. Tickers absent from this map are eligible immediately.
const TICKER_INTRO_MONTH = {
  // (none currently — add 'TICKER: "YYYY-MM"' entries on the next universe
  // expansion to float a new name on starting the following month)
};

/** First calendar date (UTC) a ticker becomes eligible: 1st of the month AFTER
 *  its introduction month. Null when the ticker has no intro (present at base). */
function eligibleFrom(ticker) {
  const intro = TICKER_INTRO_MONTH[ticker];
  if (!intro) return null;
  const [y, m] = intro.split('-').map(Number); // m is 1-based; Date month index m === next month
  return new Date(Date.UTC(y, m, 1));
}

export function isEligible(ticker, dateStr) {
  const from = eligibleFrom(ticker);
  if (!from) return true;
  return new Date(dateStr) >= from;
}

export function tickersForIndex(indexName) {
  if (indexName === 'composite') return ALL_TICKERS;
  return ALL_TICKERS.filter((t) => PRIMARY_SECTOR[t] === indexName);
}

// ─── computeIndexValue — mirror of src/lib/indexCalc.ts ───────────────────────
// EQUAL-WEIGHT, buy-and-hold. Each constituent's contribution =
// baseAllocation × (price / basePrice). A constituent with no prior
// basePrice/baseAllocation is entering right now: it is seeded with
// baseAllocation = INDEX_BASE_VALUE / N (N = constituents priced today) and
// basePrice = today's price, so its contribution today equals exactly its own
// slice (index value doesn't jump on entry), and its contribution going
// forward tracks its OWN return from this entry point. baseAllocation/
// basePrice are NEVER changed once set — that's what makes this "no
// rebalancing": a big winner's weight is allowed to drift upward over time.
export function computeIndexValue(constituents) {
  const valid = constituents.filter((c) => c.price > 0);
  const n = valid.length;
  const equalSlice = n > 0 ? INDEX_BASE_VALUE / n : 0;

  const resolved = valid.map((c) => {
    const hasBase = c.basePrice != null && c.basePrice > 0 && c.baseAllocation != null;
    return {
      ...c,
      basePrice: hasBase ? c.basePrice : c.price,
      baseAllocation: hasBase ? c.baseAllocation : equalSlice,
      isNewEntrant: !hasBase,
    };
  });

  const value = resolved.reduce((s, c) => s + c.baseAllocation * (c.price / c.basePrice), 0);

  const basis = resolved.filter((c) => !c.isNewEntrant && c.prevClose > 0);
  const basisNow = basis.reduce((s, c) => s + c.baseAllocation * (c.price / c.basePrice), 0);
  const basisPrev = basis.reduce((s, c) => s + c.baseAllocation * (c.prevClose / c.basePrice), 0);
  const dayChangePct = basisPrev > 0 ? ((basisNow - basisPrev) / basisPrev) * 100 : 0;

  const perTickerContribution = resolved
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

  // Sum of baseAllocations is a useful per-index diagnostic (starts at exactly
  // INDEX_BASE_VALUE, ticks up slightly whenever a float-on entrant adds its
  // own slice) — persisted into index_history's existing `divisor` column so
  // no schema change is needed. Purely diagnostic; never used to compute value.
  const totalBaseAllocation = resolved.reduce((s, c) => s + c.baseAllocation, 0);

  return { value, dayChangePct, perTickerContribution, totalBaseAllocation };
}

// ─── Supabase ─────────────────────────────────────────────────────────────────
// Created inside main() (not at module load) so importing this file for its
// pure helpers — e.g. from scripts/indexBackfill.mjs — has zero side effects
// and needs no env vars.

function todayISODate() {
  return new Date().toISOString().split('T')[0];
}

// Fallback share-count resolver — kept for prior callers/compatibility, but no
// longer used by computeIndexValue (equal-weight needs no share counts at
// all). Still exported/used by fetchQuote below only to log a friendlier
// warning when Yahoo omits pricing data outright; NOT part of the weighting
// math anymore.
export async function sharesFromQuoteSummary(yf, ticker) {
  try {
    const s = await yf.quoteSummary(
      ticker,
      { modules: ['defaultKeyStatistics', 'price'] },
      { validateResult: false },
    );
    const dks = s?.defaultKeyStatistics ?? {};
    if (dks.sharesOutstanding > 0) return dks.sharesOutstanding;
    const mcap = s?.price?.marketCap;
    const px = s?.price?.regularMarketPrice;
    if (mcap > 0 && px > 0) return mcap / px;
    if (dks.floatShares > 0) return dks.floatShares;
  } catch {
    // best-effort only; equal-weight math doesn't depend on this
  }
  return 0;
}

// Fetch one quote, tolerant of missing fields. sharesOutstanding is no longer
// needed for the index math (equal-weight uses price only) but is still read
// where available since api/prices.ts and the rest of the app use it.
async function fetchQuote(ticker) {
  try {
    const q = await yahooFinance.quote(ticker);
    const price = q.regularMarketPrice ?? 0;
    const change = q.regularMarketChange ?? 0;
    let prevClose = q.regularMarketPreviousClose;
    if (prevClose == null) prevClose = price - change;
    return { ticker, price, prevClose: prevClose ?? 0 };
  } catch (err) {
    console.warn(`  [warn] ${ticker}: quote failed — ${err.message}`);
    return { ticker, price: 0, prevClose: 0 };
  }
}

async function main() {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { realtime: { enabled: false } },
  );

  const runDate = todayISODate();
  console.log(`[index] Starting index calc — ${new Date().toISOString()} (runDate ${runDate})`);

  // Fetch all quotes.
  const quotes = {};
  for (const t of ALL_TICKERS) {
    quotes[t] = await fetchQuote(t);
  }
  const priced = Object.values(quotes).filter((q) => q.price > 0).length;
  console.log(`[index] Fetched ${priced}/${ALL_TICKERS.length} priced quotes`);

  // Most recent per-ticker basePrice/baseAllocation, per index — this is now
  // the persistent state that replaces the old shared divisor. Pulled from the
  // latest stored index_constituents row per (index_name, ticker).
  const { data: prevConstituents, error: consErr } = await supabase
    .from('index_constituents')
    .select('index_name, ticker, base_price, base_allocation, date')
    .order('date', { ascending: false })
    .limit(ALL_TICKERS.length * INDEX_NAMES.length * 3);
  if (consErr) {
    console.error('[index] Failed to read prior index_constituents:', consErr.message);
    process.exitCode = 1;
    return;
  }
  const prevBaseByIndexTicker = {}; // `${indexName}::${ticker}` → { base_price, base_allocation }
  for (const row of prevConstituents ?? []) {
    const key = `${row.index_name}::${row.ticker}`;
    if (!prevBaseByIndexTicker[key] && row.base_price != null && row.base_allocation != null) {
      prevBaseByIndexTicker[key] = { basePrice: row.base_price, baseAllocation: row.base_allocation };
    }
  }

  const historyRows = [];
  const constituentRows = [];

  for (const indexName of INDEX_NAMES) {
    const constituents = tickersForIndex(indexName)
      .filter((t) => isEligible(t, runDate) && quotes[t].price > 0)
      .map((t) => {
        const prior = prevBaseByIndexTicker[`${indexName}::${t}`] ?? null;
        return {
          ticker: t,
          price: quotes[t].price,
          prevClose: quotes[t].prevClose,
          basePrice: prior?.basePrice ?? null,
          baseAllocation: prior?.baseAllocation ?? null,
        };
      });

    if (constituents.length === 0) {
      console.warn(`[index] ${indexName}: no eligible priced constituents — skipping`);
      continue;
    }

    const comp = computeIndexValue(constituents);

    historyRows.push({
      date: runDate,
      index_name: indexName,
      value: comp.value,
      divisor: comp.totalBaseAllocation, // diagnostic only, see file header
      day_change_pct: comp.dayChangePct,
    });

    for (const c of comp.perTickerContribution) {
      constituentRows.push({
        date: runDate,
        index_name: indexName,
        ticker: c.ticker,
        weight_pct: c.weightPct,
        day_change_pct: c.dayChangePct,
        contribution_pct: c.contributionPct,
        base_price: c.basePrice,
        base_allocation: c.baseAllocation,
      });
    }

    console.log(
      `[index] ${indexName}: value ${comp.value.toFixed(2)} (${comp.dayChangePct >= 0 ? '+' : ''}${comp.dayChangePct.toFixed(2)}%), ` +
      `${constituents.length} constituents`,
    );
  }

  // Upsert (idempotent on the primary keys — safe to re-run same day).
  const { error: hErr } = await supabase
    .from('index_history')
    .upsert(historyRows, { onConflict: 'date,index_name' });
  if (hErr) {
    console.error('[index] index_history write failed:', hErr.message);
    process.exitCode = 1;
    return;
  }

  const PAGE = 200;
  for (let i = 0; i < constituentRows.length; i += PAGE) {
    const page = constituentRows.slice(i, i + PAGE);
    const { error: cErr } = await supabase
      .from('index_constituents')
      .upsert(page, { onConflict: 'date,index_name,ticker' });
    if (cErr) {
      console.error(`[index] index_constituents write failed (page ${Math.floor(i / PAGE) + 1}):`, cErr.message);
      process.exitCode = 1;
      return;
    }
  }

  // Completeness check — surfaces a silent quote-failure drop immediately in
  // the Action log instead of only being discoverable via the UI later.
  const compositeTickers = new Set(
    constituentRows.filter((r) => r.index_name === 'composite').map((r) => r.ticker),
  );
  const missing = ALL_TICKERS.filter((t) => !compositeTickers.has(t));
  console.log(`[index] Composite completeness: ${compositeTickers.size}/${ALL_TICKERS.length} tracked tickers present.`);
  if (missing.length > 0) {
    console.warn(`[index] ⚠ MISSING from composite: ${missing.join(', ')} — check the [warn] lines above for why.`);
  }

  console.log(`[index] ✓ Wrote ${historyRows.length} index rows + ${constituentRows.length} constituent rows for ${runDate}`);
  console.log('[index] Done.');
}

// Only run the daily job when invoked directly (not when imported by
// scripts/indexBackfill.mjs, which reuses the exported helpers above).
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('[index] Fatal error:', err);
    process.exit(1);
  });
}
