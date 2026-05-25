/**
 * useAnalysis — fetches EDGAR earnings data + streams Claude analysis.
 *
 * Usage:
 *   const { run, status, meta, jsonData, narrative, error, convictionRating } =
 *     useAnalysis();
 *
 *   // Kick off analysis for a ticker
 *   await run('RKLB');
 */

import { useState, useRef, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AnalysisStatus =
  | 'idle'
  | 'fetching_edgar'
  | 'extracting_json'
  | 'writing_narrative'
  | 'done'
  | 'error';

export type ConvictionRating =
  | 'strong_buy'
  | 'buy'
  | 'hold'
  | 'sell'
  | 'strong_sell';

export interface AnalysisMeta {
  ticker: string;
  filingDate: string;
  period: string;
  documentUrl: string;
}

export interface AnalysisJson {
  revenue:                     number | null;
  revenueGrowthYoY:            number | null;
  grossMarginPercent:          number | null;
  operatingMarginPercent:      number | null;
  adjustedEbitdaMarginPercent: number | null;
  netIncomeLoss:               number | null;
  eps:                         number | null;
  epsAdjusted:                 number | null;
  cashAndEquivalents:          number | null;
  backlog:                     number | null;
  guidanceRevenueLow:          number | null;
  guidanceRevenueHigh:         number | null;
  guidancePeriod:              string | null;
  guidanceDirection:           'raised' | 'maintained' | 'lowered' | 'initiated' | null;
  analystConsensusTargetPrice: number | null;
  segments: Array<{
    name:      string;
    revenue:   number | null;
    growthYoY: number | null;
  }> | null;
  convictionRating:    ConvictionRating;
  convictionRationale: string;
}

export interface UseAnalysisReturn {
  run:              (ticker: string) => Promise<void>;
  cancel:           () => void;
  status:           AnalysisStatus;
  meta:             AnalysisMeta | null;
  jsonData:         AnalysisJson | null;
  narrative:        string;         // streams in progressively
  error:            string | null;
  convictionRating: ConvictionRating | null;
}

// ---------------------------------------------------------------------------
// Conviction label helpers (for UI rendering)
// ---------------------------------------------------------------------------

export const CONVICTION_LABELS: Record<ConvictionRating, string> = {
  strong_buy:  'Strong Buy',
  buy:         'Buy',
  hold:        'Hold',
  sell:        'Sell',
  strong_sell: 'Strong Sell',
};

export const CONVICTION_COLORS: Record<ConvictionRating, string> = {
  strong_buy:  '#00e676',  // green
  buy:         '#69f0ae',  // light green
  hold:        '#8b93a8',  // muted
  sell:        '#ff7043',  // orange-red
  strong_sell: '#ff4b6e',  // red
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAnalysis(): UseAnalysisReturn {
  const [status,           setStatus]           = useState<AnalysisStatus>('idle');
  const [meta,             setMeta]             = useState<AnalysisMeta | null>(null);
  const [jsonData,         setJsonData]         = useState<AnalysisJson | null>(null);
  const [narrative,        setNarrative]        = useState<string>('');
  const [error,            setError]            = useState<string | null>(null);
  const [convictionRating, setConvictionRating] = useState<ConvictionRating | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setStatus('idle');
  }, []);

  const run = useCallback(async (ticker: string) => {
    // Reset state
    setStatus('fetching_edgar');
    setMeta(null);
    setJsonData(null);
    setNarrative('');
    setError(null);
    setConvictionRating(null);

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker }),
        signal: ctrl.signal,
      });

      if (res.status === 429) {
        setError('Rate limit reached — 10 analyses per hour. Try again later.');
        setStatus('error');
        return;
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError((body as any)?.error ?? `Server error ${res.status}`);
        setStatus('error');
        return;
      }

      if (!res.body) {
        setError('No response body from server');
        setStatus('error');
        return;
      }

      // Parse the SSE stream
      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let   buffer  = '';

      while (true) {
        if (ctrl.signal.aborted) break;

        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          // SSE format: "event: TYPE\ndata: {...}\n\n"
          if (line.startsWith('event: ')) {
            // Handled on the "data:" line following
            continue;
          }
          if (!line.startsWith('data: ')) continue;

          const payload = line.slice(6).trim();
          if (!payload) continue;

          let msg: Record<string, unknown>;
          try { msg = JSON.parse(payload); }
          catch { continue; }

          // We rely on the preceding event: line — but since we read them
          // as a flat stream, we match by shape instead.
          const eventLine = lines[lines.indexOf(line) - 1] ?? '';
          const eventType = eventLine.startsWith('event: ')
            ? eventLine.slice(7).trim()
            : 'unknown';

          switch (eventType) {
            case 'meta':
              setMeta(msg as unknown as AnalysisMeta);
              setStatus('extracting_json');
              break;

            case 'status': {
              const step = msg.step as string;
              if (step === 'narrative') setStatus('writing_narrative');
              break;
            }

            case 'json': {
              const parsed = msg.parsed as AnalysisJson | undefined;
              if (parsed) {
                setJsonData(parsed);
                if (parsed.convictionRating) {
                  setConvictionRating(parsed.convictionRating);
                }
              }
              break;
            }

            case 'narrative_chunk':
              setNarrative(prev => prev + (msg.text as string ?? ''));
              break;

            case 'done':
              setStatus('done');
              break;

            case 'error':
              setError((msg.message as string) ?? 'Unknown error');
              setStatus('error');
              break;

            default:
              break;
          }
        }
      }

      if (status !== 'error') setStatus('done');

    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  }, [status]);

  return {
    run,
    cancel,
    status,
    meta,
    jsonData,
    narrative,
    error,
    convictionRating,
  };
}
