import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../../store/useStore';
import { TICKERS } from '../../config/tickers';
import { SECTOR_COLORS } from '../../types';
import type { TickerConfig } from '../../types';
import { getAnalysisFreshness } from '../../lib/analysisFreshness';
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

function daysSince(ts: number): number {
  return Math.floor((Date.now() - ts) / (1000 * 60 * 60 * 24));
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

// ─── Needs Attention ──────────────────────────────────────────────────────────
// Unified stale/earnings tracker — prioritizes "there's a new report you
// haven't looked at" (reportDue) over a flat days-since-analysis timer.

type AttentionTier = 'reportDue' | 'earningsSoon' | 'staleFallback';

interface AttentionItem {
  ticker: TickerConfig;
  tier: AttentionTier;
  sortKey: number;
  secondaryLine: string;
  tag: string;
}

const TIER_COLORS: Record<AttentionTier, { text: string; bg: string }> = {
  reportDue: { text: '#ff4b6e', bg: '#ff4b6e18' },
  earningsSoon: { text: '#ffd166', bg: '#ffd16618' },
  staleFallback: { text: 'var(--text-secondary)', bg: 'transparent' },
};

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

  const needsAttention = useMemo(() => {
    const items: AttentionItem[] = [];

    for (const t of TICKERS) {
      const a = analyses[t.ticker];
      const earningsDate = prices[t.ticker]?.nextEarningsDate ?? null;
      const { status, daysUntilEarnings } = getAnalysisFreshness(a, earningsDate);

      switch (status) {
        case 'reportDue': {
          const overdue = daysUntilEarnings != null ? -daysUntilEarnings : 0;
          items.push({
            ticker: t,
            tier: 'reportDue',
            sortKey: overdue, // more overdue = higher priority
            secondaryLine: `overdue since ${fmtEarningsDate(earningsDate!)}`,
            tag: '⚠ re-run analysis',
          });
          break;
        }
        case 'earningsToday': {
          items.push({
            ticker: t,
            tier: 'earningsSoon', // reuse amber tier/priority slot
            // Prioritize above all other earningsSoon items (they sort soonest-
            // first ascending; -1 places "today" ahead of any 1–7d countdown).
            sortKey: -1,
            secondaryLine: fmtEarningsDate(earningsDate!),
            tag: '⏱ reports today — check before re-running',
          });
          break;
        }
        case 'earningsSoon': {
          items.push({
            ticker: t,
            tier: 'earningsSoon',
            sortKey: daysUntilEarnings ?? 0, // soonest first
            secondaryLine: fmtEarningsDate(earningsDate!),
            tag: `⏱ earnings in ${daysUntilEarnings}d`,
          });
          break;
        }
        case 'staleFallback': {
          const since = a ? daysSince(a.analyzedAt) : Infinity;
          items.push({
            ticker: t,
            tier: 'staleFallback',
            sortKey: since,
            secondaryLine: a ? `last analyzed ${relativeTime(a.analyzedAt)}` : 'never analyzed',
            tag: `◌ stale (${since === Infinity ? '∞' : `${since}d`})`,
          });
          break;
        }
        // 'awaiting' / 'analyzed' → not surfaced in Needs Attention
      }
    }

    const tierOrder: Record<AttentionTier, number> = { reportDue: 0, earningsSoon: 1, staleFallback: 2 };
    return items.sort((a, b) => {
      const tierDiff = tierOrder[a.tier] - tierOrder[b.tier];
      if (tierDiff !== 0) return tierDiff;
      if (a.sortKey === b.sortKey) return 0;
      // earningsSoon sorts soonest-first (ascending); reportDue/staleFallback sort most-urgent-first (descending)
      return a.tier === 'earningsSoon' ? a.sortKey - b.sortKey : b.sortKey - a.sortKey;
    });
  }, [analyses, prices]);

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

      {/* ── Needs Attention ──────────────────────────────────────────────── */}
      <div>
        <SectionHeader label="NEEDS ATTENTION" />
        {needsAttention.length === 0 ? (
          <div className="px-4 py-3" style={{ color: 'var(--text-muted)', fontFamily: 'Space Mono, monospace', fontSize: 11 }}>
            All caught up
          </div>
        ) : (
          needsAttention.map(({ ticker: t, tier, secondaryLine, tag }) => {
            const colors = TIER_COLORS[tier];
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
                      color: tier === 'staleFallback' ? 'var(--text-tertiary)' : 'var(--text-secondary)',
                      fontSize: tier === 'staleFallback' ? 10 : 11,
                    }}
                  >
                    {secondaryLine}
                  </p>
                </div>
                <span
                  className="text-xs px-1.5 py-0.5 rounded shrink-0 ml-2"
                  style={{
                    fontFamily: 'Space Mono, monospace',
                    backgroundColor: colors.bg,
                    color: colors.text,
                    fontSize: tier === 'staleFallback' ? 9 : 10,
                  }}
                >
                  {tag}
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
      {newswireItems.length === 0 && !newswireLoading && recentAnalyses.length === 0 && needsAttention.length === 0 && (
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
