import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { News } from './pages/News';
import { Dashboard } from './pages/Dashboard';
import { StockDetail } from './pages/StockDetail';
import { IndexDetail } from './pages/IndexDetail';
import { Portfolio } from './pages/Portfolio';
import { NetWorth } from './pages/NetWorth';
import { AuthGate } from './components/AuthGate';
import { ErrorBoundary } from './components/ErrorBoundary';
import { supabase } from './lib/supabase';
import { useStore } from './store/useStore';
import { useSupabaseSync } from './hooks/useSupabaseSync';
import { useLivePrice } from './hooks/useLivePrice';

function AppInner() {
  const setAdminSession = useStore((s) => s.setAdminSession);

  // Hydrate Supabase → Zustand on mount
  useSupabaseSync();

  // Fetch live prices once at the app level — the News tab (now the landing
  // page) ranks stories using marketCap/changePercent, so prices must load
  // regardless of whether the user visits the Dashboard. Staleness-guarded
  // internally, so hoisting causes no duplicate fetches.
  useLivePrice();

  // Listen for magic-link auth callback + session restore on page load
  useEffect(() => {
    // Check if there's already an active session (e.g. user refreshed the page)
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setAdminSession(true);
    });

    // Listen for sign-in / sign-out events
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setAdminSession(!!session);
    });

    return () => subscription.unsubscribe();
  }, [setAdminSession]);

  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/"              element={<News />} />
          <Route path="/dashboard"     element={<Dashboard />} />
          <Route path="/stock/:ticker" element={<StockDetail />} />
          <Route path="/index/:indexName" element={<ErrorBoundary label="Index"><IndexDetail /></ErrorBoundary>} />
          <Route path="/portfolio"     element={<ErrorBoundary label="Portfolio"><Portfolio /></ErrorBoundary>} />
          <Route path="/networth"      element={<ErrorBoundary label="Net Worth"><NetWorth /></ErrorBoundary>} />
          <Route path="/admin"         element={<AuthGate />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default function App() {
  return <AppInner />;
}