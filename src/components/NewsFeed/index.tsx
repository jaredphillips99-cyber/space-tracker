import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../../store/useStore';
import { TICKER_MAP } from '../../config/tickers';
import { SECTOR_COLORS } from '../../types';
import { useNewsArchive } from '../../hooks/useNewsArchive';
import { sentimentColor } from '../../hooks/useNewswire';
import { rankFrontPage } from '../../lib/newsRanking';
import type { NewsStory } from '../../lib/newsRanking';
import { IndexTicker } from '../IndexTicker';

// ─── Relative time ────────────────────────────────────────────────────────────
function relativeTime(iso: string): string {
  const ts = new Date(iso).getTime();
  if (isNaN(ts)) return '';
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / (1000 * 60));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function sectorColorFor(ticker: string): string {
  const cfg = TICKER_MAP[ticker];
  return cfg
    ? (SECTOR_COLORS[cfg.sectors[0] as keyof typeof SECTOR_COLORS] ?? 'var(--text-primary)')
    : 'var(--text-primary)';
}

// ─── Ticker badges ────────────────────────────────────────────────────────────
function TickerBadges({ tickers }: { tickers: string[] }) {
  const navigate = useNavigate();
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {tickers.map((t) => (
        <button
          key={t}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate(`/stock/${t}`); }}
          className="text-xs font-bold px-1.5 py-0.5 rounded transition-colors"
          style={{
            fontFamily: 'Space Mono, monospace',
            color: sectorColorFor(t),
            backgroundColor: `${sectorColorFor(t)}14`,
            border: 'none',
            cursor: 'pointer',
          }}
          title={`View ${t}`}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

function SentimentDot({ sentiment }: { sentiment: NewsStory['sentiment'] }) {
  return (
    <span
      style={{
        width: 6,
        height: 6,
        borderRadius: '50%',
        backgroundColor: sentimentColor(sentiment),
        display: 'inline-block',
        flexShrink: 0,
      }}
    />
  );
}

// ─── Section header ───────────────────────────────────────────────────────────
function SectionLabel({ label }: { label: string }) {
  return (
    <div
      className="text-xs tracking-widest mb-3"
      style={{
        fontFamily: 'Space Mono, monospace',
        color: 'var(--text-muted)',
        fontSize: 11,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
      }}
    >
      {label}
    </div>
  );
}

// ─── Lead (hero) card ─────────────────────────────────────────────────────────
function LeadCard({ story }: { story: NewsStory }) {
  return (
    <a
      href={story.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex flex-col p-4 rounded transition-colors no-underline"
      style={{
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        textDecoration: 'none',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.backgroundColor = 'var(--bg-elevated)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.backgroundColor = 'var(--bg-surface)'; }}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <TickerBadges tickers={story.tickers} />
        <SentimentDot sentiment={story.sentiment} />
      </div>
      <p
        className="leading-snug mb-3 flex-1"
        style={{
          fontFamily: 'DM Sans, sans-serif',
          color: 'var(--text-primary)',
          fontWeight: 600,
          fontSize: 15,
        }}
      >
        {story.headline}
      </p>
      <span
        className="text-xs"
        style={{ fontFamily: 'Space Mono, monospace', color: 'var(--text-muted)', fontSize: 10 }}
      >
        {relativeTime(story.publishedAt)}
      </span>
    </a>
  );
}

// ─── Mover row (compact) ──────────────────────────────────────────────────────
function MoverRow({ story }: { story: NewsStory }) {
  return (
    <a
      href={story.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 px-3 py-2.5 rounded transition-colors no-underline"
      style={{
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-muted)',
        textDecoration: 'none',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.backgroundColor = 'var(--bg-elevated)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.backgroundColor = 'var(--bg-surface)'; }}
    >
      <div className="shrink-0">
        <TickerBadges tickers={story.tickers} />
      </div>
      <span
        className="shrink-0 text-xs font-bold"
        style={{ fontFamily: 'Space Mono, monospace', color: 'var(--text-secondary)', fontSize: 11 }}
        title="Largest 1-day move among tickers on this story"
      >
        {story.maxAbsMovePercent.toFixed(1)}%
      </span>
      <p
        className="flex-1 truncate leading-snug"
        style={{ fontFamily: 'DM Sans, sans-serif', color: 'var(--text-body)', fontSize: 13, fontWeight: 500 }}
      >
        {story.headline}
      </p>
      <span
        className="shrink-0 text-xs"
        style={{ fontFamily: 'Space Mono, monospace', color: 'var(--text-muted)', fontSize: 10 }}
      >
        {relativeTime(story.publishedAt)}
      </span>
    </a>
  );
}

// ─── Feed row (dense) ─────────────────────────────────────────────────────────
function FeedRow({ story }: { story: NewsStory }) {
  return (
    <a
      href={story.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 px-3 py-3 transition-colors no-underline"
      style={{
        borderBottom: '1px solid var(--border-muted)',
        textDecoration: 'none',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.backgroundColor = 'var(--bg-elevated)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.backgroundColor = 'transparent'; }}
    >
      <div className="shrink-0">
        <TickerBadges tickers={story.tickers} />
      </div>
      <SentimentDot sentiment={story.sentiment} />
      <p
        className="flex-1 truncate leading-snug"
        style={{ fontFamily: 'DM Sans, sans-serif', color: 'var(--text-body)', fontSize: 13.5, fontWeight: 500 }}
      >
        {story.headline}
      </p>
      <span
        className="shrink-0 text-xs"
        style={{ fontFamily: 'Space Mono, monospace', color: 'var(--text-muted)', fontSize: 10 }}
      >
        {relativeTime(story.publishedAt)}
      </span>
    </a>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export function NewsFeed() {
  const { items, loading, loadingMore, error, hasMore, loadMore } = useNewsArchive();
  const prices = useStore((s) => s.prices);

  const { lead, movers, feed } = useMemo(
    () => rankFrontPage(items, prices),
    [items, prices],
  );

  return (
    <div className="h-full overflow-y-auto" style={{ height: 'calc(100vh - 88px)' }}>
      <div className="max-w-5xl mx-auto px-6 py-6">
        {/* Page header */}
        <div className="mb-6">
          <h1
            className="text-lg font-bold"
            style={{ fontFamily: 'Space Mono, monospace', color: 'var(--text-primary)', margin: 0 }}
          >
            News
          </h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)', fontFamily: 'DM Sans, sans-serif' }}>
            Space economy, AI infrastructure, defense & clean energy
          </p>
        </div>

        {/* AI Index — live composite + sub-index widget (zero extra fetches) */}
        <IndexTicker />

        {/* Error (inline, non-fatal) */}
        {error && (
          <div
            className="mb-4 px-3 py-2 rounded text-xs"
            style={{
              fontFamily: 'Space Mono, monospace',
              backgroundColor: '#ff4b6e18',
              color: '#ff4b6e',
            }}
          >
            Couldn't load news — {error}
          </div>
        )}

        {/* Initial loading */}
        {loading ? (
          <div
            className="px-3 py-8 text-center text-xs"
            style={{ color: 'var(--text-dim)', fontFamily: 'Space Mono, monospace' }}
          >
            Loading news…
          </div>
        ) : items.length === 0 && !error ? (
          <div
            className="px-3 py-16 text-center text-xs"
            style={{ color: 'var(--text-muted)', fontFamily: 'Space Mono, monospace', lineHeight: 1.8 }}
          >
            No news yet.
          </div>
        ) : (
          <>
            {/* Lead stories */}
            {lead.length > 0 && (
              <section className="mb-8">
                <SectionLabel label="Lead Stories" />
                <div
                  className="grid gap-3"
                  style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}
                >
                  {lead.map((story) => (
                    <LeadCard key={story.url} story={story} />
                  ))}
                </div>
              </section>
            )}

            {/* Also moving */}
            {movers.length > 0 && (
              <section className="mb-8">
                <SectionLabel label="Also Moving" />
                <div className="flex flex-col gap-2">
                  {movers.map((story) => (
                    <MoverRow key={story.url} story={story} />
                  ))}
                </div>
              </section>
            )}

            {/* Feed */}
            {feed.length > 0 && (
              <section className="mb-6">
                <SectionLabel label="Feed" />
                <div
                  className="rounded overflow-hidden"
                  style={{ border: '1px solid var(--border-muted)', borderBottom: 'none' }}
                >
                  {feed.map((story) => (
                    <FeedRow key={story.url} story={story} />
                  ))}
                </div>
              </section>
            )}

            {/* Load more */}
            {hasMore && (
              <div className="flex justify-center py-4">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="px-4 py-2 rounded text-xs transition-colors"
                  style={{
                    fontFamily: 'Space Mono, monospace',
                    color: 'var(--text-secondary)',
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border)',
                    cursor: loadingMore ? 'default' : 'pointer',
                    opacity: loadingMore ? 0.6 : 1,
                  }}
                >
                  {loadingMore ? 'Loading…' : 'Load more'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
