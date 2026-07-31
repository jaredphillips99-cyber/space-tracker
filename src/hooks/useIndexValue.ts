import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useStore } from '../store/useStore';
import {
  INDEX_NAMES,
  computeIndexValue,
  eligibleTickersForIndex,
  type IndexName,
  type IndexConstituentInput,
  type PerTickerContribution,
} from '../lib/indexCalc';

// ─── Live (intraday) index values ─────────────────────────────────────────────
// Computed client-side on every page load from the already-fetched
// useLivePrice() store data (hoisted at App level — zero extra fetches), using
// the SAME indexCalc.ts logic against each ticker's most recent STORED
// base_price/base_allocation from index_constituents. index_history/
// index_constituents are only for the historical chart / prior state, never
// used to short-circuit the live headline number itself.
//
// July 31 2026 rewrite: the index is now equal-weight, buy-and-hold (see
// src/lib/indexCalc.ts header). There is no longer a single shared "divisor"
// per index — each ticker carries its own basePrice/baseAllocation, looked up
// per-ticker below instead of a single per-index row.

export interface LiveIndexValue {
  name: IndexName;
  value: number;
  dayChangePct: number;
  // True when no stored base exists yet for ANY constituent (before the first
  // cron/backfill write): the value is bootstrapped fresh from current prices
  // so the widget renders gracefully rather than blank.
  isBootstrapped: boolean;
}

interface LatestBaseRow {
  index_name: string;
  ticker: string;
  base_price: number | null;
  base_allocation: number | null;
  date: string;
}

// Build a live constituent from store price data + a looked-up base.
// prevClose is derived from price − change (change is the absolute $ move vs
// the prior close). No sharesOutstanding/marketCap needed anymore — equal-
// weight math only uses price.
function liveConstituent(
  ticker: string,
  price: { price: number; change: number } | undefined,
  base: LatestBaseRow | undefined,
): IndexConstituentInput | null {
  if (!price || !price.price || price.price <= 0) return null;
  const prevClose = price.price - price.change;
  return {
    ticker,
    price: price.price,
    prevClose,
    basePrice: base?.base_price ?? null,
    baseAllocation: base?.base_allocation ?? null,
  };
}

export function useIndexValues(): {
  values: Record<IndexName, LiveIndexValue>;
  loading: boolean;
} {
  const prices = useStore((s) => s.prices);
  const [bases, setBases] = useState<Record<string, LatestBaseRow> | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Pull the newest constituent row per (index_name, ticker) — this carries
    // each ticker's fixed base_price/base_allocation for that index.
    supabase
      .from('index_constituents')
      .select('index_name, ticker, base_price, base_allocation, date')
      .order('date', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.info('[index] latest-base load: error', { message: error.message });
          setBases({});
          return;
        }
        const latest: Record<string, LatestBaseRow> = {};
        for (const row of (data ?? []) as LatestBaseRow[]) {
          const key = `${row.index_name}::${row.ticker}`;
          if (!latest[key]) latest[key] = row;
        }
        console.info('[index] latest-base load: success', { rows: Object.keys(latest).length });
        setBases(latest);
      });
    return () => { cancelled = true; };
  }, []);

  const values = useMemo(() => {
    const out = {} as Record<IndexName, LiveIndexValue>;
    const todayISODate = new Date().toISOString().split('T')[0];
    for (const name of INDEX_NAMES) {
      const eligibleTickers = eligibleTickersForIndex(name, todayISODate);
      const constituents = eligibleTickers
        .map((t) => liveConstituent(t, prices[t], bases?.[`${name}::${t}`]))
        .filter((c): c is IndexConstituentInput => c != null);

      const anyBase = eligibleTickers.some((t) => bases?.[`${name}::${t}`]?.base_price != null);
      const comp = computeIndexValue(constituents);
      out[name] = {
        name,
        value: comp.value,
        dayChangePct: comp.dayChangePct,
        isBootstrapped: bases != null && !anyBase,
      };
    }
    return out;
  }, [prices, bases]);

  return { values, loading: bases === null };
}

// ─── Historical series (for charts / sparklines) ──────────────────────────────

export interface IndexHistoryRow {
  date: string;
  value: number;
  day_change_pct: number;
}

export function useIndexHistory(indexName: IndexName, days: number): {
  rows: IndexHistoryRow[];
  loading: boolean;
  error: string | null;
} {
  const [rows, setRows] = useState<IndexHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    supabase
      .from('index_history')
      .select('date, value, day_change_pct')
      .eq('index_name', indexName)
      .gte('date', since)
      .order('date', { ascending: true })
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) {
          console.info('[index] history load: error', { indexName, message: err.message });
          setError(err.message);
          setLoading(false);
          return;
        }
        setRows((data ?? []) as IndexHistoryRow[]);
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [indexName, days]);

  return { rows, loading, error };
}

// ─── Constituent contribution table (for the drill-down) ──────────────────────

export interface IndexConstituentRow {
  ticker: string;
  weight_pct: number;
  day_change_pct: number;
  contribution_pct: number;
  date: string;
}

/**
 * Loads the constituent contribution rows for an index on its most recent
 * stored date (or a specific date when provided).
 */
export function useIndexConstituents(indexName: IndexName, date?: string): {
  rows: IndexConstituentRow[];
  date: string | null;
  loading: boolean;
  error: string | null;
} {
  const [rows, setRows] = useState<IndexConstituentRow[]>([]);
  const [resolvedDate, setResolvedDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    async function load() {
      let targetDate = date ?? null;

      // Resolve the latest available date for this index when none was given.
      if (!targetDate) {
        const { data: latest, error: latestErr } = await supabase
          .from('index_constituents')
          .select('date')
          .eq('index_name', indexName)
          .order('date', { ascending: false })
          .limit(1);
        if (cancelled) return;
        if (latestErr) { setError(latestErr.message); setLoading(false); return; }
        targetDate = latest?.[0]?.date ?? null;
      }

      if (!targetDate) {
        setRows([]);
        setResolvedDate(null);
        setLoading(false);
        return;
      }

      const { data, error: err } = await supabase
        .from('index_constituents')
        .select('ticker, weight_pct, day_change_pct, contribution_pct, date')
        .eq('index_name', indexName)
        .eq('date', targetDate)
        .order('weight_pct', { ascending: false });

      if (cancelled) return;
      if (err) { setError(err.message); setLoading(false); return; }

      setRows((data ?? []) as IndexConstituentRow[]);
      setResolvedDate(targetDate);
      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [indexName, date]);

  return { rows, date: resolvedDate, loading, error };
}

export type { PerTickerContribution };
