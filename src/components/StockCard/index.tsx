import { useState } from 'react';
import { useStore } from '../../store/useStore';
import { useAnalysis } from '../../hooks/useAnalysis';
import { TICKER_MAP } from '../../config/tickers';
import { computeImpliedUpside, isAnalysisStale, SECTOR_COLORS } from '../../types';

function fmtPrice(n: number) {
  return n >= 1 ? `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `$${n.toFixed(4)}`;
}
function fmtPct(n: number) {
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}
function fmtMktCap(n?: number) {
  if (!n) return '—';
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  return `$${(n / 1e6).toFixed(0)}M`;
}
function fmtMargin(n?: number) {
  if (n == null) return '—';
  return `${(n * 100).toFixed(1)}%`;
}
function relTime(ts?: number) {
  if (!ts) return 'Never';
  const d = Math.floor((Date.now() - ts) / 86400000);
  if (d === 0) return 'Today';
  if (d === 1) return 'Yesterday';
  return `${d} days ago`;
}

// ─── Metric cell ─────────────────────────────────────────────────────────────

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs" style={{ fontFamily: 'Space Mono, monospace', color: '#4a4e63', fontSize: 10 }}>
        {label}
      </span>
      <span className="text-sm font-bold" style={{ fontFamily: 'Space Mono, monospace', color: '#e2e4ef' }}>
        {value}
      </span>
    </div>
  );
}

// ─── Main StockCard ───────────────────────────────────────────────────────────

export function StockCard({ ticker }: { ticker: string }) {
  const [earningsText, setEarningsText] = useState('');
  const [transcriptText, setTranscriptText] = useState('');
  const [inputOpen, setInputOpen] = useState(false);

  const price = useStore((s) => s.prices[ticker]);
  const { analysis, runAnalysis } = useAnalysis(ticker);
  const cfg = TICKER_MAP[ticker];

  if (!cfg) {
    return (
      <div className="p-8 text-center" style={{ color: '#4a4e63' }}>
        Unknown ticker: {ticker}
      </div>
    );
  }

  const accentColor = cfg.color ?? '#8b8fa8';
  const upside = computeImpliedUpside(price?.price, analysis?.analystTarget);
  const stale = analysis && isAnalysisStale(analysis);

  const handleRunAnalysis = async () => {
    setInputOpen(false);
    await runAnalysis(earningsText || undefined, transcriptText || undefined);
  };

  return (
    <div className="flex flex-col gap-6 p-6 max-w-3xl mx-auto">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-1 h-12 rounded-full" style={{ backgroundColor: accentColor }} />
          <div>
            <h1 className="text-2xl font-bold" style={{ fontFamily: 'Space Mono, monospace', color: accentColor }}>
              {ticker}
            </h1>
            <p className="text-sm" style={{ color: '#8b8fa8' }}>{cfg.name}</p>
            <div className="flex gap-1.5 mt-1">
              {cfg.sectors.map((s) => (
                <span
                  key={s}
                  className="px-1.5 py-0.5 rounded text-xs"
                  style={{
                    backgroundColor: `${SECTOR_COLORS[s]}18`,
                    color: SECTOR_COLORS[s],
                    fontFamily: 'Space Mono, monospace',
                    fontSize: 9,
                  }}
                >
                  {s.replace('_', ' ').toUpperCase()}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Price block */}
        {price && !price.fetchError && (
          <div className="text-right">
            <div className="text-2xl font-bold" style={{ fontFamily: 'Space Mono, monospace', color: '#e2e4ef' }}>
              {fmtPrice(price.price)}
            </div>
            <div
              className="text-sm"
              style={{
                fontFamily: 'Space Mono, monospace',
                color: price.changePercent >= 0 ? '#22c55e' : '#ef4444',
              }}
            >
              {fmtPct(price.changePercent)} today
            </div>
            {upside != null && (
              <div
                className="text-xs mt-0.5"
                style={{
                  fontFamily: 'Space Mono, monospace',
                  color: upside >= 0 ? '#22c55e' : '#ef4444',
                }}
              >
                {fmtPct(upside)} to target
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Key metrics row ──────────────────────────────────────────────── */}
      <div
        className="grid grid-cols-4 gap-4 p-4 rounded-lg"
        style={{ backgroundColor: '#0f1117', border: '1px solid #1e2030' }}
      >
        <MetricCell label="MKT CAP" value={fmtMktCap(price?.marketCap)} />
        <MetricCell label="REV GROWTH" value={analysis?.revenueGrowthYoY != null ? fmtPct(analysis.revenueGrowthYoY * 100) : '—'} />
        <MetricCell label="GROSS MARGIN" value={fmtMargin(analysis?.grossMargin)} />
        <MetricCell label="ANALYST TARGET" value={analysis?.analystTarget ? fmtPrice(analysis.analystTarget) : '—'} />
      </div>

      {/* ── Analysis section ─────────────────────────────────────────────── */}
      <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${stale ? '#f59e0b40' : '#1e2030'}` }}>
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ backgroundColor: '#0f1117', borderBottom: '1px solid #1e2030' }}
        >
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold" style={{ fontFamily: 'DM Sans, sans-serif', color: '#e2e4ef' }}>
              Analysis
            </span>
            {stale && (
              <span
                className="px-2 py-0.5 rounded text-xs"
                style={{
                  fontFamily: 'Space Mono, monospace',
                  backgroundColor: '#f59e0b18',
                  color: '#f59e0b',
                  fontSize: 10,
                }}
              >
                STALE — {relTime(analysis?.analyzedAt)}
              </span>
            )}
            {analysis && !stale && (
              <span className="text-xs" style={{ fontFamily: 'Space Mono, monospace', color: '#4a4e63', fontSize: 10 }}>
                {relTime(analysis.analyzedAt)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {analysis?.guidanceDirection && (
              <span
                className="px-2 py-0.5 rounded text-xs"
                style={{
                  fontFamily: 'Space Mono, monospace',
                  backgroundColor:
                    analysis.guidanceDirection === 'Raised' ? '#22c55e18' :
                    analysis.guidanceDirection === 'Lowered' ? '#ef444418' : '#8b8fa818',
                  color:
                    analysis.guidanceDirection === 'Raised' ? '#22c55e' :
                    analysis.guidanceDirection === 'Lowered' ? '#ef4444' : '#8b8fa8',
                  fontSize: 10,
                }}
              >
                {analysis.guidanceDirection.toUpperCase()} GUIDANCE
              </span>
            )}
            <button
              onClick={() => setInputOpen((v) => !v)}
              className="text-xs px-3 py-1 rounded transition-colors"
              style={{
                fontFamily: 'Space Mono, monospace',
                backgroundColor: '#161821',
                color: '#8b8fa8',
                border: '1px solid #1e2030',
                cursor: 'pointer',
              }}
            >
              {analysis ? 'RE-ANALYZE' : 'RUN ANALYSIS'}
            </button>
          </div>
        </div>

        {/* Input form */}
        {inputOpen && (
          <div className="p-4 flex flex-col gap-3" style={{ backgroundColor: '#161821', borderBottom: '1px solid #1e2030' }}>
            <div className="flex flex-col gap-1">
              <label className="text-xs" style={{ fontFamily: 'Space Mono, monospace', color: '#4a4e63' }}>
                EARNINGS RELEASE (optional)
              </label>
              <textarea
                value={earningsText}
                onChange={(e) => setEarningsText(e.target.value)}
                placeholder="Paste earnings press release text..."
                rows={4}
                className="w-full resize-y text-xs p-2 rounded"
                style={{
                  fontFamily: 'Space Mono, monospace',
                  backgroundColor: '#0f1117',
                  border: '1px solid #1e2030',
                  color: '#e2e4ef',
                  outline: 'none',
                }}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs" style={{ fontFamily: 'Space Mono, monospace', color: '#4a4e63' }}>
                EARNINGS CALL TRANSCRIPT (optional)
              </label>
              <textarea
                value={transcriptText}
                onChange={(e) => setTranscriptText(e.target.value)}
                placeholder="Paste earnings call transcript..."
                rows={4}
                className="w-full resize-y text-xs p-2 rounded"
                style={{
                  fontFamily: 'Space Mono, monospace',
                  backgroundColor: '#0f1117',
                  border: '1px solid #1e2030',
                  color: '#e2e4ef',
                  outline: 'none',
                }}
              />
            </div>
            <button
              onClick={handleRunAnalysis}
              className="self-end px-4 py-1.5 rounded text-xs font-bold transition-opacity"
              style={{
                fontFamily: 'Space Mono, monospace',
                backgroundColor: accentColor,
                color: '#08090d',
                cursor: 'pointer',
                border: 'none',
              }}
            >
              ANALYZE →
            </button>
          </div>
        )}

        {/* Analysis content */}
        <div className="p-4" style={{ backgroundColor: '#08090d' }}>
          {analysis?.isStreaming ? (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div
                  className="w-1.5 h-1.5 rounded-full animate-pulse"
                  style={{ backgroundColor: '#a259ff' }}
                />
                <span className="text-xs" style={{ fontFamily: 'Space Mono, monospace', color: '#a259ff' }}>
                  Analyzing {ticker}…
                </span>
              </div>
              <pre
                className="text-xs whitespace-pre-wrap leading-relaxed"
                style={{ fontFamily: 'DM Sans, sans-serif', color: '#8b8fa8', fontSize: 13 }}
              >
                {analysis.streamedContent}
              </pre>
            </div>
          ) : analysis?.streamError ? (
            <div
              className="text-xs p-3 rounded"
              style={{ backgroundColor: '#ef444410', color: '#ef4444', fontFamily: 'Space Mono, monospace' }}
            >
              Error: {analysis.streamError}
            </div>
          ) : analysis?.summary ? (
            <div className="flex flex-col gap-4">
              {/* Summary */}
              <p className="text-sm leading-relaxed" style={{ color: '#e2e4ef', fontFamily: 'DM Sans, sans-serif' }}>
                {analysis.summary}
              </p>

              {/* Bull / Bear */}
              {(analysis.bullCase || analysis.bearCase) && (
                <div className="grid grid-cols-2 gap-3">
                  {analysis.bullCase && (
                    <div className="p-3 rounded" style={{ backgroundColor: '#22c55e0a', border: '1px solid #22c55e20' }}>
                      <div className="text-xs mb-1.5" style={{ fontFamily: 'Space Mono, monospace', color: '#22c55e', fontSize: 10 }}>
                        BULL CASE
                      </div>
                      <p className="text-xs leading-relaxed" style={{ color: '#8b8fa8', fontFamily: 'DM Sans, sans-serif' }}>
                        {analysis.bullCase}
                      </p>
                    </div>
                  )}
                  {analysis.bearCase && (
                    <div className="p-3 rounded" style={{ backgroundColor: '#ef44440a', border: '1px solid #ef444420' }}>
                      <div className="text-xs mb-1.5" style={{ fontFamily: 'Space Mono, monospace', color: '#ef4444', fontSize: 10 }}>
                        BEAR CASE
                      </div>
                      <p className="text-xs leading-relaxed" style={{ color: '#8b8fa8', fontFamily: 'DM Sans, sans-serif' }}>
                        {analysis.bearCase}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Catalysts */}
              {analysis.catalysts && analysis.catalysts.length > 0 && (
                <div>
                  <div className="text-xs mb-2" style={{ fontFamily: 'Space Mono, monospace', color: '#4a4e63', fontSize: 10 }}>
                    CATALYSTS
                  </div>
                  <ul className="flex flex-col gap-1">
                    {analysis.catalysts.map((c, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs" style={{ color: '#8b8fa8', fontFamily: 'DM Sans, sans-serif' }}>
                        <span style={{ color: accentColor, marginTop: 1 }}>›</span>
                        {c}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Risks */}
              {analysis.risks && analysis.risks.length > 0 && (
                <div>
                  <div className="text-xs mb-2" style={{ fontFamily: 'Space Mono, monospace', color: '#4a4e63', fontSize: 10 }}>
                    RISKS
                  </div>
                  <ul className="flex flex-col gap-1">
                    {analysis.risks.map((r, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs" style={{ color: '#8b8fa8', fontFamily: 'DM Sans, sans-serif' }}>
                        <span style={{ color: '#ef4444', marginTop: 1 }}>›</span>
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="py-8 text-center">
              <p className="text-xs" style={{ fontFamily: 'Space Mono, monospace', color: '#4a4e63' }}>
                No analysis yet. Click RUN ANALYSIS to generate one.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
