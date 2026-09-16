import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { News } from './pages/News';
import { Calendar } from './pages/Calendar';
import { Dashboard } from './pages/Dashboard';
import { StockDetail } from './pages/StockDetail';
import { IndexDetail } from './pages/IndexDetail';
import { Portfolio } from './pages/Portfolio';
import { NetWorth } from './pages/NetWorth';
import { Retirement } from './pages/Retirement';
import { AuthGate } from './components/AuthGate';
import { ErrorBoundary } from './components/ErrorBoundary';
import { supabase } from './lib/supabase';
import { useStore } from './store/useStore';
import { useSupabaseSync } from './hooks/useSupabaseSync';
import { useLivePrice } from './hooks/useLivePrice';
import type { Session } from '@supabase/supabase-js';

async function resolveAuth(session: Session | null) {
  const setAuthState = useStore.getState().setAuthState;
  if (!session) {
    setAuthState({ isAuthenticated: false, isAdmin: false });
    return;
  }
  try {
    const res = await fetch('/api/me', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (!res.ok) {
      // Signed in locally but token rejected — treat as authenticated reader
      setAuthState({ isAuthenticated: true, isAdmin: false });
      return;
    }
    const body = await res.json() as { authenticated?: boolean; isAdmin?: boolean };
    setAuthState({
      isAuthenticated: true,
      isAdmin: !!body.isAdmin,
    });
  } catch {
    setAuthState({ isAuthenticated: true, isAdmin: false });
  }
}

function AppInner() {
  // Hydrate Supabase → Zustand on mount
  useSupabaseSync();

  // Fetch live prices once at the app level — the News tab (now the landing
  // page) ranks stories using marketCap/changePercent, so prices must load
  // regardless of whether the user visits the Dashboard. Staleness-guarded
  // internally, so hoisting causes no duplicate fetches.
  useLivePrice();

  // Session restore + magic-link callback. Operator status comes from /api/me
  // (ADMIN_EMAILS), not from "has a session".
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      void resolveAuth(data.session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      void resolveAuth(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/"              element={<News />} />
          <Route path="/calendar"      element={<Calendar />} />
          <Route path="/dashboard"     element={<Dashboard />} />
          <Route path="/stock/:ticker" element={<StockDetail />} />
          <Route path="/index/:indexName" element={<ErrorBoundary label="Index"><IndexDetail /></ErrorBoundary>} />
          <Route path="/portfolio"     element={<ErrorBoundary label="Portfolio"><Portfolio /></ErrorBoundary>} />
          <Route path="/networth"      element={<ErrorBoundary label="Net Worth"><NetWorth /></ErrorBoundary>} />
          <Route path="/retirement"    element={<ErrorBoundary label="Retirement"><Retirement /></ErrorBoundary>} />
          <Route path="/admin"         element={<AuthGate />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default function App() {
  return <AppInner />;
}
