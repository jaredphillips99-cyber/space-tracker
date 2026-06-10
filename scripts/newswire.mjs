/**
 * scripts/newswire.mjs
 *
 * Daily morning newswire for InvestAI.
 * Batches 31 tickers into groups, asks Claude (with web search) for significant
 * news from the last 24 hours, and writes results to Supabase newswire_items table.
 *
 * Run: node scripts/newswire.mjs
 * Required env: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

// ─── Config ───────────────────────────────────────────────────────────────────

const TICKERS = [
  // Space
  { ticker: 'RKLB', name: 'Rocket Lab',          sector: 'space' },
  { ticker: 'PL',   name: 'Planet Labs',          sector: 'space' },
  { ticker: 'RDW',  name: 'Redwire',              sector: 'space' },
  { ticker: 'LUNR', name: 'Intuitive Machines',   sector: 'space' },
  { ticker: 'ASTS', name: 'AST SpaceMobile',      sector: 'space' },
  { ticker: 'KTOS', name: 'Kratos Defense',       sector: 'space' },
  { ticker: 'BKSY', name: 'BlackSky',             sector: 'space' },
  { ticker: 'FLY',  name: 'Firefly Aerospace',    sector: 'space' },
  { ticker: 'SATS', name: 'EchoStar',             sector: 'space' },
  // AI Infrastructure
  { ticker: 'NVDA', name: 'NVIDIA',               sector: 'ai_infrastructure' },
  { ticker: 'PLTR', name: 'Palantir',             sector: 'ai_infrastructure' },
  { ticker: 'CRWV', name: 'CoreWeave',            sector: 'ai_infrastructure' },
  { ticker: 'IREN', name: 'Iris Energy',          sector: 'ai_infrastructure' },
  { ticker: 'NBIS', name: 'Nebius Group',         sector: 'ai_infrastructure' },
  { ticker: 'CIFR', name: 'Cipher Mining',        sector: 'ai_infrastructure' },
  { ticker: 'RIOT', name: 'Riot Platforms',       sector: 'ai_infrastructure' },
  { ticker: 'VRT',  name: 'Vertiv',               sector: 'ai_infrastructure' },
  { ticker: 'MOD',  name: 'Modine',               sector: 'ai_infrastructure' },
  // Clean Energy / Nuclear
  { ticker: 'CEG',  name: 'Constellation Energy', sector: 'clean_energy' },
  { ticker: 'VST',  name: 'Vistra',               sector: 'clean_energy' },
  { ticker: 'BWXT', name: 'BWX Technologies',     sector: 'clean_energy' },
  { ticker: 'GEV',  name: 'GE Vernova',           sector: 'clean_energy' },
  { ticker: 'BE',   name: 'Bloom Energy',         sector: 'clean_energy' },
  { ticker: 'CCJ',  name: 'Cameco',               sector: 'clean_energy' },
  { ticker: 'LEU',  name: 'Centrus Energy',       sector: 'clean_energy' },
  { ticker: 'NXE',  name: 'NexGen Energy',        sector: 'clean_energy' },
  { ticker: 'OKLO', name: 'Oklo',                 sector: 'clean_energy' },
  { ticker: 'NNE',  name: 'Nano Nuclear',         sector: 'clean_energy' },
  // Defense
  { ticker: 'LHX',  name: 'L3Harris',             sector: 'defense' },
  { ticker: 'AVAV', name: 'AeroVironment',        sector: 'defense' },
];

const BATCH_SIZE = 8;
const DELAY_BETWEEN_BATCHES_MS = 3000; // avoid rate limit spikes

// ─── Clients ──────────────────────────────────────────────────────────────────

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY, // service role bypasses RLS for server writes
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function chunk(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

function todayISODate() {
  return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
}

// ─── Claude call for one batch ───────────────────────────────────────────────

async function fetchNewsForBatch(batch) {
  const tickerList = batch
    .map((t) => `${t.ticker} (${t.name})`)
    .join(', ');

  const prompt = `You are a financial news scanner for an investment research dashboard.

Search for significant news from the last 24 hours for each of these stocks: ${tickerList}

For each stock, look for: earnings releases, major contract wins or losses, analyst upgrades/downgrades, regulatory approvals or setbacks, major partnerships, CEO changes, significant stock moves with a known catalyst, or other material corporate events.

Return ONLY a JSON array. If a stock has no significant news, omit it entirely — do not include it with an empty summary.

Each item in the array must have exactly these fields:
- "ticker": the stock symbol (string)
- "headline": a concise news headline, max 12 words (string)
- "summary": 2-3 sentences of the key facts. Be specific — include numbers, names, percentages where relevant. No filler. (string)
- "sentiment": one of "positive", "negative", or "neutral" (string)

Return ONLY the raw JSON array with no markdown fences, no preamble, no commentary. Example format:
[{"ticker":"NVDA","headline":"NVIDIA announces $40B share buyback program","summary":"...","sentiment":"positive"}]

If there is absolutely no significant news for any of the stocks in this batch, return an empty array: []`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1500,
    tools: [
      {
        type: 'web_search_20250305',
        name: 'web_search',
      },
    ],
    messages: [{ role: 'user', content: prompt }],
  });

  // Extract the final text block (Claude's answer after web search)
  const textBlock = response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');

  if (!textBlock.trim()) {
    console.warn(`  [warn] No text response for batch: ${tickerList}`);
    return [];
  }

  // Strip any accidental markdown fences
  const clean = textBlock.replace(/```json|```/g, '').trim();

  try {
    const parsed = JSON.parse(clean);
    if (!Array.isArray(parsed)) {
      console.warn('  [warn] Response was not an array:', clean.slice(0, 200));
      return [];
    }
    return parsed;
  } catch (err) {
    console.warn('  [warn] JSON parse failed:', clean.slice(0, 300));
    return [];
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[newswire] Starting daily run — ${new Date().toISOString()}`);

  const runDate = todayISODate();
  const batches = chunk(TICKERS, BATCH_SIZE);
  const allItems = [];

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    console.log(
      `[newswire] Batch ${i + 1}/${batches.length}: ${batch.map((t) => t.ticker).join(', ')}`,
    );

    try {
      const items = await fetchNewsForBatch(batch);
      console.log(`  → ${items.length} news item(s) found`);

      // Validate and enrich each item with sector + run date
      for (const item of items) {
        const meta = batch.find((t) => t.ticker === item.ticker);
        if (!meta) {
          console.warn(`  [warn] Unknown ticker in response: ${item.ticker}`);
          continue;
        }
        if (!item.headline || !item.summary || !item.sentiment) {
          console.warn(`  [warn] Incomplete item for ${item.ticker}, skipping`);
          continue;
        }
        allItems.push({
          ticker: item.ticker,
          sector: meta.sector,
          headline: item.headline.trim(),
          summary: item.summary.trim(),
          sentiment: item.sentiment,
          run_date: runDate,
        });
      }
    } catch (err) {
      console.error(`  [error] Batch ${i + 1} failed:`, err.message);
    }

    // Pause between batches to avoid bursting the API
    if (i < batches.length - 1) {
      await sleep(DELAY_BETWEEN_BATCHES_MS);
    }
  }

  console.log(`[newswire] Total items to write: ${allItems.length}`);

  if (allItems.length === 0) {
    console.log('[newswire] No news today — nothing to write. Done.');
    return;
  }

  // Upsert into Supabase — unique on (ticker, run_date) so re-runs don't duplicate
  const { error } = await supabase
    .from('newswire_items')
    .upsert(allItems, { onConflict: 'ticker,run_date' });

  if (error) {
    console.error('[newswire] Supabase write failed:', error.message);
    process.exit(1);
  }

  console.log(`[newswire] ✓ Wrote ${allItems.length} items to Supabase for ${runDate}`);
  console.log('[newswire] Done.');
}

main().catch((err) => {
  console.error('[newswire] Fatal error:', err);
  process.exit(1);
});
