import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useStore } from '../store/useStore';
import {
  INDEX_NAMES,
  computeIndexValue,
  tickersForIndex,
  type IndexName,
  type IndexConstituentInput,
  type PerTickerContribution,
} from '../lib/indexCalc';

// ─── Live (intraday) index values ─────────────────────────────────────────────
// Computed client-side on every page load from the already-fetched
// useLivePrice() store data (hoisted at App level — zero extra fetches), using
// the SAME indexCalc.ts logic against the most recent STORED divisor from
// index_history. index_history is only for the historical chart / prior closes,
// never the live headline number.

export interface LiveIndexValue {
  name: IndexName;
  value: number;
  dayChangePct: number;
  // True when no stored divisor exists yet (before the first cron/backfill
  // write): the value is bootstrapped to 100 from current caps so the widget
  // renders gracefully rather than blank.
  isBootstrapped: boolean;
}

interface LatestDivisorRow {
  index_name: string;
  divisor: number;
  date: string;
}

// Build a live constituent from store price data. sharesOutstanding is derived
// from marketCap / price (marketCap === price × shares); prevClose from
// price − change (change is the absolute $ move vs the prior close).
function liveConstituent(
  ticker: string,
  price: { price: number; marketCap?: number; change: number } | undefined,
): IndexConstituentInput | null {
  if (!price || !price.price || price.price <= 0 || !price.marketCap) return null;
  const sharesOutstanding = price.marketCap / price.price;
  const prevClose = price.price - price.change;
  return { ticker, price: price.price, sharesOutstanding, prevClose };
}

export function useIndexValues(): {
  values: Record<IndexName, LiveIndexValue>;
  loading: boolean;
} {
  const prices = useStore((s) => s.prices);
  const [divisors, setDivisors] = useState<Record<string, LatestDivisorRow> | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Pull the newest row per index. Ordering by date desc and taking the first
    // occurrence of each index_name yields the latest stored divisor.
    supabase
      .from('index_history')
      .select('index_name, divisor, date')
      .order('date', { ascending: false })
      .limit(INDEX_NAMES.length * 3)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.info('[index] latest-divisor load: error', { message: error.message });
          setDivisors({});
          return;
        }
        const latest: Record<string, LatestDivisorRow> = {};
        for (const row of (data ?? []) as LatestDivisorRow[]) {
          if (!latest[row.index_name]) latest[row.index_name] = row;
        }
        console.info('[index] latest-divisor load: success', { indices: Object.keys(latest).length });
        setDivisors(latest);
      });
    return () => { cancelled = true; };
  }, []);

  const values = useMemo(() => {
    const out = {} as Record<IndexName, LiveIndexValue>;
    for (const name of INDEX_NAMES) {
      const constituents = tickersForIndex(name)
        .map((t) => liveConstituent(t, prices[t]))
        .filter((c): c is IndexConstituentInput => c != null);

      const storedDivisor = divisors?.[name]?.divisor ?? null;
      const comp = computeIndexValue(constituents, storedDivisor ?? null);
      out[name] = {
        name,
        value: comp.value,
        dayChangePct: comp.dayChangePct,
        isBootstrapped: storedDivisor == null,
      };
    }
    return out;
  }, [prices, divisors]);

  return { values, loading: divisors === null };
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
