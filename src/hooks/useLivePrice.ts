import { useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import { fetchPrices } from '../api/prices';
import { ALL_TICKERS } from '../config/tickers';
import { isPriceStale } from '../types';

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
