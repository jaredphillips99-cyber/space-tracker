import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { PortfolioAuthGate } from '../components/PortfolioAuthGate';
import { usePortfolioSync } from '../hooks/usePortfolioSync';
import PortfolioTab from '../components/compare/PortfolioTab';

type AuthStatus = 'loading' | 'authenticated' | 'anonymous' | 'gate';

export function Portfolio() {
  const [authStatus, setAuthStatus] = useState<AuthStatus>('loading');
  const sync = usePortfolioSync();

  useEffect(() => {
    // Check for existing session on mount
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setAuthStatus('authenticated');
      } else {
        // No session → show gate (unless they've already dismissed it this session)
        const dismissed = sessionStorage.getItem('portfolio_gate_dismissed');
        setAuthStatus(dismissed ? 'anonymous' : 'gate');
      }
    });

    // React to auth state changes (e.g. magic-link callback)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) {
        setAuthStatus('authenticated');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  function handleContinueAnonymously() {
    sessionStorage.setItem('portfolio_gate_dismissed', '1');
    setAuthStatus('anonymous');
  }

  if (authStatus === 'loading') {
    return (
      <div style={{
        minHeight: '80vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#4a4f63',
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