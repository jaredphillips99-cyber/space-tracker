import { useEffect, useRef, useState } from 'react';

// Live pricing for a dynamic, per-user set of crypto symbols (e.g. BTC-USD,
// ETH-USD). Deliberately NOT part of useLivePrice.ts — that hook is hardcoded to
// ALL_TICKERS (the tracked stock universe) and writes into the Zustand store.
// Crypto symbols are user-entered and ephemeral, so they live in local state
// here and never touch the global store.
//
// Fetches through /api/prices — the same Yahoo-backed endpoint stocks use, which
// accepts any ticker string (crypto included). Caches results for 5 minutes to
// match that endpoint's own `Cache-Control: s-maxage=300`. On fetch error we keep
// the last-known prices rather than clearing to zero — same "last known good"
// posture the rest of the app follows.

const STALE_MS = 5 * 60 * 1000;

export interface CryptoPrice {
  price: number;
  fetchedAt: number;
}

function normalize(symbols: string[]): string[] {
  return [...new Set(symbols.map(s => s.trim().toUpperCase()).filter(Boolean))].sort();
}

export function useCryptoPrices(symbols: string[]): {
  prices: Record<string, CryptoPrice | undefined>;
  loading: boolean;
} {
  const [prices, setPrices] = useState<Record<string, CryptoPrice | undefined>>({});
  const [loading, setLoading] = useState(false);

  // Latest fetched map kept in a ref so the effect can read prior values without
  // adding `prices` to its dependency list (which would re-trigger fetches).
  const pricesRef = useRef(prices);
  pricesRef.current = prices;

  // Stable key derived from the normalized symbol set — the effect re-runs only
  // when the actual set of symbols changes, not on every parent render (which
  // passes a fresh array identity each time).
  const key = normalize(symbols).join(',');

  useEffect(() => {
    const wanted = key ? key.split(',') : [];
    if (wanted.length === 0) {
      setLoading(false);
      return;
    }

    // If every wanted symbol already has a fresh cached price, skip the fetch.
    const now = Date.now();
    const allFresh = wanted.every(sym => {
      const cached = pricesRef.current[sym];
      return cached && now - cached.fetchedAt < STALE_MS;
    });
    if (allFresh) return;

    let cancelled = false;

    async function fetchPrices() {
      setLoading(true);
      try {
        const res = await fetch(`/api/prices?tickers=${encodeURIComponent(wanted.join(','))}`);
        if (!res.ok) throw new Error('price fetch failed');
        const data = await res.json();
        if (cancelled) return;

        if (Array.isArray(data)) {
          const fetchedAt = Date.now();
          setPrices(prev => {
            const next = { ...prev };
            for (const d of data) {
              // fetchError entries come back with price: 0 — treat as "not found"
              // and keep whatever was last cached rather than overwriting with 0.
              if (!d.fetchError && d.price != null && d.ticker) {
                next[String(d.ticker).toUpperCase()] = { price: d.price, fetchedAt };
              }
            }
            return next;
          });
        }
      } catch {
        // Keep last-known-good prices on error — never clear to zero.
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchPrices();
    return () => { cancelled = true; };
  }, [key]);

  return { prices, loading };
}
