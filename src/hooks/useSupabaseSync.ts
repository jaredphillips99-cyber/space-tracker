import { useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useStore } from '../store/useStore';
import type { StockAnalysis } from '../types';

// ─── DB row shape (matches the SQL schema) ─────────────────────────────────────

interface AnalysisRow {
  id?:            string;
  ticker:         string;
  analyzed_at:    number;        // unix ms
  conviction:     string | null;
  guidance:       string | null;
  key_metrics:    string | null;
  summary:        string | null;
  raw_json:       Record<string, unknown> | null;
  filing_date:    string | null;
  period:         string | null;
  document_url:   string | null;
  is_speculative: boolean;
}

// ─── Map DB row → StockAnalysis ────────────────────────────────────────────────

function rowToAnalysis(row: AnalysisRow): StockAnalysis {
  const json = row.raw_json ?? {};
  return {
    ticker:            row.ticker,
    analyzedAt:        row.analyzed_at,
    guidanceDirection: (row.guidance as StockAnalysis['guidanceDirection']) ?? undefined,
    keyMetrics:        row.key_metrics ?? undefined,
    summary:           row.summary ?? undefined,
    lastEarningsDate:  row.filing_date ?? undefined,
    // Pull numeric fields out of raw_json blob
    revenueGrowthYoY:  (json.revenueGrowthYoY as number) ?? undefined,
    grossMargin:       (json.grossMarginPercent as number) ?? undefined,
    operatingMargin:   (json.operatingMarginPercent as number) ?? undefined,
    recentRevenue:     (json.revenue as number) ?? undefined,
    recentEPS:         (json.epsAdjusted as number) ?? undefined,
  };
}

// ─── Map StockAnalysis + raw json payload → DB row ────────────────────────────

function analysisToRow(
  analysis: StockAnalysis,
  rawJson:  Record<string, unknown> | null,
  meta: {
    filingDate:    string | null;
    period:        string | null;
    documentUrl:   string | null;
    isSpeculative: boolean;
  },
): AnalysisRow {
  return {
    ticker:         analysis.ticker,
    analyzed_at:    analysis.analyzedAt,
    conviction:     (rawJson?.convictionRating as string) ?? null,
    guidance:       analysis.guidanceDirection ?? null,
    key_metrics:    analysis.keyMetrics ?? null,
    summary:        analysis.summary ?? null,
    raw_json:       rawJson,
    filing_date:    meta.filingDate,
    period:         meta.period,
    document_url:   meta.documentUrl,
    is_speculative: meta.isSpeculative,
  };
}

// ─── Hook ──────────────────────────────────────────────────────────────────────

export function useSupabaseSync() {
  const setAnalysis = useStore((s) => s.setAnalysis);
  const analyses    = useStore((s) => s.analyses);

  // On mount: hydrate Zustand store from Supabase
  // Supabase wins on conflict (newer analyzedAt takes precedence)
  useEffect(() => {
    async function hydrate() {
      const { data, error } = await supabase
        .from('analyses')
        .select('*')
        .order('analyzed_at', { ascending: false });

      if (error) {
        console.warn('[supabase] Hydration failed:', error.message);
        return;
      }

      if (!data) return;

      for (const row of data as AnalysisRow[]) {
        const existing = analyses[row.ticker];
        // Only update if Supabase has newer data than localStorage
        if (!existing || row.analyzed_at > existing.analyzedAt) {
          setAnalysis(rowToAnalysis(row));
        }
      }
    }

    hydrate();
    // Run once on mount — intentionally no deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Write a completed analysis to Supabase (admin only — called after analysis runs)
  const pushAnalysis = useCallback(async (
    analysis: StockAnalysis,
    rawJson:  Record<string, unknown> | null,
    meta: {
      filingDate:    string | null;
      period:        string | null;
      documentUrl:   string | null;
      isSpeculative: boolean;
    },
  ): Promise<{ error: string | null }> => {
    const row = analysisToRow(analysis, rawJson, meta);

    const { error } = await supabase
      .from('analyses')
      .upsert(row, { onConflict: 'ticker' });

    if (error) {
      console.error('[supabase] Push failed:', error.message);
      return { error: error.message };
    }

    return { error: null };
  }, []);

  return { pushAnalysis };
}
