import { useState, useRef, useCallback } from 'react';

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
  ticker:        string;
  filingDate:    string | null;
  period:        string | null;
  documentUrl:   string | null;
  isSpeculative: boolean;
  isSedarOnly:   boolean;
  sources:       { hasEightK: boolean; hasTenQ: boolean } | null;
  note:          string | null;
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
  narrative:        string;
  error:            string | null;
  convictionRating: ConvictionRating | null;
}

export const CONVICTION_LABELS: Record<ConvictionRating, string> = {
  strong_buy:  'Strong Buy',
  buy:         'Buy',
  hold:        'Hold',
  sell:        'Sell',
  strong_sell: 'Strong Sell',
};

export const CONVICTION_COLORS: Record<ConvictionRating, string> = {
  strong_buy:  '#00e676',
  buy:         '#69f0ae',
  hold:        '#8b93a8',
  sell:        '#ff7043',
  strong_sell: '#ff4b6e',
};

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
    // Reset
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

      // Parse SSE stream
      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let   buffer  = '';
      // Track last event type since data lines follow event lines
      let lastEventType = '';

      while (true) {
        if (ctrl.signal.aborted) break;

        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            lastEventType = line.slice(7).trim();
            continue;
          }

          if (!line.startsWith('data: ')) continue;

          const payload = line.slice(6).trim();
          if (!payload) continue;

          let msg: Record<string, unknown>;
          try { msg = JSON.parse(payload); }
          catch { continue; }

          switch (lastEventType) {
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
              const p = msg.parsed as AnalysisJson | undefined;
              if (p) {
                setJsonData(p);
                if (p.convictionRating) setConvictionRating(p.convictionRating);
              }
              break;
            }

            case 'narrative_chunk':
              setNarrative(prev => prev + ((msg.text as string) ?? ''));
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

    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  }, []);

  return { run, cancel, status, meta, jsonData, narrative, error, convictionRating };
}