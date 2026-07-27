/**
 * scripts/newswire.mjs
 *
 * Daily morning newswire for InvestAI.
 * Fetches Yahoo Finance RSS headlines for each of the 31 tickers,
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

  // Build one task per ticker, then drain with a concurrency cap
  const tasks = TICKERS.map(({ ticker, sector }) => async () => {
    const rssItems = await fetchRssForTicker(ticker);
    console.log(`  ${ticker}: ${rssItems.length} item(s) in last 24h`);

    for (const item of rssItems) {
      const publishedAt = item.pubDate ? new Date(item.pubDate) : null;
      allItems.push({
        ticker,
        sector,
        headline:  item.title.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim(),
        summary:   '',            // no Claude call — summary left blank
        sentiment: 'neutral',     // neutral for all RSS-sourced items
        url:       item.link.trim(),
        run_date:  runDate,
        published_at: publishedAt && !isNaN(publishedAt.getTime()) ? publishedAt.toISOString() : null,
      });
    }
  });

  await pLimit(tasks, CONCURRENCY);

  console.log(`[newswire] Total items to write: ${allItems.length}`);

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