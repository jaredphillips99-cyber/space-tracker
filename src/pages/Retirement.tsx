import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { RetirementAuthGate } from '../components/retirement/RetirementAuthGate';
import RetirementTab from '../components/retirement/RetirementTab';

type AuthStatus = 'loading' | 'authenticated' | 'anonymous' | 'gate';

// Mirrors src/pages/NetWorth.tsx exactly — soft magic-link gate, session-scoped
// dismissal, then RetirementTab handles both authenticated and anonymous states
// via useRetirementProfile.
export function Retirement() {
  const [authStatus, setAuthStatus] = useState<AuthStatus>('loading');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setAuthStatus('authenticated');
      } else {
        const dismissed = sessionStorage.getItem('retirement_gate_dismissed');
        setAuthStatus(dismissed ? 'anonymous' : 'gate');
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) {
        setAuthStatus('authenticated');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  function handleContinueAnonymously() {
    sessionStorage.setItem('retirement_gate_dismissed', '1');
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
    return <RetirementAuthGate onContinueAnonymously={handleContinueAnonymously} />;
  }

  return <RetirementTab />;
}
