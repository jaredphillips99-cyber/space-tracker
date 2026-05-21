import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../../store/useStore';
import { TICKERS } from '../../config/tickers';
import { isAnalysisStale } from '../../types';

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function parseDate(iso?: string): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

function fmtEarningsDate(iso?: string): string {
  const d = parseDate(iso);
  if (!d) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function daysUntil(iso?: string): number | null {
  const d = parseDate(iso);
  if (!d) return null;
  return Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ label }: { label: string }) {
  return (
    <div
      className="px-4 py-2 text-xs tracking-widest"
      style={{
        fontFamily: 'Space Mono, monospace',
        color: '#4a4e63',
        borderBottom: '1px solid #14151c',
      }}
    >
      {label}
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function SidePanel() {
  const navigate = useNavigate();
  const analyses = useStore((s) => s.analyses);

  const staleStocks = useMemo(
    () =>
      TICKERS.filter((t) => {
        const a = analyses[t.ticker];
        return a && isAnalysisStale(a);
      }),
    [analyses],
  );

  const awaitingStocks = useMemo(
    () => TICKERS.filter((t) => !analyses[t.ticker]),
    [analyses],
  );

  const recentAnalyses = useMemo(() => {
    return TICKERS.filter((t) => analyses[t.ticker])
      .map((t) => ({ ticker: t, analysis: analyses[t.ticker]! }))
      .sort((a, b) => b.analysis.analyzedAt - a.analysis.analyzedAt)
      .slice(0, 5);
  }, [analyses]);

  const upcomingEarnings = useMemo(() => {
    return TICKERS.flatMap((t) => {
      const a = analyses[t.ticker];
      const d = daysUntil(a?.nextEarningsDate);
      if (d == null || d < 0 || d > 45) return [];
      return [{ ticker: t, daysUntil: d, date: a!.nextEarningsDate! }];
    }).sort((a, b) => a.daysUntil - b.daysUntil);
  }, [analyses]);

  return (
    <div
      className="flex flex-col h-full overflow-y-auto"
      style={{ backgroundColor: '#0f1117', borderLeft: '1px solid #1e2030' }}
    >
      <div
        className="px-4 py-3 text-sm font-semibold shrink-0"
        style={{
          borderBottom: '1px solid #1e2030',
          fontFamily: 'DM Sans, sans-serif',
          color: '#e2e4ef',
        }}
      >
        What's New
      </div>

      {/* ── Stale warnings ──────────────────────────────────────────────── */}
      {staleStocks.length > 0 && (
        <div>
          <SectionHeader label="NEEDS REFRESH" />
          {staleStocks.map((t) => {
            const a = analyses[t.ticker]!;
            return (
              <button
                key={t.ticker}
                onClick={() => navigate(`/stock/${t.ticker}`)}
                className="w-full text-left px-4 py-2.5 flex items-center justify-between transition-colors"
                style={{
                  borderBottom: '1px solid #14151c',
                  backgroundColor: 'transparent',
                  cursor: 'pointer',
                  borderLeft: '2px solid #f59e0b',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#161821'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'; }}
              >
                <div>
                  <span className="text-xs font-bold" style={{ fontFamily: 'Space Mono, monospace', color: '#f59e0b' }}>
                    {t.ticker}
                  </span>
                  <span className="text-xs ml-2" style={{ color: '#8b8fa8' }}>{t.name}</span>
                </div>
                <span className="text-xs" style={{ fontFamily: 'Space Mono, monospace', color: '#4a4e63' }}>
                  {relativeTime(a.analyzedAt)}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Recent analyses ─────────────────────────────────────────────── */}
      {recentAnalyses.length > 0 && (
        <div>
          <SectionHeader label="RECENTLY ANALYZED" />
          {recentAnalyses.map(({ ticker: t, analysis: a }) => (
            <button
              key={t.ticker}
              onClick={() => navigate(`/stock/${t.ticker}`)}
              className="w-full text-left px-4 py-2.5 flex items-center justify-between transition-colors"
              style={{
                borderBottom: '1px solid #14151c',
                backgroundColor: 'transparent',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#161821'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'; }}
            >
              <div>
                <span
                  className="text-xs font-bold"
                  style={{ fontFamily: 'Space Mono, monospace', color: t.color ?? '#e2e4ef' }}
                >
                  {t.ticker}
                </span>
                {a.summary && (
                  <p
                    className="text-xs mt-0.5 line-clamp-1"
                    style={{ color: '#8b8fa8', maxWidth: 180 }}
                  >
                    {a.summary.slice(0, 80)}…
                  </p>
                )}
              </div>
              <span className="text-xs ml-2 shrink-0" style={{ fontFamily: 'Space Mono, monospace', color: '#4a4e63' }}>
                {relativeTime(a.analyzedAt)}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* ── Upcoming earnings ───────────────────────────────────────────── */}
      {upcomingEarnings.length > 0 && (
        <div>
          <SectionHeader label="UPCOMING EARNINGS" />
          {upcomingEarnings.map(({ ticker: t, daysUntil: d, date }) => (
            <button
              key={t.ticker}
              onClick={() => navigate(`/stock/${t.ticker}`)}
              className="w-full text-left px-4 py-2.5 flex items-center justify-between transition-colors"
              style={{
                borderBottom: '1px solid #14151c',
                backgroundColor: 'transparent',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#161821'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'; }}
            >
              <div>
                <span
                  className="text-xs font-bold"
                  style={{ fontFamily: 'Space Mono, monospace', color: t.color ?? '#e2e4ef' }}
                >
                  {t.ticker}
                </span>
                <span className="text-xs ml-2" style={{ color: '#8b8fa8' }}>
                  {fmtEarningsDate(date)}
                </span>
              </div>
              <span
                className="text-xs px-1.5 py-0.5 rounded"
                style={{
                  fontFamily: 'Space Mono, monospace',
                  backgroundColor: d <= 7 ? '#ef444418' : '#f59e0b18',
                  color: d <= 7 ? '#ef4444' : '#f59e0b',
                  fontSize: 10,
                }}
              >
                {d === 0 ? 'TODAY' : `${d}D`}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* ── Awaiting ────────────────────────────────────────────────────── */}
      {awaitingStocks.length > 0 && (
        <div>
          <SectionHeader label={`AWAITING ANALYSIS (${awaitingStocks.length})`} />
          <div className="px-4 py-3 flex flex-wrap gap-1.5">
            {awaitingStocks.map((t) => (
              <button
                key={t.ticker}
                onClick={() => navigate(`/stock/${t.ticker}`)}
                className="text-xs px-2 py-0.5 rounded transition-colors"
                style={{
                  fontFamily: 'Space Mono, monospace',
                  color: '#4a4e63',
                  border: '1px solid #1e2030',
                  backgroundColor: 'transparent',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#8b8fa8'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#4a4e63'; }}
              >
                {t.ticker}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Empty state ─────────────────────────────────────────────────── */}
      {staleStocks.length === 0 && recentAnalyses.length === 0 && upcomingEarnings.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-xs text-center px-6" style={{ color: '#4a4e63', fontFamily: 'Space Mono, monospace', lineHeight: 1.8 }}>
            No analyses yet.{'\n'}
            Click any stock to run analysis.
          </p>
        </div>
      )}
    </div>
  );
}
