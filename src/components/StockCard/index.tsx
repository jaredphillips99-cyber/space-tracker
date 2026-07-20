import { useStore } from '../../store/useStore';
import { TICKER_MAP } from '../../config/tickers';
import { computeImpliedUpside, SECTOR_COLORS } from '../../types';

function fmtPrice(n: number) {
  return n >= 1 ? `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `$${n.toFixed(4)}`;
}
function fmtPct(n: number) {
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}
function fmtMktCap(n?: number) {
  if (!n) return '—';
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9)  return `$${(n / 1e9).toFixed(2)}B`;
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

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs" style={{ fontFamily: 'Space Mono, monospace', color: 'var(--text-muted)', fontSize: 10 }}>
        {label}
      </span>
      <span className="text-sm font-bold" style={{ fontFamily: 'Space Mono, monospace', color: 'var(--text-primary)' }}>
        {value}
      </span>
    </div>
  );
}

export function StockCard({ ticker }: { ticker: string }) {
  const price    = useStore((s) => s.prices[ticker]);
  const analysis = useStore((s) => s.analyses[ticker]);
  const cfg      = TICKER_MAP[ticker];

  if (!cfg) {
    return (
      <div className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>
        Unknown ticker: {ticker}
      </div>
    );
  }

  const accentColor = cfg.color ?? 'var(--text-secondary)';
  const jsonData    = analysis?.streamedContent
    ? (() => { try { return JSON.parse(analysis.streamedContent).jsonData; } catch { return null; } })()
    : null;

  const upside = computeImpliedUpside(price?.price, jsonData?.analystConsensusTargetPrice ?? undefined);

  return (
    <div className="flex flex-col gap-6 p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-1 h-12 rounded-full" style={{ backgroundColor: accentColor }} />
          <div>
            <h1 className="text-2xl font-bold" style={{ fontFamily: 'Space Mono, monospace', color: accentColor }}>
              {ticker}
            </h1>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{cfg.name}</p>
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

        {price && !price.fetchError && (
          <div className="text-right">
            <div className="text-2xl font-bold" style={{ fontFamily: 'Space Mono, monospace', color: 'var(--text-primary)' }}>
              {fmtPrice(price.price)}
            </div>
            <div className="text-sm" style={{ fontFamily: 'Space Mono, monospace', color: price.changePercent >= 0 ? '#22c55e' : '#ef4444' }}>
              {fmtPct(price.changePercent)} today
            </div>
            {upside != null && (
              <div className="text-xs mt-0.5" style={{ fontFamily: 'Space Mono, monospace', color: upside >= 0 ? '#22c55e' : '#ef4444' }}>
                {fmtPct(upside)} to target
              </div>
            )}
          </div>
        )}
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-4 gap-4 p-4 rounded-lg" style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
        <MetricCell label="MKT CAP"        value={fmtMktCap(price?.marketCap)} />
        <MetricCell label="REV GROWTH"     value={jsonData?.revenueGrowthYoY != null ? fmtPct(jsonData.revenueGrowthYoY * 100) : '—'} />
        <MetricCell label="GROSS MARGIN"   value={fmtMargin(jsonData?.grossMarginPercent ?? undefined)} />
        <MetricCell label="ANALYST TARGET" value={jsonData?.analystConsensusTargetPrice ? fmtPrice(jsonData.analystConsensusTargetPrice) : '—'} />
      </div>

      {/* Analysis status */}
      <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between px-4 py-3" style={{ backgroundColor: 'var(--bg-surface)', borderBottom: '1px solid var(--border)' }}>
          <span className="text-sm font-semibold" style={{ fontFamily: 'DM Sans, sans-serif', color: 'var(--text-primary)' }}>
            Analysis
          </span>
          {analysis?.analyzedAt && (
            <span className="text-xs" style={{ fontFamily: 'Space Mono, monospace', color: 'var(--text-muted)', fontSize: 10 }}>
              {relTime(analysis.analyzedAt)}
            </span>
          )}
        </div>
        <div className="p-4" style={{ backgroundColor: 'var(--bg-base)' }}>
          {analysis?.summary ? (
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text-primary)', fontFamily: 'DM Sans, sans-serif' }}>
              {analysis.summary}
            </p>
          ) : (
            <div className="py-8 text-center">
              <p className="text-xs" style={{ fontFamily: 'Space Mono, monospace', color: 'var(--text-muted)' }}>
                No analysis yet. Open the stock detail page to run analysis.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}