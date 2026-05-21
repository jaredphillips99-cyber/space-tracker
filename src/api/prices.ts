import type { LivePrice } from '../types';

export async function fetchPrices(tickers: string[]): Promise<LivePrice[]> {
  const params = new URLSearchParams({ tickers: tickers.join(',') });
  const res = await fetch(`/api/prices?${params}`);

  if (!res.ok) {
    // Return error stubs so the table still renders
    return tickers.map((ticker) => ({
      ticker,
      price: 0,
      change: 0,
      changePercent: 0,
      fetchError: true,
      fetchedAt: Date.now(),
    }));
  }

  return res.json();
}
