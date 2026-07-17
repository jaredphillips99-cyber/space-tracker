import { useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import { ALL_TICKERS } from '../config/tickers';
import { isPriceStale, type LivePrice } from '../types';

// Inlined from the deleted src/api/prices.ts wrapper — the /api/prices
// serverless endpoint is the actual price source.
async function fetchPrices(tickers: string[]): Promise<LivePrice[]> {
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

export function useLivePrice() {
  const setPrices = useStore((s) => s.setPrices);
  const setPricesLoadingState = useStore((s) => s.setPricesLoadingState);
  const prices = useStore((s) => s.prices);
  const fetchingRef = useRef(false);

  useEffect(() => {
    // Check if any price is stale or missing
    const anyStale = ALL_TICKERS.some((ticker) => {
      const p = prices[ticker];
      return !p || isPriceStale(p);
    });

    if (!anyStale || fetchingRef.current) return;

    fetchingRef.current = true;
    setPricesLoadingState('loading');

    fetchPrices(ALL_TICKERS)
      .then((data) => {
        setPrices(data);
        setPricesLoadingState('success');
      })
      .catch(() => {
        setPricesLoadingState('error');
      })
      .finally(() => {
        fetchingRef.current = false;
      });
  }, []); // Run once on mount — stale check handles re-fetch logic
}
