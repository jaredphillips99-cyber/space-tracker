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

export interface AnalysisCompletePayload {
  meta:      AnalysisMeta;
  jsonData:  AnalysisJson;
  narrative: string;
}

// What the caller passes to run() — EDGAR already fetched browser-side
export interface RunPayload {
  ticker:        string;
  earningsText:  string;
  isSpeculative: boolean;
  filingMeta: {
    filingDate:  string | null;
    period:      string | null;
    documentUrl: string | null;
    isSedarOnly: boolean;
    sources:     { hasEightK: boolean; hasTenQ: boolean } | null;
    note:        string | null;
  };
}

export interface UseAnalysisOptions {
  onComplete?: (payload: AnalysisCompletePayload) => void;
}

export interface UseAnalysisReturn {
  run:              (payload: RunPayload) => Promise<void>;
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

export function useAnalysis(options: UseAnalysisOptions = {}): UseAnalysisReturn {
  const { onComplete } = options;

  const [status,           setStatus]           = useState<AnalysisStatus>('idle');
  const [meta,             setMeta]             = useState<AnalysisMeta | null>(null);
  const [jsonData,         setJsonData]         = useState<AnalysisJson | null>(null);
  const [narrative,        setNarrative]        = useState<string>('');
  const [error,            setError]            = useState<string | null>(null);
  const [convictionRating, setConvictionRating] = useState<ConvictionRating | null>(null);

  const abortRef     = useRef<AbortController | null>(null);
  const metaRef      = useRef<AnalysisMeta | null>(null);
  const jsonDataRef  = useRef<AnalysisJson | null>(null);
  const narrativeRef = useRef<string>('');

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setStatus('idle');
  }, []);

  const run = useCallback(async (payload: RunPayload) => {
    // Reset
    setStatus('extracting_json');
    setMeta(null);
    setJsonData(null);
    setNarrative('');
    setError(null);
    setConvictionRating(null);
    metaRef.current      = null;
    jsonDataRef.current  = null;
    narrativeRef.current = '';

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch('/api/analyze', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          ticker:        payload.ticker,
          earningsText:  payload.earningsText,
          isSpeculative: payload.isSpeculative,
          filingMeta:    payload.filingMeta,
        }),
        signal: ctrl.signal,
      });

      if (res.status === 429) {
        setError('Rate limit reached — 10 analyses per hour. Try again later.');
        setStatus('error');
        return;
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError((body as { error?: string })?.error ?? `Server error ${res.status}`);
        setStatus('error');
        return;
      }

      if (!res.body) {
        setError('No response body from server');
        setStatus('error');
        return;
      }

      const reader        = res.body.getReader();
      const decoder       = new TextDecoder();
      let   buffer        = '';
      let   lastEventType = '';

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
          const raw = line.slice(6).trim();
          if (!raw) continue;

          let msg: Record<string, unknown>;
          try { msg = JSON.parse(raw); }
          catch { continue; }

          switch (lastEventType) {
            case 'meta': {
              const m = msg as unknown as AnalysisMeta;
              metaRef.current = m;
              setMeta(m);
              break;
            }
            case 'status': {
              if (msg.step === 'narrative') setStatus('writing_narrative');
              break;
            }
            case 'json': {
              const p = msg.parsed as AnalysisJson | undefined;
              if (p) {
                jsonDataRef.current = p;
                setJsonData(p);
                if (p.convictionRating) setConvictionRating(p.convictionRating);
              }
              break;
            }
            case 'narrative_chunk': {
              const text = (msg.text as string) ?? '';
              narrativeRef.current += text;
              setNarrative(prev => prev + text);
              break;
            }
            case 'done': {
              setStatus('done');
              if (onComplete && metaRef.current && jsonDataRef.current) {
                onComplete({
                  meta:      metaRef.current,
                  jsonData:  jsonDataRef.current,
                  narrative: narrativeRef.current,
                });
              }
              break;
            }
            case 'error': {
              setError((msg.message as string) ?? 'Unknown error');
              setStatus('error');
              break;
            }
          }
        }
      }

    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  }, [onComplete]);

  return { run, cancel, status, meta, jsonData, narrative, error, convictionRating };
}