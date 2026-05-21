import { Link, useLocation } from 'react-router-dom';
import { useStore } from '../../store/useStore';
import { SECTOR_LABELS, SECTOR_COLORS } from '../../types';
import type { Sector } from '../../types';

const NAV_LINKS = [
  { to: '/', label: 'Dashboard' },
  { to: '/compare', label: 'Compare' },
];

const SECTORS: Sector[] = ['space', 'ai_infrastructure', 'defense', 'clean_energy', 'lng_export'];

export function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const sectorFilter = useStore((s) => s.sectorFilter);
  const setSectorFilter = useStore((s) => s.setSectorFilter);
  const pricesLoadingState = useStore((s) => s.pricesLoadingState);

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#08090d' }}>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header
        className="border-b px-6 flex items-center justify-between h-14 shrink-0"
        style={{ backgroundColor: '#0f1117', borderColor: '#1e2030' }}
      >
        <div className="flex items-center gap-6">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 no-underline">
            <span className="text-lg font-bold tracking-wide" style={{ fontFamily: 'Space Mono, monospace', color: '#00c8ff' }}>
              SPACE
            </span>
            <span className="text-lg font-bold tracking-wide" style={{ fontFamily: 'Space Mono, monospace', color: '#e2e4ef' }}>
              TRACKER
            </span>
          </Link>

          {/* Nav */}
          <nav className="flex items-center gap-1">
            {NAV_LINKS.map(({ to, label }) => {
              const active = location.pathname === to;
              return (
                <Link
                  key={to}
                  to={to}
                  className="px-3 py-1.5 rounded text-sm transition-colors"
                  style={{
                    fontFamily: 'DM Sans, sans-serif',
                    color: active ? '#e2e4ef' : '#8b8fa8',
                    backgroundColor: active ? '#161821' : 'transparent',
                    textDecoration: 'none',
                  }}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Live indicator */}
        <div className="flex items-center gap-2">
          {pricesLoadingState === 'loading' && (
            <span className="text-xs" style={{ fontFamily: 'Space Mono, monospace', color: '#8b8fa8' }}>
              fetching…
            </span>
          )}
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{
              backgroundColor:
                pricesLoadingState === 'loading'
                  ? '#f59e0b'
                  : pricesLoadingState === 'error'
                  ? '#ef4444'
                  : '#22c55e',
            }}
          />
          <span className="text-xs" style={{ fontFamily: 'Space Mono, monospace', color: '#4a4e63' }}>
            LIVE
          </span>
        </div>
      </header>

      {/* ── Sector filter bar ────────────────────────────────────────────── */}
      <div
        className="border-b px-6 flex items-center gap-2 h-10 shrink-0"
        style={{ backgroundColor: '#0f1117', borderColor: '#1e2030' }}
      >
        <button
          onClick={() => setSectorFilter(null)}
          className="px-3 py-1 rounded text-xs transition-all"
          style={{
            fontFamily: 'Space Mono, monospace',
            backgroundColor: sectorFilter === null ? '#161821' : 'transparent',
            color: sectorFilter === null ? '#e2e4ef' : '#4a4e63',
            border: `1px solid ${sectorFilter === null ? '#1e2030' : 'transparent'}`,
            cursor: 'pointer',
          }}
        >
          ALL
        </button>
        {SECTORS.map((sector) => {
          const active = sectorFilter === sector;
          return (
            <button
              key={sector}
              onClick={() => setSectorFilter(active ? null : sector)}
              className="px-3 py-1 rounded text-xs transition-all"
              style={{
                fontFamily: 'Space Mono, monospace',
                backgroundColor: active ? `${SECTOR_COLORS[sector]}18` : 'transparent',
                color: active ? SECTOR_COLORS[sector] : '#4a4e63',
                border: `1px solid ${active ? `${SECTOR_COLORS[sector]}40` : 'transparent'}`,
                cursor: 'pointer',
              }}
            >
              {SECTOR_LABELS[sector].toUpperCase()}
            </button>
          );
        })}
      </div>

      {/* ── Page content ──────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-hidden">
        {children}
      </main>
    </div>
  );
}
