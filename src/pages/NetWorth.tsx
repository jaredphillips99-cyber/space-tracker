import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { NetWorthAuthGate } from '../components/networth/NetWorthAuthGate';
import NetWorthTab from '../components/networth/NetWorthTab';

type AuthStatus = 'loading' | 'authenticated' | 'anonymous' | 'gate';

export function NetWorth() {
  const [authStatus, setAuthStatus] = useState<AuthStatus>('loading');

  useEffect(() => {
    // Check for existing session on mount
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setAuthStatus('authenticated');
      } else {
        // No session → show gate (unless they've already dismissed it this session)
        const dismissed = sessionStorage.getItem('networth_gate_dismissed');
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
    sessionStorage.setItem('networth_gate_dismissed', '1');
    setAuthStatus('anonymous');
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
    return <NetWorthAuthGate onContinueAnonymously={handleContinueAnonymously} />;
  }

  // authenticated or anonymous — NetWorthTab handles both via useNetWorthSync
  return <NetWorthTab />;
}
