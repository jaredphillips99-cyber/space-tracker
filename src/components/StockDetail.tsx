import { useParams, useNavigate } from 'react-router-dom';
import { useCallback } from 'react';
import { useAnalysis, type AnalysisCompletePayload } from '../hooks/useAnalysis';
import type { AnalysisMeta, AnalysisJson } from '../hooks/useAnalysis';
import { useStore } from '../store/useStore';
import { ConvictionBadge } from './ConvictionBadge';
import ReactMarkdown from 'react-markdown';
import type { StockAnalysis, GuidanceDirection, AnalystRating } from '../types';

export function StockDetail() {
  const { ticker } = useParams<{ ticker: string }>();
  const navigate   = useNavigate();

  // ── Store: source of truth for persisted analysis ─────────────────────────
  const setAnalysis    = useStore(s => s.setAnalysis);
  const storedAnalysis = useStore(s => ticker ? s.analyses[ticker] : undefined);
  const livePrice      = useStore(s => ticker ? s.prices[ticker] : undefined);

  // ── Write to store when analysis completes ────────────────────────────────
  const handleComplete = useCallback(
    (payload: AnalysisCompletePayload) => {
      if (!ticker) return;
      const { meta, jsonData, narrative } = payload;
      setAnalysis({
        ticker,
        analyzedAt:         Date.now(),
        analystTarget:      jsonData.analystConsensusTargetPrice ?? undefined,
        guidanceDirection:  mapGuidanceDirection(jsonData.guidanceDirection),
        analystRating:      mapConvictionToRating(jsonData.convictionRating),
        revenueGrowthYoY:   jsonData.revenueGrowthYoY ?? undefined,
        grossMargin:        jsonData.grossMarginPercent ?? undefined,
        recentRevenue:      jsonData.revenue ?? undefined,
        recentEPS:          jsonData.epsAdjusted ?? undefined,
        summary:            narrative,
        earningsText:       meta.documentUrl ?? undefined,
        streamedContent:    JSON.stringify({ meta, jsonData }),
      });
    },
    [ticker, setAnalysis],
  );

  const { run, cancel, status, meta, jsonData, narrative, error, convictionRating } =
    useAnalysis({ onComplete: handleComplete });

  if (!ticker) return <div>Invalid ticker</div>;

  const isRunning = status === 'fetching_edgar' || status === 'extracting_json' || status === 'writing_narrative';

  // ── Resolve display data: live stream first, then persisted store ─────────


let displayMeta:       AnalysisMeta | null = null;
let displayJsonData:   AnalysisJson | null = null;
let displayNarrative:  string             = '';
let displayConviction: string | null      = null;

if (status === 'fetching_edgar' || status === 'extracting_json' || status === 'writing_narrative' || status === 'done') {
    displayMeta       = meta      ?? null;
    displayJsonData   = jsonData  ?? null;
    displayNarrative  = narrative ?? '';
    displayConviction = convictionRating ?? null;
  } else if (storedAnalysis) {
    const recovered   = recoverFromStore(storedAnalysis);
    displayMeta       = recovered.meta;
    displayJsonData   = recovered.jsonData;
    displayNarrative  = storedAnalysis.summary ?? '';
    displayConviction = storedAnalysis.analystRating
      ? ratingToConviction(storedAnalysis.analystRating)
      : null;
  }

  const hasCached = !!storedAnalysis;

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#08090d', color: '#e2e6f0' }}>
      <div className="max-w-4xl mx-auto p-6">

        {/* Back */}
        <button
          onClick={() => navigate('/')}
          className="mb-6 px-3 py-1.5 rounded text-sm"
          style={{
            backgroundColor: '#161922',
            border: '1px solid #1e2230',
            color: '#00c8ff',
            fontFamily: 'Space Mono, monospace',
            cursor: 'pointer',
          }}
        >
          ← DASHBOARD
        </button>

        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '16px' }}>
              <h1 style={{ fontFamily: 'Space Mono, monospace', fontSize: '32px', margin: 0 }}>
                {ticker}
              </h1>
              {livePrice && (
                <span style={{ fontFamily: 'Space Mono, monospace', fontSize: '20px', color: '#e2e6f0' }}>
                  ${livePrice.price.toFixed(2)}
                  <span style={{
                    fontSize: '14px',
                    marginLeft: '8px',
                    color: livePrice.changePercent >= 0 ? '#00e676' : '#ff4b6e',
                  }}>
                    {livePrice.changePercent >= 0 ? '+' : ''}{livePrice.changePercent.toFixed(2)}%
                  </span>
                </span>
              )}
            </div>
            {displayMeta && (
              <p style={{ color: '#8b93a8', marginTop: '4px', fontSize: '14px' }}>
                {displayMeta.period && <span>{displayMeta.period} earnings · </span>}
                {displayMeta.filingDate && <span>filed {displayMeta.filingDate} · </span>}
                {displayMeta.documentUrl && (
                  <a
                    href={displayMeta.documentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: '#00c8ff', textDecoration: 'none' }}
                  >
                    SEC filing ↗
                  </a>
                )}
                {displayMeta.note && (
                  <span style={{ color: '#ffd166', marginLeft: '8px' }}>⚠ {displayMeta.note}</span>
                )}
              </p>
            )}
          </div>

          {displayConviction && (
            <ConvictionBadge rating={displayConviction as any} size="lg" />
          )}
        </div>

        {/* Run / Re-run / Cancel buttons */}
        <div className="mb-6 flex gap-2 items-center">
          <button
            onClick={() => run(ticker)}
            disabled={isRunning}
            style={{
              backgroundColor: '#00c8ff',
              color: '#08090d',
              padding: '8px 16px',
              borderRadius: '4px',
              border: 'none',
              fontFamily: 'Space Mono, monospace',
              fontWeight: 600,
              cursor: isRunning ? 'not-allowed' : 'pointer',
              opacity: isRunning ? 0.5 : 1,
            }}
          >
            {isRunning ? '⏳ RUNNING…' : hasCached ? '↺ RE-RUN ANALYSIS' : 'RUN ANALYSIS'}
          </button>

          {isRunning && (
            <button
              onClick={cancel}
              style={{
                backgroundColor: '#ff4b6e',
                color: '#ffffff',
                padding: '8px 16px',
                borderRadius: '4px',
                border: 'none',
                fontFamily: 'Space Mono, monospace',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              CANCEL
            </button>
          )}

          {hasCached && !isRunning && storedAnalysis?.analyzedAt && (
            <span style={{ fontFamily: 'Space Mono, monospace', fontSize: '11px', color: '#4a4e63' }}>
              cached {formatAge(storedAnalysis.analyzedAt)}
            </span>
          )}
        </div>

        {/* Status bar */}
        {isRunning && (
          <div
            className="mb-6 px-4 py-3 rounded"
            style={{
              backgroundColor: '#161922',
              border: '1px solid #1e2230',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontFamily: 'DM Sans, sans-serif',
            }}
          >
            <span style={{
              display: 'inline-block', width: '8px', height: '8px',
              backgroundColor: '#00c8ff', borderRadius: '50%',
              animation: 'pulse 1.5s infinite',
            }} />
            <span style={{ color: '#8b93a8' }}>
              {status === 'fetching_edgar'    && 'Fetching earnings filing from SEC EDGAR…'}
              {status === 'extracting_json'   && 'Extracting financial data…'}
              {status === 'writing_narrative' && 'Writing analysis…'}
            </span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div
            className="mb-6 px-4 py-3 rounded"
            style={{
              backgroundColor: '#ff4b6e20',
              border: '1px solid #ff4b6e',
              color: '#ff4b6e',
              fontFamily: 'DM Sans, sans-serif',
            }}
          >
            {error}
          </div>
        )}

        {/* Financial metrics grid */}
        {displayJsonData && (
          <>
            <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
              <MetricCard label="REVENUE"      value={fmt.dollars(displayJsonData.revenue, 'M')} />
              <MetricCard label="REV GROWTH"   value={fmt.percent(displayJsonData.revenueGrowthYoY)} />
              <MetricCard label="GROSS MARGIN" value={fmt.percent(displayJsonData.grossMarginPercent)} />
              <MetricCard label="ADJ EBITDA"   value={fmt.percent(displayJsonData.adjustedEbitdaMarginPercent)} />
              <MetricCard label="CASH"         value={fmt.dollars(displayJsonData.cashAndEquivalents, 'M')} />
              <MetricCard label="BACKLOG"      value={fmt.dollars(displayJsonData.backlog, 'M')} />
              <MetricCard label="EPS (ADJ)"    value={displayJsonData.epsAdjusted != null ? `$${displayJsonData.epsAdjusted.toFixed(2)}` : '—'} />
              <MetricCard
                label="ANALYST TARGET"
                value={displayJsonData.analystConsensusTargetPrice != null
                  ? `$${displayJsonData.analystConsensusTargetPrice.toFixed(2)}`
                  : '—'}
                sub={
                  displayJsonData.analystConsensusTargetPrice && livePrice?.price
                    ? computeUpside(livePrice.price, displayJsonData.analystConsensusTargetPrice)
                    : undefined
                }
              />
            </div>

            {/* Guidance */}
            {displayJsonData.guidanceDirection && (
              <div
                className="mb-6 p-4 rounded"
                style={{ backgroundColor: '#161922', border: '1px solid #1e2230' }}
              >
                <div style={{ fontFamily: 'Space Mono, monospace', fontSize: '12px', color: '#8b93a8', marginBottom: '8px' }}>
                  FY GUIDANCE
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontFamily: 'Space Mono, monospace' }}>
                  {(displayJsonData.guidanceRevenueLow != null || displayJsonData.guidanceRevenueHigh != null) && (
                    <span>
                      ${displayJsonData.guidanceRevenueLow ?? '?'}–${displayJsonData.guidanceRevenueHigh ?? '?'}M
                      {displayJsonData.guidancePeriod && ` (${displayJsonData.guidancePeriod})`}
                    </span>
                  )}
                  <GuidanceBadge direction={displayJsonData.guidanceDirection} />
                </div>
              </div>
            )}

            {/* Segments */}
            {displayJsonData.segments && displayJsonData.segments.length > 0 && (
              <div className="mb-6">
                <div style={{ fontFamily: 'Space Mono, monospace', fontSize: '12px', color: '#8b93a8', marginBottom: '8px' }}>
                  SEGMENTS
                </div>
                <div className="flex flex-wrap gap-2">
                  {displayJsonData.segments.map((seg, i) => (
                    <div key={i} className="px-2 py-1 rounded text-xs"
                      style={{ backgroundColor: '#161922', border: '1px solid #1e2230', fontFamily: 'Space Mono, monospace' }}
                    >
                      {seg.name}: {seg.revenue != null ? `$${(seg.revenue / 1000).toFixed(1)}M` : '?'}
                      {seg.growthYoY != null && (
                        <span style={{ marginLeft: '4px', color: seg.growthYoY >= 0 ? '#00e676' : '#ff4b6e' }}>
                          {seg.growthYoY >= 0 ? '+' : ''}{(seg.growthYoY * 100).toFixed(1)}%
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Narrative */}
        {displayNarrative && (
          <div className="prose prose-invert max-w-none" style={{ fontFamily: 'DM Sans, sans-serif' }}>
            <ReactMarkdown
              components={{
                h2: ({ ...props }) => (
                  <h2 style={{ fontSize: '18px', fontWeight: 600, marginTop: '20px', marginBottom: '12px', color: '#00c8ff' }} {...props} />
                ),
                p: ({ ...props }) => (
                  <p style={{ marginBottom: '12px', lineHeight: 1.6 }} {...props} />
                ),
                li: ({ ...props }) => (
                  <li style={{ marginBottom: '6px', marginLeft: '20px' }} {...props} />
                ),
              }}
            >
              {displayNarrative}
            </ReactMarkdown>
            {isRunning && (
              <span style={{
                display: 'inline-block', width: '8px', height: '16px',
                backgroundColor: '#00c8ff', marginLeft: '4px',
                animation: 'blink 1s infinite',
              }} />
            )}
          </div>
        )}

        {!displayNarrative && !isRunning && (
          <div style={{ textAlign: 'center', color: '#8b93a8', padding: '40px 20px' }}>
            {error ? 'Analysis failed. Try again.' : 'Click "RUN ANALYSIS" to generate an AI-powered earnings breakdown.'}
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        @keyframes blink  { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0; } }
      `}</style>
    </div>
  );
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

const fmt = {
  dollars: (val: number | null | undefined, unit: 'M' | 'B' = 'M'): string => {
    if (val == null) return '—';
    const divisor = unit === 'M' ? 1000 : 1_000_000;
    return `$${(val / divisor).toFixed(1)}${unit}`;
  },
  percent: (val: number | null | undefined): string => {
    if (val == null) return '—';
    return `${(val * 100).toFixed(1)}%`;
  },
};

function computeUpside(price: number, target: number): string {
  const pct = ((target - price) / price) * 100;
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}% upside`;
}

function formatAge(ts: number): string {
  const mins  = Math.floor((Date.now() - ts) / 60000);
  if (mins < 60)  return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// ─── Store recovery helpers ───────────────────────────────────────────────────

function recoverFromStore(stored: StockAnalysis): {
  meta: AnalysisMeta | null;
  jsonData: AnalysisJson | null;
} {
  if (!stored.streamedContent) return { meta: null, jsonData: null };
  try {
    const parsed = JSON.parse(stored.streamedContent) as {
      meta: AnalysisMeta;
      jsonData: AnalysisJson;
    };
    return { meta: parsed.meta ?? null, jsonData: parsed.jsonData ?? null };
  } catch {
    return { meta: null, jsonData: null };
  }
}

function mapGuidanceDirection(
  d: 'raised' | 'maintained' | 'lowered' | 'initiated' | null,
): GuidanceDirection | undefined {
  if (!d) return undefined;
  const map: Record<string, GuidanceDirection> = {
    raised:     'Raised',
    maintained: 'Maintained',
    lowered:    'Lowered',
    initiated:  'Raised',
  };
  return map[d];
}

function mapConvictionToRating(c: string | null): AnalystRating | undefined {
  if (!c) return undefined;
  const map: Record<string, AnalystRating> = {
    strong_buy:  'Strong Buy',
    buy:         'Buy',
    hold:        'Hold',
    sell:        'Sell',
    strong_sell: 'Strong Sell',
  };
  return map[c];
}

function ratingToConviction(r: AnalystRating): string {
  const map: Record<AnalystRating, string> = {
    'Strong Buy':  'strong_buy',
    'Buy':         'buy',
    'Hold':        'hold',
    'Sell':        'sell',
    'Strong Sell': 'strong_sell',
  };
  return map[r] ?? 'hold';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MetricCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="p-3 rounded" style={{ backgroundColor: '#161922', border: '1px solid #1e2230' }}>
      <div style={{ fontFamily: 'Space Mono, monospace', fontSize: '10px', color: '#4a4e63', marginBottom: '4px' }}>
        {label}
      </div>
      <div style={{ fontFamily: 'Space Mono, monospace', fontSize: '14px', fontWeight: 600, color: '#e2e4ef' }}>
        {value}
      </div>
      {sub && (
        <div style={{
          fontFamily: 'Space Mono, monospace', fontSize: '10px', marginTop: '2px',
          color: sub.startsWith('+') ? '#00e676' : '#ff4b6e',
        }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function GuidanceBadge({ direction }: {
  direction: 'raised' | 'maintained' | 'lowered' | 'initiated' | null;
}) {
  const colors: Record<string, string> = {
    raised: '#00e676', maintained: '#8b93a8', lowered: '#ff4b6e', initiated: '#00c8ff',
  };
  const labels: Record<string, string> = {
    raised: 'RAISED', maintained: 'MAINTAINED', lowered: 'LOWERED', initiated: 'INITIATED',
  };
  const key   = direction ?? 'maintained';
  const color = colors[key];
  return (
    <span style={{
      backgroundColor: `${color}18`, color, padding: '4px 8px', borderRadius: '3px',
      fontSize: '11px', fontWeight: 600, fontFamily: 'Space Mono, monospace',
      border: `1px solid ${color}66`,
    }}>
      {labels[key]}
    </span>
  );
}