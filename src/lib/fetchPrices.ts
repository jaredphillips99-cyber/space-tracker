import type { LivePrice } from '../types';
import {
  chunkTickers,
  mergePriceResults,
  priceErrorStub,
} from './priceBatches';

async function fetchPriceBatch(tickers: string[]): Promise<LivePrice[]> {
  const params = new URLSearchParams({ tickers: tickers.join(',') });
  const res = await fetch(`/api/prices?${params}`);
  const fetchedAt = Date.now();
  if (!res.ok) {
    return tickers.map((ticker) => priceErrorStub(ticker, fetchedAt));
  }
  const data: unknown = await res.json();
  if (!Array.isArray(data)) {
    return tickers.map((ticker) => priceErrorStub(ticker, fetchedAt));
  }
  return data as LivePrice[];
}

/**
 * Fetch every ticker, chunked into parallel ≤40 batches so one Yahoo/Vercel
 * limit cannot drop the tail of the book. Failed batches become fetchError
 * stubs; other batches still apply. Never invents prices.
 */
export async function fetchAllPrices(tickers: string[]): Promise<{
  prices: LivePrice[];
  failedBatchCount: number;
  batchCount: number;
}> {
  const fetchedAt = Date.now();
  if (tickers.length === 0) {
    return { prices: [], failedBatchCount: 0, batchCount: 0 };
  }

  const chunks = chunkTickers(tickers);
  const settled = await Promise.allSettled(chunks.map((chunk) => fetchPriceBatch(chunk)));

  const received: LivePrice[] = [];
  let failedBatchCount = 0;
  for (let i = 0; i < settled.length; i++) {
    const result = settled[i];
    if (result.status === 'fulfilled') {
      received.push(...result.value);
    } else {
      failedBatchCount += 1;
      received.push(...chunks[i].map((ticker) => priceErrorStub(ticker, fetchedAt)));
    }
  }

  return {
    prices: mergePriceResults(tickers, received, fetchedAt),
    failedBatchCount,
    batchCount: chunks.length,
  };
}
