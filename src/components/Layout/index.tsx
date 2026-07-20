import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useStore } from '../../store/useStore';
import { SECTOR_LABELS, SECTOR_COLORS } from '../../types';
import { signOut } from '../../lib/supabase';
import { useTheme } from '../../hooks/useTheme';
import OnboardingModal, { hasOnboarded } from '../Onboarding/OnboardingModal';
import type { Sector } from '../../types';

const NAV_LINKS = [
  { to: '/', label: 'Dashboard' },
  { to: '/portfolio', label: 'Portfolio' },
  { to: '/networth', label: 'Net Worth' },
];

// lng_export intentionally excluded
const SECTORS: Sector[] = ['space', 'ai_infrastructure', 'defense', 'clean_energy'];

export function Layout({ children }: { children: React.ReactNode }) {
  const location        = useLocation();
  const sectorFilter    = useStore((s) => s.sectorFilter);
  const setSectorFilter = useStore((s) => s.setSectorFilter);
  const pricesLoadingState = useStore((s) => s.pricesLoadingState);
  const isAdmin         = useStore((s) => s.isAdmin);
  const setAdminSession = useStore((s) => s.setAdminSession);
  const { theme, toggleTheme } = useTheme();
  const [showOnboarding, setShowOnboarding] = useState(() => !hasOnboarded());

  const isDashboard = location.pathname === '/';

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--bg-base)' }}>
      {showOnboarding && <OnboardingModal onClose={() => setShowOnboarding(false)} />}

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header
        className="border-b px-6 flex items-center justify-between h-14 shrink-0"
        style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border)' }}
      >
        <div className="flex items-center gap-6">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 no-underline">
            <span className="text-lg font-bold tracking-wide" style={{ fontFamily: 'Space Mono, monospace', color: '#00c8ff' }}>
              INVEST
            </span>
            <span className="text-lg font-bold tracking-wide" style={{ fontFamily: 'Space Mono, monospace', color: 'var(--text-primary)' }}>
              AI
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
                    color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                    backgroundColor: active ? 'var(--bg-elevated)' : 'transparent',
                    textDecoration: 'none',
                  }}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Right side: live indicator + help + theme + admin control */}
        <div className="flex items-center gap-4">
          {/* Live indicator */}
          <div className="flex items-center gap-2">
            {pricesLoadingState === 'loading' && (
              <span className="text-xs" style={{ fontFamily: 'Space Mono, monospace', color: 'var(--text-secondary)' }}>
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
            <span className="text-xs" style={{ fontFamily: 'Space Mono, monospace', color: 'var(--text-muted)' }}>
              LIVE
            </span>
          </div>

          {/* Onboarding help */}
          <button
            onClick={() => setShowOnboarding(true)}
            title="What does each tab do?"
            aria-label="Open onboarding tour"
            style={{
              fontFamily: 'Space Mono, monospace',
              fontSize: 11,
              width: 22, height: 22,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--text-secondary)',
              background: 'none',
              border: '1px solid var(--border)',
              borderRadius: '50%',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            ?
          </button>

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label="Toggle dark/light theme"
            style={{
              fontSize: 12,
              width: 22, height: 22,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--text-secondary)',
              background: 'none',
              border: '1px solid var(--border)',
              borderRadius: '50%',
              cursor: 'pointer',
              padding: 0,
              lineHeight: 1,
            }}
          >
            {theme === 'dark' ? '☀' : '☾'}
          </button>

          {/* Admin control */}
          {isAdmin ? (
            <button
              onClick={async () => { await signOut(); setAdminSession(false); }}
              style={{
                fontFamily: 'Space Mono, monospace',
                fontSize: '10px',
                letterSpacing: '0.08em',
                color: 'var(--text-muted)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '2px 0',
              }}
            >
              SIGN OUT
            </button>
          ) : (
            <Link
              to="/admin"
              style={{
                fontFamily: 'Space Mono, monospace',
                fontSize: '10px',
                letterSpacing: '0.08em',
                color: 'var(--text-dim)',
                textDecoration: 'none',
              }}
            >
              ADMIN
            </Link>
          )}
        </div>
      </header>

      {/* ── Sector filter bar — Dashboard only ──────────────────────────── */}
      {isDashboard && (
        <div
          className="border-b px-6 flex items-center gap-2 h-10 shrink-0"
          style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border)' }}
        >
          <button
            onClick={() => setSectorFilter(null)}
            className="px-3 py-1 rounded text-xs transition-all"
            style={{
              fontFamily: 'Space Mono, monospace',
              backgroundColor: sectorFilter === null ? 'var(--bg-elevated)' : 'transparent',
              color: sectorFilter === null ? 'var(--text-primary)' : 'var(--text-muted)',
              border: `1px solid ${sectorFilter === null ? 'var(--border)' : 'transparent'}`,
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
                  color: active ? SECTOR_COLORS[sector] : 'var(--text-muted)',
                  border: `1px solid ${active ? `${SECTOR_COLORS[sector]}40` : 'transparent'}`,
                  cursor: 'pointer',
                }}
              >
                {SECTOR_LABELS[sector].toUpperCase()}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Page content ──────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-hidden" style={{ padding: "0 16px" }}>
        {children}
      </main>
    </div>
  );
}
