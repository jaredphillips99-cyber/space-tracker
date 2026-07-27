import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { NewswireItem } from './useNewswire';

const PAGE_SIZE = 300; // generous first page so front-page ranking has a
                        // real recent pool to work with (31 tickers, several
                        // headlines/ticker/day — 300 comfortably covers 48-72h)

interface UseNewsArchiveResult {
  items: NewswireItem[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;
}

export function useNewsArchive(): UseNewsArchiveResult {
  const [items, setItems] = useState<NewswireItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);

  const fetchPage = useCallback(async (before: string | null, isFirstPage: boolean) => {
    isFirstPage ? setLoading(true) : setLoadingMore(true);
    setError(null);

    let query = supabase
      .from('newswire_items')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);

    if (before) query = query.lt('created_at', before);

    const { data, error: supaErr } = await query;

    if (supaErr) {
      console.info('[news-archive] load result: error', { message: supaErr.message });
      setError(supaErr.message);
      isFirstPage ? setLoading(false) : setLoadingMore(false);
      return;
    }

    const page = (data ?? []) as NewswireItem[];
    console.info('[news-archive] load result: success', { rows: page.length, isFirstPage });

    setItems((prev) => (isFirstPage ? page : [...prev, ...page]));
    setHasMore(page.length === PAGE_SIZE);
    if (page.length > 0) setCursor(page[page.length - 1].created_at);
    isFirstPage ? setLoading(false) : setLoadingMore(false);
  }, []);

  useEffect(() => {
    fetchPage(null, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    fetchPage(cursor, false);
  }, [cursor, hasMore, loadingMore, fetchPage]);

  return { items, loading, loadingMore, error, hasMore, loadMore };
}
