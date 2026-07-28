/**
 * scripts/newswire.mjs
 *
 * Daily morning newswire for InvestAI.
 * Fetches Yahoo Finance RSS headlines for each tracked ticker,
 * filters to the last 24 hours, and writes results to Supabase.
 *
 * Zero Claude API calls. Zero cost beyond Supabase writes.
 *
 * Run: node scripts/newswire.mjs
 * Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js';

// ─── Config ───────────────────────────────────────────────────────────────────

const TICKERS = [
  // Space
  { ticker: 'RKLB', sector: 'space' },
  { ticker: 'PL',   sector: 'space' },
  { ticker: 'RDW',  sector: 'space' },
  { ticker: 'LUNR', sector: 'space' },
  { ticker: 'ASTS', sector: 'space' },
  { ticker: 'KTOS', sector: 'space' },
  { ticker: 'BKSY', sector: 'space' },
  { ticker: 'FLY',  sector: 'space' },
  { ticker: 'SATS', sector: 'space' },
  // AI Infrastructure
  { ticker: 'NVDA', sector: 'ai_infrastructure' },
  { ticker: 'PLTR', sector: 'ai_infrastructure' },
  { ticker: 'CRWV', sector: 'ai_infrastructure' },
  { ticker: 'IREN', sector: 'ai_infrastructure' },
  { ticker: 'NBIS', sector: 'ai_infrastructure' },
  { ticker: 'CIFR', sector: 'ai_infrastructure' },
  { ticker: 'RIOT', sector: 'ai_infrastructure' },
  { ticker: 'VRT',  sector: 'ai_infrastructure' },
  { ticker: 'MOD',  sector: 'ai_infrastructure' },
  // Clean Energy / Nuclear
  { ticker: 'CEG',  sector: 'clean_energy' },
  { ticker: 'VST',  sector: 'clean_energy' },
  { ticker: 'BWXT', sector: 'clean_energy' },
  { ticker: 'GEV',  sector: 'clean_energy' },
  { ticker: 'BE',   sector: 'clean_energy' },
  { ticker: 'CCJ',  sector: 'clean_energy' },
  { ticker: 'LEU',  sector: 'clean_energy' },
  { ticker: 'NXE',  sector: 'clean_energy' },
  { ticker: 'OKLO', sector: 'clean_energy' },
  { ticker: 'NNE',  sector: 'clean_energy' },
  // Defense
  { ticker: 'LHX',  sector: 'defense' },
  { ticker: 'AVAV', sector: 'defense' },

  // Space (added in 31→50 expansion)
  { ticker: 'SPCX', sector: 'space' },

  // AI Infrastructure (added in 31→50 expansion)
  { ticker: 'MSFT', sector: 'ai_infrastructure' },
  { ticker: 'GOOGL', sector: 'ai_infrastructure' },
  { ticker: 'AMZN', sector: 'ai_infrastructure' },
  { ticker: 'META', sector: 'ai_infrastructure' },
  { ticker: 'ANET', sector: 'ai_infrastructure' },
  { ticker: 'MU', sector: 'ai_infrastructure' },
  { ticker: 'SMCI', sector: 'ai_infrastructure' },
  { ticker: 'AVGO', sector: 'ai_infrastructure' },
  { ticker: 'INTC', sector: 'ai_infrastructure' },
  { ticker: 'DELL', sector: 'ai_infrastructure' },
  { ticker: 'PWR', sector: 'ai_infrastructure' },
  { ticker: 'ETN', sector: 'ai_infrastructure' },
  { ticker: 'EQIX', sector: 'ai_infrastructure' },
  { ticker: 'GNRC', sector: 'ai_infrastructure' },

  // Cyber (added in 31→50 expansion)
  { ticker: 'CRWD', sector: 'cyber' },
  { ticker: 'PANW', sector: 'cyber' },
  { ticker: 'NET', sector: 'cyber' },
  { ticker: 'ZS', sector: 'cyber' },
  { ticker: 'FTNT', sector: 'cyber' },
];

// Fetch concurrently but cap parallelism to avoid overwhelming Yahoo
const CONCURRENCY = 6;

// Items older than this are discarded
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

// User-Agent required — without it Yahoo returns an HTML "will be right back" page
const USER_AGENT =
  'Mozilla/5.0 (compatible; InvestAI-Newswire/1.0; +https://portfolio-analysis-six.vercel.app)';

// ─── Supabase client ──────────────────────────────────────────────────────────

// Disable realtime — this script only does DB writes, never subscribes.
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { realtime: { enabled: false } },
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function todayISODate() {
  return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
}

/**
 * Minimal XML parser — extracts all <item> blocks from an RSS feed and returns
 * an array of { title, link, pubDate, description } objects.
 * Uses only native string operations; no npm deps required.
 */
function parseRssItems(xml) {
  const items = [];
  // Find every <item>…</item> block
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let itemMatch;
  while ((itemMatch = itemRe.exec(xml)) !== null) {
    const block = itemMatch[1];
    const get = (tag) => {
      // Match both <tag>content</tag> and CDATA: <tag><![CDATA[content]]></tag>
      const re = new RegExp(
        `<${tag}[^>]*>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([^<]*))<\\/${tag}>`,
        'i',
      );
      const m = re.exec(block);
      if (!m) return '';
      return (m[1] ?? m[2] ?? '').trim();
    };
    items.push({
      title:       get('title'),
      link:        get('link'),
      pubDate:     get('pubDate'),
      description: get('description'),
    });
  }
  return items;
}

// ─── Headline classification (heuristic, zero API cost) ──────────────────────
//
// Two independent signals:
//   1. Material-category patterns — if a headline matches one of these, it's
//      real news. This ALWAYS wins over the generic/domain signals below,
//      even if the source domain is a known content mill.
//   2. Generic/listicle patterns + known low-signal domains — if neither of
//      these fire and no material pattern matched, the item is left alone
//      (uncategorized but not flagged) rather than guessing wrong.

const MATERIAL_PATTERNS = [
  { category: 'earnings', re: /\b(q[1-4]|first|second|third|fourth)[\s-]?quarter\b.*\b(earnings|results|revenue)\b/i },
  { category: 'earnings', re: /\bearnings\s+(report|release|call)\b/i },
  { category: 'earnings', re: /\b(beats?|misses?|tops?)\s+(estimates|expectations|consensus)\b/i },
  { category: 'earnings', re: /\breports?\s+(quarterly|annual|q[1-4])\s+(results|earnings)\b/i },
  { category: 'guidance', re: /\b(raises|cuts|lowers|updates|withdraws|reaffirms)\s+(guidance|outlook|forecast)\b/i },
  { category: 'contract_partnership', re: /\b(awarded|wins|signs?)\b.*\b(contract|deal|agreement)\b/i },
  { category: 'contract_partnership', re: /\bpartners?\s+with\b/i },
  { category: 'contract_partnership', re: /\bstrikes?\s+(a\s+)?deal\b/i },
  { category: 'regulatory_legal', re: /\b(fda|sec|doj|ftc)\b.*\b(approv|clear|investigat|charg|fil)/i },
  { category: 'regulatory_legal', re: /\b(lawsuit|settlement|investigation|subpoena)\b/i },
  { category: 'regulatory_legal', re: /\bfiles?\s+(a\s+)?(lawsuit|complaint)\b/i },
  { category: 'ma_corporate', re: /\b(acquir(e|es|ed|ing|sition)|merger|buyout|to\s+be\s+acquired)\b/i },
  { category: 'ma_corporate', re: /\bspin[\s-]?off\b/i },
  { category: 'executive', re: /\b(names?|appoints?)\s+new\s+(ceo|cfo|coo|president)\b/i },
  { category: 'executive', re: /\bceo\b.*\b(resigns?|steps?\s+down|departs?)\b/i },
  { category: 'product_technology', re: /\bunveils?|\blaunches?\s+(new\s+)?(product|platform|service)\b/i },
  { category: 'analyst_rating_change', re: /\b(upgrades?|downgrades?)\b.*\b(rating|price\s+target)\b/i },
  { category: 'analyst_rating_change', re: /\b(raises?|cuts?)\s+price\s+target\b/i },
  { category: 'recall', re: /\brecall(s|ed|ing)?\b/i },
];

const GENERIC_HEADLINE_PATTERNS = [
  /^\d+\s+(top|best|hot|undervalued|overlooked|high-yield)\s+.*stocks?\b/i,
  /\bstocks?\s+to\s+(buy|watch|sell|avoid)\b/i,
  /^(is|should you buy|should you sell|why is)\b.*\bstock\b/i,
  /\bbest\s+ideas?\s+list\b/i,
  /\b(vs\.?|versus)\b.*\b(stock|which)\b/i,
  /\bwhich\s+(stock|is)\s+(a\s+)?better\b/i,
  /^here'?s\s+why\b/i,
  /\breasons?\s+to\s+(buy|sell|avoid)\b/i,
  /\bhigh-yield\s+dividend\s+stocks?\b/i,
  /\betf\s+(was\s+)?(built|designed)\s+to\b/i,
  /^\d+\s+stocks?\b.*\b(buy|hold|sell)\b/i,
  /\bdividend\s+stocks?\s+(with|for)\b/i,
];

// Known low-signal syndication sources. Soft signal only — checked after
// material patterns, and can still be overridden by a material match.
const GENERIC_SOURCE_DOMAINS = [
  'fool.com',
  'zacks.com',
  'insidermonkey.com',
  '247wallst.com',
  'simplywall.st',
  'gurufocus.com',
  'moneymorning.com',
];

// Company name aliases used to confirm a headline is actually about the
// ticker it was fetched under, not generic market-wrap content that Yahoo
// syndicates onto every symbol's page regardless of subject.
const COMPANY_ALIASES = {
  RKLB: ['rocket lab'],
  PL:   ['planet labs'],
  RDW:  ['redwire'],
  LUNR: ['intuitive machines'],
  ASTS: ['ast spacemobile'],
  KTOS: ['kratos'],
  BKSY: ['blacksky'],
  FLY:  ['firefly aerospace', 'firefly'],
  SATS: ['echostar'],
  NVDA: ['nvidia'],
  PLTR: ['palantir'],
  CRWV: ['coreweave'],
  IREN: ['iris energy'],
  NBIS: ['nebius'],
  CIFR: ['cipher mining'],
  RIOT: ['riot platforms'],
  VRT:  ['vertiv'],
  MOD:  ['modine'],
  CEG:  ['constellation energy'],
  VST:  ['vistra'],
  BWXT: ['bwx technologies'],
  GEV:  ['ge vernova'],
  BE:   ['bloom energy'],
  CCJ:  ['cameco'],
  LEU:  ['centrus energy'],
  NXE:  ['nexgen energy'],
  OKLO: ['oklo'],
  NNE:  ['nano nuclear'],
  LHX:  ['l3harris'],
  AVAV: ['aerovironment'],
  SPCX: ['spacex', 'space exploration technologies'],
  MSFT: ['microsoft'],
  GOOGL: ['alphabet', 'google'],
  AMZN: ['amazon'],
  META: ['meta platforms', 'facebook'],
  ANET: ['arista networks', 'arista'],
  MU:   ['micron'],
  SMCI: ['super micro', 'supermicro'],
  AVGO: ['broadcom'],
  INTC: ['intel'],
  DELL: ['dell technologies', 'dell'],
  PWR:  ['quanta services', 'quanta'],
  ETN:  ['eaton corporation', 'eaton'],
  EQIX: ['equinix'],
  GNRC: ['generac'],
  CRWD: ['crowdstrike'],
  PANW: ['palo alto networks'],
  NET:  ['cloudflare'],
  ZS:   ['zscaler'],
  FTNT: ['fortinet'],
};

/**
 * Confirms a headline actually references the given ticker's company —
 * either a known name alias (case-insensitive) or the ticker symbol itself
 * as a standalone, case-sensitive token (stock symbols are conventionally
 * kept uppercase in financial headlines even in title case, e.g. "Why NVDA,
 * SNDK, MU...", so case-sensitivity avoids false positives on short tickers
 * that are also common words, like BE).
 */
function isAboutTicker(title, ticker) {
  const lower = title.toLowerCase();
  const aliases = COMPANY_ALIASES[ticker] || [];
  if (aliases.some((alias) => lower.includes(alias))) return true;
  const symbolRe = new RegExp(`\\b${ticker}\\b`);
  return symbolRe.test(title);
}

function extractDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * Classifies a headline into { category, isGeneric }.
 * A material-pattern match always wins (category set, isGeneric false),
 * even over a generic-source domain. Otherwise, a generic headline pattern
 * or a known low-signal domain flags isGeneric true. If nothing matches
 * either way, the item passes through unflagged (category null, isGeneric
 * false) — we only drop items we're fairly confident are noise.
 */
function classifyHeadline(title, link, ticker) {
  const aboutTicker = isAboutTicker(title, ticker);

  for (const { category, re } of MATERIAL_PATTERNS) {
    if (re.test(title)) {
      // Material-sounding language only counts if it's actually about this
      // company — otherwise it's syndicated market-wrap content mis-tagged
      // to this ticker's feed (e.g. an unrelated company's "Q2 Earnings
      // Call Summary" appearing on this ticker's page).
      return aboutTicker
        ? { category, isGeneric: false }
        : { category: null, isGeneric: true };
    }
  }

  const domain = extractDomain(link);
  const genericByPattern = GENERIC_HEADLINE_PATTERNS.some((re) => re.test(title));
  const genericByDomain = GENERIC_SOURCE_DOMAINS.includes(domain);

  if (genericByPattern || genericByDomain) {
    return { category: null, isGeneric: true };
  }

  // No material or generic pattern matched. If the headline doesn't even
  // mention the company, treat it as unrelated syndicated content rather
  // than trusting the feed's ticker tag blindly.
  return { category: null, isGeneric: !aboutTicker };
}

/**
 * Fetches the Yahoo Finance RSS feed for one ticker and returns items
 * published within the last MAX_AGE_MS milliseconds.
 * Returns an empty array on any error (network, bad XML, etc.).
 */
async function fetchRssForTicker(ticker) {
  const url =
    `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${ticker}&region=US&lang=en-US`;

  let xml;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(10_000), // 10s timeout per feed
    });
    if (!res.ok) {
      console.warn(`  [warn] ${ticker}: HTTP ${res.status}`);
      return [];
    }
    xml = await res.text();
  } catch (err) {
    console.warn(`  [warn] ${ticker}: fetch failed — ${err.message}`);
    return [];
  }

  // Quick sanity check — Yahoo sometimes returns HTML on rate limit
  if (!xml.trim().startsWith('<?xml') && !xml.trim().startsWith('<rss')) {
    console.warn(`  [warn] ${ticker}: response was not XML (possible rate limit)`);
    return [];
  }

  const allItems = parseRssItems(xml);
  const cutoff   = Date.now() - MAX_AGE_MS;

  return allItems.filter((item) => {
    if (!item.title || !item.link) return false;
    const ts = item.pubDate ? new Date(item.pubDate).getTime() : 0;
    return ts >= cutoff;
  });
}

/**
 * Runs an array of async tasks with a max concurrency cap.
 * tasks: array of () => Promise<T>
 */
async function pLimit(tasks, concurrency) {
  const results = [];
  let index = 0;

  async function worker() {
    while (index < tasks.length) {
      const i = index++;
      results[i] = await tasks[i]();
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, worker);
  await Promise.all(workers);
  return results;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[newswire] Starting RSS run — ${new Date().toISOString()}`);

  const runDate  = todayISODate();
  const allItems = [];
  let genericCount = 0;

  // Build one task per ticker, then drain with a concurrency cap
  const tasks = TICKERS.map(({ ticker, sector }) => async () => {
    const rssItems = await fetchRssForTicker(ticker);
    console.log(`  ${ticker}: ${rssItems.length} item(s) in last 24h`);

    for (const item of rssItems) {
      const publishedAt = item.pubDate ? new Date(item.pubDate) : null;
      const cleanHeadline = item.title.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
      const { category, isGeneric } = classifyHeadline(cleanHeadline, item.link, ticker);
      if (isGeneric) genericCount++;
      allItems.push({
        ticker,
        sector,
        headline:  cleanHeadline,
        summary:   '',            // no Claude call — summary left blank
        sentiment: 'neutral',     // neutral for all RSS-sourced items
        url:       item.link.trim(),
        run_date:  runDate,
        published_at: publishedAt && !isNaN(publishedAt.getTime()) ? publishedAt.toISOString() : null,
        category,
        is_generic: isGeneric,
      });
    }
  });

  await pLimit(tasks, CONCURRENCY);

  console.log(`[newswire] Total items to write: ${allItems.length}`);
  console.log(`[newswire] Flagged ${genericCount} generic/listicle item(s) out of ${allItems.length}`);

  if (allItems.length === 0) {
    console.log('[newswire] No news in last 24h — nothing to write. Done.');
    return;
  }

  // Upsert into Supabase.
  // The unique constraint on (ticker, run_date) prevents duplicate rows on re-runs,
  // but since one ticker can have multiple headlines on the same day we need a
  // finer-grained key. We use (ticker, url) as the true uniqueness signal;
  // run_date is still stored for the "latest run" query in useNewswire.ts.
  //
  // If your table currently has a unique constraint on (ticker, run_date) that
  // prevents multiple rows per ticker per day, you will need to drop that
  // constraint and add one on (ticker, url) instead.  See the migration file.
  //
  // For now we insert in pages of 50 and ignore duplicates so the script is
  // safe to re-run even before the constraint is updated.
  const PAGE = 50;
  let succeededCount = 0;
  let failedPages    = 0;
  const writeErrors  = [];

  for (let i = 0; i < allItems.length; i += PAGE) {
    const page = allItems.slice(i, i + PAGE);
    const { error } = await supabase
      .from('newswire_items')
      .upsert(page, { onConflict: 'ticker,url', ignoreDuplicates: true });

    if (error) {
      failedPages += 1;
      writeErrors.push(`page ${Math.floor(i / PAGE) + 1}: ${error.message}`);
      console.error(`[newswire] Supabase write failed (page ${Math.floor(i / PAGE) + 1}):`, error.message);
      // Continue attempting remaining pages rather than hard-failing mid-run,
      // but we no longer report success at the end if anything failed.
    } else {
      succeededCount += page.length;
    }
  }

  if (failedPages > 0) {
    console.error(
      `[newswire] ✗ ${failedPages} page(s) failed to write (${succeededCount}/${allItems.length} items ` +
      `actually written for ${runDate}). Errors:\n  ${writeErrors.join('\n  ')}`
    );
    console.error('[newswire] Exiting with failure so this shows up as a failed run, not a false green check.');
    process.exitCode = 1;
    return;
  }

  console.log(`[newswire] ✓ Wrote ${succeededCount} items to Supabase for ${runDate}`);
  console.log('[newswire] Done.');
}

main().catch((err) => {
  console.error('[newswire] Fatal error:', err);
  process.exit(1);
});