/**
 * scripts/indexCalc.mjs
 *
 * Daily AI Index close writer for InvestAI.
 * Fetches live prices for the full tracked universe (yahoo-finance2, same as
 * api/prices.ts — runs server-side in the GitHub Action, NOT through the Vercel
 * endpoint), computes the composite index + 5 sub-indices with market-cap
 * weighting, and upserts one row per index into index_history plus one row per
 * ticker into index_constituents for the day.
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

// Mirrors src/lib/indexCalc.ts INDEX_BASE_DATE. The date the divisor is
// anchored so value === 100 — NOT just "whatever the first backfilled date
// happens to be" (that was the July 30 2026 bug: the backfill previously
// seeded divisor=null on the first date in its trailing-365-day window,
// silently rebasing "100" to a year before launch).
export const INDEX_BASE_DATE = '2026-07-31';

// ─── "Float on" — introduction month per ticker ───────────────────────────────
// A ticker enters the index at the first available close AFTER the month it was
// introduced to the app. Tickers absent from this map are eligible immediately.
//
// July 30 2026 (per Jared): the 20 July-28-expansion names were previously
// gated to '2026-07' (eligible from Aug 1, 2026 — one day after
// INDEX_BASE_DATE). That meant NONE of them were ever eligible during the
// full 1-year backfill window (which ends before Aug 1) or on any date the
// live index calc would run before Aug 1 — so the backfilled history and
// composite were silently stuck at the old 31-ticker universe, and the LIVE
// client-side calc (src/lib/indexCalc.ts, which does not apply this gate at
// all) counted all 50, causing a large live-vs-history value mismatch and an
// inflated apparent NVDA weight in the reduced 31-name backfilled set.
// Per Jared: he wants all 50 tracked tickers included NOW, not gradually —
// intro-month gate removed for all 20 names below the map stays here (empty)
// as the pattern for any FUTURE universe expansion.
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
export function computeIndexValue(constituents, prevDivisor) {
  const valid = constituents.filter((c) => c.price > 0 && c.sharesOutstanding > 0);
  const capOf = (c) => c.price * c.sharesOutstanding;

  const totalMarketCap = valid.reduce((s, c) => s + capOf(c), 0);

  const basis = valid.filter((c) => !c.isNewEntrant && c.prevClose > 0);
  const basisNow = basis.reduce((s, c) => s + capOf(c), 0);
  const basisPrev = basis.reduce((s, c) => s + c.prevClose * c.sharesOutstanding, 0);
  const dayChangePct = basisPrev > 0 ? ((basisNow - basisPrev) / basisPrev) * 100 : 0;

  let divisor;
  if (prevDivisor == null || prevDivisor <= 0) {
    divisor = totalMarketCap > 0 ? totalMarketCap / INDEX_BASE_VALUE : 1;
  } else {
    const newCaps = valid.filter((c) => c.isNewEntrant).reduce((s, c) => s + capOf(c), 0);
    if (newCaps > 0) {
      const mcBefore = totalMarketCap - newCaps;
      divisor = mcBefore > 0 ? prevDivisor * (totalMarketCap / mcBefore) : prevDivisor;
    } else {
      divisor = prevDivisor;
    }
  }

  const value = divisor > 0 ? totalMarketCap / divisor : INDEX_BASE_VALUE;

  const perTickerContribution = valid
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

// ─── Supabase ─────────────────────────────────────────────────────────────────
// Created inside main() (not at module load) so importing this file for its
// pure helpers — e.g. from scripts/indexBackfill.mjs — has zero side effects
// and needs no env vars.

function todayISODate() {
  return new Date().toISOString().split('T')[0];
}

// Fetch one quote, tolerant of missing fields.
async function fetchQuote(ticker) {
  try {
    const q = await yahooFinance.quote(ticker);
    const price = q.regularMarketPrice ?? 0;
    const change = q.regularMarketChange ?? 0;
    let prevClose = q.regularMarketPreviousClose;
    if (prevClose == null) prevClose = price - change;
    let shares = q.sharesOutstanding;
    if ((shares == null || shares <= 0) && q.marketCap && price > 0) {
      shares = q.marketCap / price;
    }
    return { ticker, price, prevClose: prevClose ?? 0, sharesOutstanding: shares ?? 0 };
  } catch (err) {
    console.warn(`  [warn] ${ticker}: quote failed — ${err.message}`);
    return { ticker, price: 0, prevClose: 0, sharesOutstanding: 0 };
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

  // Latest prior row + constituent set per index (for divisor continuity and
  // new-entrant detection).
  const { data: prevHistory, error: histErr } = await supabase
    .from('index_history')
    .select('index_name, divisor, date')
    .order('date', { ascending: false })
    .limit(INDEX_NAMES.length * 3);
  if (histErr) {
    console.error('[index] Failed to read prior index_history:', histErr.message);
    process.exitCode = 1;
    return;
  }
  const prevRowByIndex = {};
  for (const row of prevHistory ?? []) {
    if (!prevRowByIndex[row.index_name]) prevRowByIndex[row.index_name] = row;
  }

  const historyRows = [];
  const constituentRows = [];

  for (const indexName of INDEX_NAMES) {
    const prevRow = prevRowByIndex[indexName] ?? null;
    const hasPrev = prevRow != null;

    // Which tickers were in this index on its previous stored date?
    let prevSet = new Set();
    if (hasPrev) {
      const { data: prevCons } = await supabase
        .from('index_constituents')
        .select('ticker')
        .eq('index_name', indexName)
        .eq('date', prevRow.date);
      prevSet = new Set((prevCons ?? []).map((r) => r.ticker));
    }

    const constituents = tickersForIndex(indexName)
      .filter((t) => isEligible(t, runDate) && quotes[t].price > 0 && quotes[t].sharesOutstanding > 0)
      .map((t) => ({
        ...quotes[t],
        // Only meaningful once a prior row exists; on the base date nobody is a
        // "new entrant" (there is no before-state).
        isNewEntrant: hasPrev && !prevSet.has(t),
      }));

    if (constituents.length === 0) {
      console.warn(`[index] ${indexName}: no eligible priced constituents — skipping`);
      continue;
    }

    const comp = computeIndexValue(constituents, hasPrev ? prevRow.divisor : null);

    historyRows.push({
      date: runDate,
      index_name: indexName,
      value: comp.value,
      divisor: comp.divisor,
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
      });
    }

    console.log(
      `[index] ${indexName}: value ${comp.value.toFixed(2)} (${comp.dayChangePct >= 0 ? '+' : ''}${comp.dayChangePct.toFixed(2)}%), ` +
      `${constituents.length} constituents, divisor ${comp.divisor.toExponential(4)}`,
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
