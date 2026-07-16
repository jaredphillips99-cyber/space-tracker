import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { StockDetail } from './pages/StockDetail';
import { Portfolio } from './pages/Portfolio';
import { NetWorth } from './pages/NetWorth';
import { AuthGate } from './components/AuthGate';
import { ErrorBoundary } from './components/ErrorBoundary';
import { supabase } from './lib/supabase';
import { useStore } from './store/useStore';
import { useSupabaseSync } from './hooks/useSupabaseSync';

function AppInner() {
  const setAdminSession = useStore((s) => s.setAdminSession);

  // Hydrate Supabase → Zustand on mount
  useSupabaseSync();

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
          <Route path="/"              element={<Dashboard />} />
          <Route path="/stock/:ticker" element={<StockDetail />} />
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