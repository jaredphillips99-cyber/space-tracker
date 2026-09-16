import { useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import { ALL_TICKERS } from '../config/tickers';
import { isPriceStale } from '../types';
import { fetchAllPrices } from '../lib/fetchPrices';

export function useLivePrice() {
  const setPrices = useStore((s) => s.setPrices);
  const setPricesLoadingState = useStore((s) => s.setPricesLoadingState);
  const prices = useStore((s) => s.prices);
  const fetchingRef = useRef(false);

  useEffect(() => {
    const anyStale = ALL_TICKERS.some((ticker) => {
      const p = prices[ticker];
      return !p || isPriceStale(p);
    });

    if (!anyStale || fetchingRef.current) return;

    fetchingRef.current = true;
    setPricesLoadingState('loading');

    fetchAllPrices(ALL_TICKERS)
      .then(({ prices: data, failedBatchCount, batchCount }) => {
        setPrices(data);
        setPricesLoadingState(failedBatchCount === batchCount && batchCount > 0 ? 'error' : 'success');
      })
      .catch(() => {
        setPricesLoadingState('error');
      })
      .finally(() => {
        fetchingRef.current = false;
      });
  }, []); // Run once on mount — stale check handles re-fetch logic
}
