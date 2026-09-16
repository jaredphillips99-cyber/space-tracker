import { Link, useLocation } from 'react-router-dom';

const TABS = [
  { to: '/', label: 'Wire' },
  { to: '/calendar', label: 'Calendar' },
] as const;

/**
 * In-page News subsections — Wire (front page) vs Calendar (universe earnings).
 * Top nav stays "News" for both; this is the local switch Jared asked for.
 */
export function NewsSectionNav() {
  const location = useLocation();

  return (
    <div className="flex items-center gap-1" role="tablist" aria-label="News sections">
      {TABS.map(({ to, label }) => {
        const active = location.pathname === to;
        return (
          <Link
            key={to}
            to={to}
            role="tab"
            aria-selected={active}
            className="px-3 py-1 rounded text-xs transition-colors no-underline"
            style={{
              fontFamily: 'Space Mono, monospace',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              backgroundColor: active ? 'var(--bg-elevated)' : 'transparent',
              color: active ? 'var(--text-primary)' : 'var(--text-muted)',
              border: `1px solid ${active ? 'var(--border)' : 'transparent'}`,
            }}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}
