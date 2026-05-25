/**
 * StockDetail — deep dive page for a single ticker.
 *
 * Route: /stock/:ticker   (React Router v6)
 *
 * Flow:
 *   1. On mount (or "Run Analysis" click) → calls /api/analyze
 *   2. analyze.ts fetches EDGAR internally, then streams back SSE
 *   3. JSON block renders as financial cards; narrative streams in as Markdown prose
 *   4. ConvictionBadge renders the buy/sell rating from the JSON block
 *
 * localStorage caching: stores the last analysis per ticker so the user
 * doesn't burn API calls on repeat visits. Cache invalidated after 30 days.
 */

import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';

import { useAnalysis } from '../hooks/useAnalysis';
import { ConvictionBadge } from './ConvictionBadge';
import type { AnalysisJson, AnalysisMeta } from '../hooks/useAnalysis';

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

const fmtUSD = (v: number | null | undefined, decimals = 1) =>
  v == null ? '—' : `$${v.toFixed(decimals)}M`;

const fmtPct = (v: number | null | undefined) =>
  v == null ? '—' : `${(v * 100).toFixed(1)}%`;

const fmtPrice = (v: number | null | undefined) =>
  v == null ? '—' : `$${v.toFixed(2)}`;

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface CachedAnalysis {
  meta:      AnalysisMeta;
  jsonData:  AnalysisJson;
  narrative: string;
  savedAt:   number;
}

function loadCache(ticker: string): CachedAnalysis | null {
  try {
    const raw = localStorage.getItem(`analysis:${ticker}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedAnalysis;
    if (Date.now() - parsed.savedAt > CACHE_TTL_MS) return null;
    return parsed;
  } catch { return null; }
}

function saveCache(ticker: string, data: CachedAnalysis) {
  try {
    localStorage.setItem(`analysis:${ticker}`, JSON.stringify(data));
  } catch { /* storage full — ignore */ }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-lg p-3 flex flex-col gap-1"
      style={{ background: '#161922', border: '1px solid #1e2230' }}
    >
      <span className="text-xs uppercase tracking-widest" style={{ color: '#8b93a8', fontFamily: "'Space Mono', monospace" }}>
        {label}
      </span>
      <span className="text-lg font-semibold" style={{ fontFamily: "'Space Mono', monospace", color: '#e2e6f0' }}>
        {value}
      </span>
    </div>
  );
}

function GuidanceBadge({ direction }: { direction: AnalysisJson['guidanceDirection'] }) {
  if (!direction) return null;
  const map: Record<string, { label: string; color: string }> = {
    raised:     { label: '▲ Raised',     color: '#00e676' },
    maintained: { label: '— Maintained', color: '#8b93a8' },
    lowered:    { label: '▼ Lowered',    color: '#ff4b6e' },
    initiated:  { label: '◆ Initiated',  color: '#00c8ff' },
  };
  const { label, color } = map[direction] ?? { label: direction, color: '#8b93a8' };
  return (
    <span
      className="text-xs font-mono px-2 py-0.5 rounded"
      style={{ color, background: `${color}18`, border: `1px solid ${color}40` }}
    >
      {label}
    </span>
  );
}

function AnalysisStatusBar({ status, ticker }: { status: string; ticker: string }) {
  const messages: Record<string, string> = {
    fetching_edgar:    `Fetching ${ticker} earnings from SEC EDGAR…`,
    extracting_json:   'Extracting financial metrics…',
    writing_narrative: 'Writing analysis…',
    done:              '',
    error:             '',
    idle:              '',
  };
  const msg = messages[status];
  if (!msg) return null;
  return (
    <div className="flex items-center gap-2 text-sm" style={{ color: '#8b93a8' }}>
      <span className="inline-block w-2 h-2 rounded-full animate-pulse" style={{ background: '#00c8ff' }} />
      {msg}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function StockDetail() {
  const { ticker = '' } = useParams<{ ticker: string }>();
  const navigate = useNavigate();
  const TICKER = ticker.toUpperCase();

  const { run, cancel, status, meta, jsonData, narrative, error, convictionRating } = useAnalysis();

  const [cachedData, setCachedData] = useState<CachedAnalysis | null>(null);
  const [hasRunOnce, setHasRunOnce] = useState(false);

  // Load from cache on mount
  useEffect(() => {
    const cached = loadCache(TICKER);
    if (cached) setCachedData(cached);
  }, [TICKER]);

  // Save to cache when analysis completes
  useEffect(() => {
    if (status === 'done' && meta && jsonData) {
      const toCache: CachedAnalysis = { meta, jsonData, narrative, savedAt: Date.now() };
      saveCache(TICKER, toCache);
      setCachedData(toCache);
    }
  }, [status, meta, jsonData, narrative, TICKER]);

  // What to display — live state takes priority over cache
  const displayMeta      = meta      ?? cachedData?.meta;
  const displayJson      = jsonData  ?? cachedData?.jsonData;
  const displayNarrative = narrative || cachedData?.narrative || '';
  const displayConviction = convictionRating ?? cachedData?.jsonData?.convictionRating ?? null;

  const isLive = status !== 'idle' && status !== 'error';

  function handleRun() {
    setHasRunOnce(true);
    run(TICKER);
  }

  return (
    <div
      className="min-h-screen p-4 md:p-8 max-w-4xl mx-auto"
      style={{ background: '#08090d', color: '#e2e6f0' }}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <button
            onClick={() => navigate('/')}
            className="text-xs mb-2 hover:opacity-80 transition-opacity"
            style={{ color: '#8b93a8', fontFamily: "'Space Mono', monospace" }}
          >
            ← Back
          </button>
          <h1
            className="text-3xl font-bold tracking-tight"
            style={{ fontFamily: "'Space Mono', monospace", color: '#e2e6f0' }}
          >
            {TICKER}
          </h1>
          {displayMeta && (
            <p className="text-sm mt-1" style={{ color: '#8b93a8' }}>
              {displayMeta.period} earnings · filed {displayMeta.filingDate}
              {' · '}
              <a
                href={displayMeta.documentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:opacity-80"
                style={{ color: '#00c8ff' }}
              >
                SEC filing ↗
              </a>
            </p>
          )}
        </div>

        {/* Conviction badge */}
        {displayConviction && displayJson && (
          <ConvictionBadge
            rating={displayConviction}
            rationale={displayJson.convictionRationale}
            size="lg"
          />
        )}
      </div>

      {/* Run / Re-run button */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={isLive ? cancel : handleRun}
          disabled={false}
          className="px-4 py-2 rounded text-sm font-semibold transition-opacity hover:opacity-80 active:scale-95"
          style={{
            fontFamily: "'Space Mono', monospace",
            background: isLive ? '#ff4b6e22' : '#00c8ff22',
            color:       isLive ? '#ff4b6e'   : '#00c8ff',
            border:      `1px solid ${isLive ? '#ff4b6e' : '#00c8ff'}`,
          }}
        >
          {isLive ? 'Cancel' : cachedData ? '↺ Re-run Analysis' : 'Run Analysis'}
        </button>
        <AnalysisStatusBar status={status} ticker={TICKER} />
      </div>

      {/* Error state */}
      {error && (
        <div
          className="rounded-lg p-4 mb-6 text-sm"
          style={{ background: '#ff4b6e18', border: '1px solid #ff4b6e40', color: '#ff4b6e' }}
        >
          {error}
        </div>
      )}

      {/* Financial metrics grid */}
      {displayJson && (
        <section className="mb-8">
          <h2 className="text-xs uppercase tracking-widest mb-3" style={{ color: '#8b93a8', fontFamily: "'Space Mono', monospace" }}>
            Financial Snapshot
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <MetricCard label="Revenue"       value={fmtUSD(displayJson.revenue)} />
            <MetricCard label="Rev Growth YoY" value={fmtPct(displayJson.revenueGrowthYoY)} />
            <MetricCard label="Gross Margin"  value={fmtPct(displayJson.grossMarginPercent)} />
            <MetricCard label="Adj. EBITDA Margin" value={fmtPct(displayJson.adjustedEbitdaMarginPercent)} />
            <MetricCard label="Cash"          value={fmtUSD(displayJson.cashAndEquivalents)} />
            <MetricCard label="Backlog"       value={fmtUSD(displayJson.backlog)} />
            <MetricCard label="EPS (adj)"     value={displayJson.epsAdjusted != null ? `$${displayJson.epsAdjusted.toFixed(2)}` : '—'} />
            <MetricCard label="Analyst Target" value={fmtPrice(displayJson.analystConsensusTargetPrice)} />
          </div>

          {/* Guidance row */}
          {(displayJson.guidanceRevenueLow || displayJson.guidanceRevenueHigh) && (
            <div
              className="rounded-lg p-3 flex flex-wrap items-center gap-3"
              style={{ background: '#161922', border: '1px solid #1e2230' }}
            >
              <span className="text-xs uppercase tracking-widest" style={{ color: '#8b93a8', fontFamily: "'Space Mono', monospace" }}>
                Guidance {displayJson.guidancePeriod}
              </span>
              <span className="font-mono text-sm" style={{ color: '#e2e6f0' }}>
                {displayJson.guidanceRevenueLow != null && displayJson.guidanceRevenueHigh != null
                  ? `$${displayJson.guidanceRevenueLow}M – $${displayJson.guidanceRevenueHigh}M`
                  : fmtUSD(displayJson.guidanceRevenueLow ?? displayJson.guidanceRevenueHigh)}
              </span>
              <GuidanceBadge direction={displayJson.guidanceDirection} />
            </div>
          )}

          {/* Segments */}
          {displayJson.segments && displayJson.segments.length > 0 && (
            <div className="mt-4">
              <p className="text-xs uppercase tracking-widest mb-2" style={{ color: '#8b93a8', fontFamily: "'Space Mono', monospace" }}>
                Segments
              </p>
              <div className="flex flex-wrap gap-2">
                {displayJson.segments.map(seg => (
                  <div
                    key={seg.name}
                    className="rounded px-3 py-2 text-sm"
                    style={{ background: '#161922', border: '1px solid #1e2230' }}
                  >
                    <span style={{ color: '#e2e6f0', fontFamily: "'Space Mono', monospace" }}>{seg.name}</span>
                    <span className="ml-2" style={{ color: '#8b93a8' }}>{fmtUSD(seg.revenue)}</span>
                    {seg.growthYoY != null && (
                      <span
                        className="ml-2 text-xs"
                        style={{ color: seg.growthYoY >= 0 ? '#00e676' : '#ff4b6e' }}
                      >
                        {fmtPct(seg.growthYoY)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Streaming narrative */}
      {displayNarrative && (
        <section>
          <h2 className="text-xs uppercase tracking-widest mb-4" style={{ color: '#8b93a8', fontFamily: "'Space Mono', monospace" }}>
            Analysis
          </h2>
          <div
            className="prose prose-invert prose-sm max-w-none leading-relaxed"
            style={{ color: '#e2e6f0', fontFamily: "'DM Sans', sans-serif" }}
          >
            <ReactMarkdown>{displayNarrative}</ReactMarkdown>
          </div>
          {status === 'writing_narrative' && (
            <span className="inline-block w-1 h-4 ml-0.5 align-text-bottom animate-pulse" style={{ background: '#00c8ff' }} />
          )}
        </section>
      )}

      {/* Empty state */}
      {!displayJson && !displayNarrative && !isLive && !error && (
        <div className="text-center py-16" style={{ color: '#8b93a8' }}>
          <p className="text-sm mb-4">No analysis yet for {TICKER}.</p>
          <p className="text-xs">
            Click "Run Analysis" to automatically fetch the latest earnings release from SEC EDGAR and generate a deep dive.
          </p>
        </div>
      )}
    </div>
  );
}