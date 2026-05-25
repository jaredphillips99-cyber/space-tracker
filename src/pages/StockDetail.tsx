import { useParams, useNavigate } from 'react-router-dom';
import { useAnalysis } from '../hooks/useAnalysis';
import { ConvictionBadge } from '../components/ConvictionBadge';
import ReactMarkdown from 'react-markdown';
import { useEffect, useState } from 'react';

interface CachedAnalysis {
  meta: any;
  jsonData: any;
  narrative: string;
  savedAt: number;
}

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function StockDetail() {
  const { ticker } = useParams<{ ticker: string }>();
  const navigate = useNavigate();
  const { run, cancel, status, meta, jsonData, narrative, error, convictionRating } = useAnalysis();
  const [cached, setCached] = useState<CachedAnalysis | null>(null);

  // Load from cache on mount
  useEffect(() => {
    if (!ticker) return;
    const key = `analysis:${ticker}`;
    const stored = localStorage.getItem(key);
    if (stored) {
      try {
        const data = JSON.parse(stored) as CachedAnalysis;
        const age = Date.now() - data.savedAt;
        if (age < CACHE_TTL_MS) {
          setCached(data);
        } else {
          localStorage.removeItem(key);
        }
      } catch {}
    }
  }, [ticker]);

  // Save to cache when analysis completes
  useEffect(() => {
    if (status === 'done' && meta && jsonData) {
      if (!ticker) return;
      const key = `analysis:${ticker}`;
      localStorage.setItem(
        key,
        JSON.stringify({
          meta,
          jsonData,
          narrative,
          savedAt: Date.now(),
        })
      );
    }
  }, [status, meta, jsonData, narrative, ticker]);

  if (!ticker) {
    return <div>Invalid ticker</div>;
  }

  // Use live state if available, otherwise fall back to cache
  const displayMeta = meta || cached?.meta;
  const displayJsonData = jsonData || cached?.jsonData;
  const displayNarrative = narrative || cached?.narrative;
  const displayConvictionRating = convictionRating;

  const isRunning = status === 'fetching_edgar' || status === 'extracting_json' || status === 'writing_narrative';

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#08090d', color: '#e2e6f0' }}>
      <div className="max-w-4xl mx-auto p-6">
        {/* Back button */}
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
          ← Back
        </button>

        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 style={{ fontFamily: 'Space Mono, monospace', fontSize: '32px', marginBottom: 0 }}>
              {ticker}
            </h1>
            {displayMeta && (
              <p style={{ color: '#8b93a8', marginTop: '4px', fontSize: '14px' }}>
                {displayMeta.period} earnings · filed {displayMeta.filingDate} ·{' '}
                <a
                  href={displayMeta.documentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: '#00c8ff', textDecoration: 'none' }}
                >
                  SEC filing ↗
                </a>
              </p>
            )}
          </div>

          {displayConvictionRating && (
            <ConvictionBadge rating={displayConvictionRating} size="lg" />
          )}
        </div>

        {/* Run/Cancel button */}
        <div className="mb-6 flex gap-2">
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
            {isRunning ? '⏳ Running...' : cached ? '↺ Re-run' : 'Run Analysis'}
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
              Cancel
            </button>
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
            <span
              style={{
                display: 'inline-block',
                width: '8px',
                height: '8px',
                backgroundColor: '#00c8ff',
                borderRadius: '50%',
                animation: 'pulse 1.5s infinite',
              }}
            />
            <span style={{ color: '#8b93a8' }}>
              {status === 'fetching_edgar' && 'Fetching earnings data…'}
              {status === 'extracting_json' && 'Extracting financial data…'}
              {status === 'writing_narrative' && 'Writing analysis…'}
            </span>
          </div>
        )}

        {/* Error display */}
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
            Error: {error}
          </div>
        )}

        {/* Financial metrics grid */}
        {displayJsonData && (
          <>
            <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
              <MetricCard
                label="REVENUE"
                value={displayJsonData.revenue ? `$${(displayJsonData.revenue / 1000).toFixed(1)}M` : '—'}
              />
              <MetricCard
                label="REV GROWTH"
                value={
                  displayJsonData.revenueGrowthYoY !== null
                    ? `${(displayJsonData.revenueGrowthYoY * 100).toFixed(1)}%`
                    : '—'
                }
              />
              <MetricCard
                label="GROSS MARGIN"
                value={
                  displayJsonData.grossMarginPercent !== null
                    ? `${(displayJsonData.grossMarginPercent * 100).toFixed(1)}%`
                    : '—'
                }
              />
              <MetricCard
                label="ADJ EBITDA"
                value={
                  displayJsonData.adjustedEbitdaMarginPercent !== null
                    ? `${(displayJsonData.adjustedEbitdaMarginPercent * 100).toFixed(1)}%`
                    : '—'
                }
              />
              <MetricCard
                label="CASH"
                value={displayJsonData.cashAndEquivalents ? `$${(displayJsonData.cashAndEquivalents / 1000).toFixed(1)}M` : '—'}
              />
              <MetricCard
                label="BACKLOG"
                value={displayJsonData.backlog ? `$${(displayJsonData.backlog / 1000).toFixed(1)}M` : '—'}
              />
              <MetricCard
                label="EPS (ADJ)"
                value={displayJsonData.epsAdjusted ? `$${displayJsonData.epsAdjusted.toFixed(2)}` : '—'}
              />
              <MetricCard
                label="ANALYST TARGET"
                value={displayJsonData.analystConsensusTargetPrice ? `$${displayJsonData.analystConsensusTargetPrice.toFixed(2)}` : '—'}
              />
            </div>

            {/* Guidance */}
            {displayJsonData.guidanceDirection && (
              <div
                className="mb-6 p-4 rounded"
                style={{
                  backgroundColor: '#161922',
                  border: '1px solid #1e2230',
                }}
              >
                <div style={{ fontFamily: 'Space Mono, monospace', fontSize: '12px', color: '#8b93a8', marginBottom: '8px' }}>
                  FY GUIDANCE
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    fontFamily: 'Space Mono, monospace',
                  }}
                >
                  <span>
                    ${displayJsonData.guidanceRevenueLow ?? '?'} – $
                    {displayJsonData.guidanceRevenueHigh ?? '?'}M ({displayJsonData.guidancePeriod ?? '—'})
                  </span>
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
                  {displayJsonData.segments.map((seg: any, i: number) => (
                    <div
                      key={i}
                      className="px-2 py-1 rounded text-xs"
                      style={{
                        backgroundColor: '#161922',
                        border: '1px solid #1e2230',
                        fontFamily: 'Space Mono, monospace',
                      }}
                    >
                      {seg.name}: ${seg.revenue ? (seg.revenue / 1000).toFixed(1) : '?'}M
                      {seg.growthYoY !== null && (
                        <span
                          style={{
                            marginLeft: '4px',
                            color: seg.growthYoY >= 0 ? '#00e676' : '#ff4b6e',
                          }}
                        >
                          {seg.growthYoY >= 0 ? '+' : ''}
                          {(seg.growthYoY * 100).toFixed(1)}%
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
          <div
            className="prose prose-invert max-w-none"
            style={{
              fontFamily: 'DM Sans, sans-serif',
            }}
          >
            <ReactMarkdown
              components={{
                h2: ({ node, ...props }) => (
                  <h2
                    style={{
                      fontSize: '18px',
                      fontWeight: 600,
                      marginTop: '20px',
                      marginBottom: '12px',
                      color: '#00c8ff',
                    }}
                    {...props}
                  />
                ),
                p: ({ node, ...props }) => (
                  <p
                    style={{
                      marginBottom: '12px',
                      lineHeight: 1.6,
                    }}
                    {...props}
                  />
                ),
                li: ({ node, ...props }) => (
                  <li
                    style={{
                      marginBottom: '6px',
                      marginLeft: '20px',
                    }}
                    {...props}
                  />
                ),
              }}
            >
              {displayNarrative}
            </ReactMarkdown>
            {isRunning && displayNarrative && (
              <span
                style={{
                  display: 'inline-block',
                  width: '8px',
                  height: '16px',
                  backgroundColor: '#00c8ff',
                  marginLeft: '4px',
                  animation: 'blink 1s infinite',
                }}
              />
            )}
          </div>
        )}

        {!displayNarrative && !isRunning && (
          <div
            style={{
              textAlign: 'center',
              color: '#8b93a8',
              padding: '40px 20px',
            }}
          >
            {error ? 'Analysis failed. Please try again.' : 'Click "Run Analysis" to begin.'}
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes blink {
          0%, 49% { opacity: 1; }
          50%, 100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="p-3 rounded"
      style={{
        backgroundColor: '#161922',
        border: '1px solid #1e2230',
      }}
    >
      <div
        style={{
          fontFamily: 'Space Mono, monospace',
          fontSize: '10px',
          color: '#4a4e63',
          marginBottom: '4px',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: 'Space Mono, monospace',
          fontSize: '14px',
          fontWeight: 600,
          color: '#e2e4ef',
        }}
      >
        {value}
      </div>
    </div>
  );
}

function GuidanceBadge({
  direction,
}: {
  direction: 'raised' | 'maintained' | 'lowered' | 'initiated' | null;
}) {
  const colors: Record<string, string> = {
    raised: '#00e676',
    maintained: '#8b93a8',
    lowered: '#ff4b6e',
    initiated: '#00c8ff',
  };

  const labels: Record<string, string> = {
    raised: 'RAISED',
    maintained: 'MAINTAINED',
    lowered: 'LOWERED',
    initiated: 'INITIATED',
  };

  const color = colors[direction || 'maintained'];
  const label = labels[direction || 'maintained'];

  return (
    <span
      style={{
        backgroundColor: `${color}18`,
        color: color,
        padding: '4px 8px',
        borderRadius: '3px',
        fontSize: '11px',
        fontWeight: 600,
        fontFamily: 'Space Mono, monospace',
        border: `1px solid ${color}66`,
      }}
    >
      {label}
    </span>
  );
}
