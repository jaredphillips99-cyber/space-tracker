import type { LivePrice } from '../types';

/** Yahoo gets unhappy past ~40 concurrent quote+summary+chart fetches per function. */
export const PRICE_BATCH_SIZE = 40;

export function chunkTickers(tickers: string[], size = PRICE_BATCH_SIZE): string[][] {
  const batchSize = Math.max(1, size);
  const chunks: string[][] = [];
  for (let i = 0; i < tickers.length; i += batchSize) {
    chunks.push(tickers.slice(i, i + batchSize));
  }
  return chunks;
}

export function priceErrorStub(ticker: string, fetchedAt: number): LivePrice {
  return {
    ticker,
    price: 0,
    change: 0,
    changePercent: 0,
    nextEarningsDate: null,
    lastReportedQuarterEnd: null,
    fetchError: true,
    fetchedAt,
  };
}

/** Every requested ticker gets a row — missing quotes become fetchError, never omitted. */
export function mergePriceResults(
  requested: string[],
  received: LivePrice[],
  fetchedAt: number,
): LivePrice[] {
  const byTicker = new Map<string, LivePrice>();
  for (const price of received) {
    if (price?.ticker) byTicker.set(price.ticker, price);
  }
  return requested.map((ticker) => byTicker.get(ticker) ?? priceErrorStub(ticker, fetchedAt));
}
