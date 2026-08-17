import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../../store/useStore';
import { TICKERS } from '../../config/tickers';
import { SECTOR_COLORS } from '../../types';
import type { TickerConfig } from '../../types';
import { useNewswire, sentimentColor } from '../../hooks/useNewswire';

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function extractSnippet(summary?: string): string {
  if (!summary) return '';
  const withoutHeadings = summary
    .split('\n')
    .filter((line) => !line.trim().startsWith('#'))
    .join('\n');
  const trimmed = withoutHeadings.replace(/\n{2,}/g, '\n').trim();
  const firstLine = trimmed.split('\n')[0]?.trim() ?? '';
  return firstLine.replace(/\*\*/g, '');
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

function fmtRunDate(isoDate: string | null): string {
  if (!isoDate) return '';
  const d = new Date(isoDate + 'T12:00:00'); // noon to avoid timezone edge cases
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (isoDate === today.toISOString().split('T')[0]) return 'Today';
  if (isoDate === yesterday.toISOString().split('T')[0]) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Upcoming Earnings ────────────────────────────────────────────────────────
// Purely date-driven — the next 5 tracked-universe tickers with a known
// upcoming earnings date, soonest first. Not tied to analysis staleness
// (staleness stays on the Dashboard's STALE badge — see PriceTable/index.tsx).

interface UpcomingEarningsItem {
  ticker: TickerConfig;
  daysUntil: number;
  dateIso: string;
}

// target is parsed as a UTC-midnight instant (date-only ISO strings parse
// that way); reconstruct its UTC calendar date and diff against today's
// local calendar date treated the same way, so the result is a plain
// midnight-to-midnight day count unaffected by the reader's timezone offset.
function daysUntilFromToday(iso: string): number {
  const target = new Date(iso);
  if (isNaN(target.getTime())) return NaN;
  const targetMidnight = Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate());
  const now = new Date();
  const todayMidnight = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((targetMidnight - todayMidnight) / (1000 * 60 * 60 * 24));
}

function earningsBadgeColor(days: number): { text: string; bg: string } {
  if (days === 0) return { text: '#ff4b6e', bg: '#ff4b6e18' };
  if (days <= 7) return { text: '#ffd166', bg: '#ffd16618' };
  return { text: 'var(--text-secondary)', bg: 'transparent' };
}

function earningsBadgeText(days: number): string {
  if (days === 0) return '⏱ today';
  if (days === 1) return '⏱ tomorrow';
  return `⏱ in ${days}d`;
}

// ─── Section header ───────────────────────────────────────────────────────────
function SectionHeader({ label }: { label: string }) {
  return (
    <div
      className="px-4 py-2 text-xs tracking-widest"
      style={{
        fontFamily: 'Space Mono, monospace',
        color: 'var(--text-muted)',
        borderBottom: '1px solid var(--border-muted)',
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
  const prices = useStore((s) => s.prices);
  const { items: newswireItems, loading: newswireLoading, runDate } = useNewswire();

  const recentAnalyses = useMemo(() => {
    return TICKERS.filter((t) => analyses[t.ticker])
      .map((t) => ({ ticker: t, analysis: analyses[t.ticker]! }))
      .sort((a, b) => b.analysis.analyzedAt - a.analysis.analyzedAt)
      .slice(0, 5);
  }, [analyses]);

  const upcomingEarnings = useMemo(() => {
    const items: UpcomingEarningsItem[] = [];

    for (const t of TICKERS) {
      const dateIso = prices[t.ticker]?.nextEarningsDate;
      if (!dateIso) continue;
      const daysUntil = daysUntilFromToday(dateIso);
      if (isNaN(daysUntil) || daysUntil < 0) continue;
      items.push({ ticker: t, daysUntil, dateIso });
    }

    return items.sort((a, b) => a.daysUntil - b.daysUntil).slice(0, 5);
  }, [prices]);

  return (
    <div
      className="flex flex-col h-full overflow-y-auto"
      style={{ backgroundColor: 'var(--bg-surface)', borderLeft: '1px solid var(--border)' }}
    >
      <div
        className="px-4 py-3 text-sm font-semibold shrink-0"
        style={{
          borderBottom: '1px solid var(--border)',
          fontFamily: 'DM Sans, sans-serif',
          color: 'var(--text-primary)',
        }}
      >
        What's New
      </div>

      {/* ── Today's Newswire ──────────────────────────────────────────────── */}
      {(newswireLoading || newswireItems.length > 0) && (
        <div>
          <div
            className="px-4 py-2 flex items-center justify-between"
            style={{
              fontFamily: 'Space Mono, monospace',
              color: 'var(--text-muted)',
              borderBottom: '1px solid var(--border-muted)',
              fontSize: 10,
              letterSpacing: '0.1em',
            }}
          >
            <span>TODAY'S WIRE</span>
            {runDate && (
              <span style={{ color: 'var(--text-dim)', fontSize: 9 }}>
                {fmtRunDate(runDate)}
              </span>
            )}
          </div>

          {newswireLoading ? (
            <div className="px-4 py-3" style={{ color: 'var(--text-dim)', fontFamily: 'Space Mono, monospace', fontSize: 10 }}>
              Loading…
            </div>
          ) : (
            newswireItems.slice(0, 3).map((item) => {
              const tickerConfig = TICKERS.find((t) => t.ticker === item.ticker);
              const sectorColor = tickerConfig
                ? (SECTOR_COLORS[tickerConfig.sectors[0] as keyof typeof SECTOR_COLORS] ?? 'var(--text-primary)')
                : 'var(--text-primary)';

              return (
                <button
                  key={item.id}
                  onClick={() => navigate(`/stock/${item.ticker}`)}
                  className="w-full text-left px-4 py-2.5 transition-colors"
                  style={{
                    borderBottom: '1px solid var(--border-muted)',
                    backgroundColor: 'transparent',
                    cursor: 'pointer',
                    display: 'block',
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--bg-elevated)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'; }}
                >
                  {/* Ticker + sentiment dot */}
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="text-xs font-bold"
                      style={{ fontFamily: 'Space Mono, monospace', color: sectorColor }}
                    >
                      {item.ticker}
                    </span>
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        backgroundColor: sentimentColor(item.sentiment),
                        display: 'inline-block',
                        flexShrink: 0,
                      }}
                    />
                  </div>
                  {/* Headline */}
                  <p
                    className="text-xs leading-snug mb-1"
                    style={{
                      fontFamily: 'DM Sans, sans-serif',
                      color: 'var(--text-body)',
                      fontWeight: 500,
                    }}
                  >
                    {item.headline}
                  </p>
                  {/* Summary */}
                  <p
                    className="text-xs leading-snug"
                    style={{
                      fontFamily: 'DM Sans, sans-serif',
                      color: 'var(--text-tertiary)',
                    }}
                  >
                    {item.summary}
                  </p>
                </button>
              );
            })
          )}

          {!newswireLoading && newswireItems.length > 0 && (
            <button
              onClick={() => navigate('/')}
              className="w-full text-left px-4 py-2 transition-colors"
              style={{
                fontFamily: 'Space Mono, monospace',
                color: 'var(--text-muted)',
                fontSize: 10,
                letterSpacing: '0.08em',
                background: 'none',
                border: 'none',
                borderBottom: '1px solid var(--border-muted)',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)'; }}
            >
              See all news →
            </button>
          )}
        </div>
      )}

      {/* ── Upcoming Earnings ────────────────────────────────────────────── */}
      <div>
        <SectionHeader label="UPCOMING EARNINGS" />
        {upcomingEarnings.length === 0 ? (
          <div className="px-4 py-3" style={{ color: 'var(--text-muted)', fontFamily: 'Space Mono, monospace', fontSize: 11 }}>
            No known upcoming dates
          </div>
        ) : (
          upcomingEarnings.map(({ ticker: t, daysUntil, dateIso }) => {
            const colors = earningsBadgeColor(daysUntil);
            const sectorColor = SECTOR_COLORS[t.sectors[0] as keyof typeof SECTOR_COLORS] ?? 'var(--text-primary)';
            return (
              <button
                key={t.ticker}
                onClick={() => navigate(`/stock/${t.ticker}`)}
                className="w-full text-left px-4 py-2.5 flex items-center justify-between transition-colors"
                style={{
                  borderBottom: '1px solid var(--border-muted)',
                  backgroundColor: 'transparent',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--bg-elevated)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'; }}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        backgroundColor: sectorColor,
                        display: 'inline-block',
                        flexShrink: 0,
                      }}
                    />
                    <span className="text-xs font-bold" style={{ fontFamily: 'Space Mono, monospace', color: sectorColor }}>
                      {t.ticker}
                    </span>
                  </div>
                  <p
                    className="mt-0.5 truncate"
                    style={{
                      fontFamily: 'DM Sans, sans-serif',
                      color: 'var(--text-secondary)',
                      fontSize: 11,
                    }}
                  >
                    {fmtEarningsDate(dateIso)}
                  </p>
                </div>
                <span
                  className="text-xs px-1.5 py-0.5 rounded shrink-0 ml-2"
                  style={{
                    fontFamily: 'Space Mono, monospace',
                    backgroundColor: colors.bg,
                    color: colors.text,
                    fontSize: 10,
                  }}
                >
                  {earningsBadgeText(daysUntil)}
                </span>
              </button>
            );
          })
        )}
      </div>

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
                borderBottom: '1px solid var(--border-muted)',
                backgroundColor: 'transparent',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--bg-elevated)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'; }}
            >
              <div>
                <span
                  className="text-xs font-bold"
                  style={{ fontFamily: 'Space Mono, monospace', color: SECTOR_COLORS[t.sectors[0] as keyof typeof SECTOR_COLORS] ?? 'var(--text-primary)' }}
                >
                  {t.ticker}
                </span>
                {a.summary && (() => {
                  const snippet = extractSnippet(a.summary);
                  return snippet ? (
                    <p
                      className="text-xs mt-0.5 line-clamp-2"
                      style={{ color: 'var(--text-secondary)', maxWidth: 180 }}
                    >
                      {snippet.length > 90 ? snippet.slice(0, 90) + '…' : snippet}
                    </p>
                  ) : null;
                })()}
              </div>
              <span className="text-xs ml-2 shrink-0" style={{ fontFamily: 'Space Mono, monospace', color: 'var(--text-muted)' }}>
                {relativeTime(a.analyzedAt)}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* ── Empty state ─────────────────────────────────────────────────── */}
      {newswireItems.length === 0 && !newswireLoading && recentAnalyses.length === 0 && upcomingEarnings.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-xs text-center px-6" style={{ color: 'var(--text-muted)', fontFamily: 'Space Mono, monospace', lineHeight: 1.8 }}>
            No analyses yet.{'\n'}
            Click any stock to run analysis.
          </p>
        </div>
      )}
    </div>
  );
}
