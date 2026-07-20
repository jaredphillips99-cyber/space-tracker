import { useState } from 'react';
import { PortfolioAuthGate } from '../components/PortfolioAuthGate';
import { usePortfolioSync } from '../hooks/usePortfolioSync';
import PortfolioTab from '../components/compare/PortfolioTab';

type AuthStatus = 'loading' | 'authenticated' | 'anonymous' | 'gate';

export function Portfolio() {
  // usePortfolioSync is the single source of truth for auth resolution — it
  // owns the one supabase.auth.getSession() call. Portfolio no longer runs its
  // own uncoordinated getSession(), which used to race the hook's internal
  // check and let PortfolioTab seed from sessionStorage/defaults before the
  // Supabase-loaded values arrived (the "sometimes it saves" bug).
  const sync = usePortfolioSync();
  const [gateDismissed, setGateDismissed] = useState(
    () => sessionStorage.getItem('portfolio_gate_dismissed') === '1'
  );

  // Derived — never trusts a second, independent auth check.
  const authStatus: AuthStatus = !sync.authResolved
    ? 'loading'
    : sync.isAuthenticated
      ? 'authenticated'
      : gateDismissed
        ? 'anonymous'
        : 'gate';

  function handleContinueAnonymously() {
    sessionStorage.setItem('portfolio_gate_dismissed', '1');
    setGateDismissed(true);
  }

  if (authStatus === 'loading') {
    return (
      <div style={{
        minHeight: '80vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--text-muted)',
        fontFamily: "'Space Mono', monospace",
        fontSize: 12,
        letterSpacing: '0.08em',
      }}>
        LOADING…
      </div>
    );
  }

  if (authStatus === 'gate') {
    return <PortfolioAuthGate onContinueAnonymously={handleContinueAnonymously} />;
  }

  // authenticated or anonymous — both render the full portfolio tab
  // sync hook passes null values when anonymous; PortfolioTab falls back to sessionStorage
  return (
    <PortfolioTab
      syncedPositions={sync.savedPositions}
      syncedAccountType={sync.savedAccountType}
      syncedSectorTargets={sync.savedSectorTargets}
      syncedCashAmount={sync.savedCashAmount}
      syncedPreferences={sync.savedPreferences}
      syncLoading={sync.loading && authStatus === 'authenticated'}
      isAuthenticated={sync.isAuthenticated}
      onSavePositions={sync.savePositions}
      onSavePreferences={sync.savePreferences}
      syncError={sync.syncError}
    />
  );
}