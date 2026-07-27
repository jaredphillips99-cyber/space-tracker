import type { NewswireItem } from '../hooks/useNewswire';
import type { LivePrice } from '../types';

export interface NewsStory {
  url: string;
  headline: string;
  tickers: string[];       // all tracked tickers this same URL was fetched under
  sectors: string[];       // deduped, in ticker order
  sentiment: NewswireItem['sentiment'];
  publishedAt: string;     // published_at ?? created_at, always resolved
  maxMarketCap: number;    // 0 if no price data available for any ticker
  maxAbsMovePercent: number;
}

export interface RankedFrontPage {
  lead: NewsStory[];
  movers: NewsStory[];
  feed: NewsStory[];       // everything not in lead/movers, newest first
}

const LEAD_COUNT = 6;
const MOVERS_COUNT = 6;
const MOVERS_MIN_ABS_PERCENT = 5;
const RECENT_WINDOW_HOURS = 72;

function dedupeByUrl(items: NewswireItem[], prices: Record<string, LivePrice>): NewsStory[] {
  const byUrl = new Map<string, NewsStory>();

  for (const item of items) {
    if (!item.url) continue;
    const publishedAt = item.published_at ?? item.created_at;
    const price = prices[item.ticker];
    const marketCap = price?.marketCap ?? 0;
    const absMove = price ? Math.abs(price.changePercent ?? 0) : 0;

    const existing = byUrl.get(item.url);
    if (existing) {
      if (!existing.tickers.includes(item.ticker)) existing.tickers.push(item.ticker);
      if (!existing.sectors.includes(item.sector)) existing.sectors.push(item.sector);
      existing.maxMarketCap = Math.max(existing.maxMarketCap, marketCap);
      existing.maxAbsMovePercent = Math.max(existing.maxAbsMovePercent, absMove);
      // keep the earliest-seen headline/publishedAt for the group
      continue;
    }

    byUrl.set(item.url, {
      url: item.url,
      headline: item.headline,
      tickers: [item.ticker],
      sectors: [item.sector],
      sentiment: item.sentiment,
      publishedAt,
      maxMarketCap: marketCap,
      maxAbsMovePercent: absMove,
    });
  }

  return Array.from(byUrl.values());
}

export function rankFrontPage(
  items: NewswireItem[],
  prices: Record<string, LivePrice>,
): RankedFrontPage {
  const stories = dedupeByUrl(items, prices)
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  const cutoff = Date.now() - RECENT_WINDOW_HOURS * 60 * 60 * 1000;
  const recent = stories.filter((s) => new Date(s.publishedAt).getTime() >= cutoff);
  const older = stories.filter((s) => new Date(s.publishedAt).getTime() < cutoff);

  const lead = [...recent]
    .sort((a, b) => b.maxMarketCap - a.maxMarketCap)
    .slice(0, LEAD_COUNT);
  const leadUrls = new Set(lead.map((s) => s.url));

  const movers = recent
    .filter((s) => !leadUrls.has(s.url) && s.maxAbsMovePercent >= MOVERS_MIN_ABS_PERCENT)
    .sort((a, b) => b.maxAbsMovePercent - a.maxAbsMovePercent)
    .slice(0, MOVERS_COUNT);
  const moversUrls = new Set(movers.map((s) => s.url));

  const feed = [
    ...recent.filter((s) => !leadUrls.has(s.url) && !moversUrls.has(s.url)),
    ...older,
  ];

  return { lead, movers, feed };
}
