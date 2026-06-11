import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export interface NewswireItem {
  id: number;
  ticker: string;
  sector: string;
  headline: string;
  summary: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  url: string | null;
  run_date: string;
  created_at: string;
}

interface UseNewswireResult {
  items: NewswireItem[];
  loading: boolean;
  error: string | null;
  runDate: string | null;
}


export function useNewswire(): UseNewswireResult {
  const [items, setItems]     = useState<NewswireItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [runDate, setRunDate] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchNewswire() {
      setLoading(true);
      setError(null);

      // Fetch the most recent run's items across all tickers.
      // We pull more rows now since one ticker can have several headlines per day.
      const { data, error: supaErr } = await supabase
        .from('newswire_items')
        .select('*')
        .order('run_date', { ascending: false })
        .order('ticker',   { ascending: true })
        .limit(500); // up from 100 — multiple headlines per ticker per day

      if (cancelled) return;

      if (supaErr) {
        setError(supaErr.message);
        setLoading(false);
        return;
      }

      if (!data || data.length === 0) {
        setItems([]);
        setRunDate(null);
        setLoading(false);
        return;
      }

      // Use the most recent run_date available
      const latestDate = data[0].run_date;
      const filtered   = data.filter((item) => item.run_date === latestDate);

      setItems(filtered as NewswireItem[]);
      setRunDate(latestDate);
      setLoading(false);
    }

    fetchNewswire();
    return () => { cancelled = true; };
  }, []);

  return { items, loading, error, runDate };
}