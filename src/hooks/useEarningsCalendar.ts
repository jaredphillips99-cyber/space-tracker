import { useEffect, useState } from 'react';

export type SessionChip = 'bmo' | 'amc';
export type EarningsKind = 'last' | 'next';

export interface EarningsCalendarEvent {
  ticker: string;
  date: string;
  dateEnd: string | null;
  session: SessionChip | null;
  estimated: boolean;
  kind: EarningsKind;
}

export interface EarningsCalendarResponse {
  timezone: string;
  source: string;
  from: string;
  to: string;
  fetchedAt: string;
  events: EarningsCalendarEvent[];
}

const CLIENT_TTL_MS = 60 * 60 * 1000;

const cache = new Map<string, { fetchedAt: number; data: EarningsCalendarResponse }>();

function cacheKey(from: string, to: string): string {
  return `${from}|${to}`;
}

function getCached(from: string, to: string): EarningsCalendarResponse | null {
  const hit = cache.get(cacheKey(from, to));
  if (hit && Date.now() - hit.fetchedAt < CLIENT_TTL_MS) return hit.data;
  return null;
}

async function fetchRange(from: string, to: string): Promise<EarningsCalendarResponse> {
  const hit = getCached(from, to);
  if (hit) return hit;

  const params = new URLSearchParams({ from, to });
  const res = await fetch(`/api/earnings-calendar?${params}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  const data = (await res.json()) as EarningsCalendarResponse;
  cache.set(cacheKey(from, to), { fetchedAt: Date.now(), data });
  return data;
}

export function useEarningsCalendar(from: string, to: string) {
  const cached = getCached(from, to);
  const [remote, setRemote] = useState<EarningsCalendarResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const data = cached ?? (remote?.from === from && remote?.to === to ? remote : null);

  useEffect(() => {
    if (getCached(from, to)) return;
    let cancelled = false;
    fetchRange(from, to)
      .then((next) => {
        if (cancelled) return;
        setRemote(next);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load earnings calendar');
      });
    return () => { cancelled = true; };
  }, [from, to]);

  return { data, loading: !data && !error, error, events: data?.events ?? [] };
}
