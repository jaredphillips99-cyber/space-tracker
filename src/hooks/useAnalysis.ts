import { useCallback } from 'react';
import { useStore } from '../store/useStore';
import { streamAnalysis } from '../api/analyze';
import type { StockAnalysis } from '../types';

export function useAnalysis(ticker: string) {
  const analysis = useStore((s) => s.analyses[ticker]);
  const setAnalysis = useStore((s) => s.setAnalysis);
  const patchAnalysis = useStore((s) => s.patchAnalysis);

  const runAnalysis = useCallback(
    async (earningsText?: string, transcriptText?: string) => {
      // Seed the analysis with streaming state
      const seed: StockAnalysis = {
        ticker,
        analyzedAt: Date.now(),
        isStreaming: true,
        streamedContent: '',
        earningsText,
        transcriptText,
      };
      setAnalysis(seed);

      await streamAnalysis(
        { ticker, earningsText, transcriptText },
        {
          onChunk: (text) => {
            patchAnalysis(ticker, {
              streamedContent: (useStore.getState().analyses[ticker]?.streamedContent ?? '') + text,
            });
          },
          onDone: (fullText) => {
            // Parse the JSON block out of the streamed response
            const parsed = parseAnalysisResponse(ticker, fullText);
            setAnalysis({
              ...parsed,
              ticker,
              analyzedAt: Date.now(),
              isStreaming: false,
              earningsText,
              transcriptText,
            });
          },
          onError: (err) => {
            patchAnalysis(ticker, {
              isStreaming: false,
              streamError: err,
            });
          },
        },
      );
    },
    [ticker, setAnalysis, patchAnalysis],
  );

  return { analysis, runAnalysis };
}

// ─── Parse structured JSON + narrative from streamed LLM output ────────────────

function parseAnalysisResponse(_ticker: string, raw: string): Partial<StockAnalysis> {
  // Expect the LLM to emit a JSON block between ```json ... ``` followed by narrative
  const jsonMatch = raw.match(/```json\s*([\s\S]*?)\s*```/);
  let structured: Partial<StockAnalysis> = {};

  if (jsonMatch) {
    try {
      structured = JSON.parse(jsonMatch[1]);
    } catch {
      // Malformed JSON — continue with narrative only
    }
  }

  // Extract narrative after the JSON block
  const narrative = jsonMatch
    ? raw.slice(raw.indexOf(jsonMatch[0]) + jsonMatch[0].length).trim()
    : raw.trim();

  return {
    ...structured,
    summary: structured.summary ?? narrative.split('\n\n')[0] ?? undefined,
    streamedContent: raw,
  };
}
