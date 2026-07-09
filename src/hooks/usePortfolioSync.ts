import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { PortfolioPosition, AccountType, InvestorPreferences } from '../components/compare/PortfolioTab';
import type { SectorTargets } from '../components/compare/SectorTargetsPanel';

// ─── DB row shapes ─────────────────────────────────────────────────────────────

interface PositionRow {
  id: string;
  user_id: string;
  ticker: string;
  shares: number;
  cost_basis_per_share: number;
}

interface PrefsRow {
  user_id: string;
  account_type: string;
  sector_targets: SectorTargets;
  cash_amount?: number;                    // NEW: persisted uninvested cash balance
  preferences?: InvestorPreferences | null; // NEW: standing risk/style profile
}

// ─── Hook return shape ─────────────────────────────────────────────────────────

export interface PortfolioSyncReturn {
  // Loaded state (null = not yet loaded)
  savedPositions:    PortfolioPosition[] | null;
  savedAccountType:  AccountType | null;
  savedSectorTargets: SectorTargets | null;
  savedCashAmount:   number | null;    // NEW
  savedPreferences:  InvestorPreferences | null;  // NEW
  loading:           boolean;
  // Write helpers — called by PortfolioTab after every mutation
  savePositions:     (positions: PortfolioPosition[]) => Promise<void>;
  savePreferences:   (accountType: AccountType, sectorTargets: SectorTargets, cashAmount: number, preferences: InvestorPreferences) => Promise<void>;
  // Whether we have an authenticated user (and therefore can persist)
  isAuthenticated:   boolean;
}

// ─── Hook ──────────────────────────────────────────────────────────────────────

export function usePortfolioSync(): PortfolioSyncReturn {
  const [savedPositions,     setSavedPositions]     = useState<PortfolioPosition[] | null>(null);
  const [savedAccountType,   setSavedAccountType]   = useState<AccountType | null>(null);
  const [savedSectorTargets, setSavedSectorTargets] = useState<SectorTargets | null>(null);
  const [savedCashAmount,    setSavedCashAmount]    = useState<number | null>(null);   // NEW
  const [savedPreferences,   setSavedPreferences]   = useState<InvestorPreferences | null>(null);  // NEW
  const [loading,            setLoading]            = useState(true);
  const [userId,             setUserId]             = useState<string | null>(null);

  // Debounce refs so rapid UI changes don't hammer Supabase
  const positionsTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prefsTimer      = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Resolve user ID on mount and on auth changes ──────────────────────────

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user?.id ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserId(session?.user?.id ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // ── Load data when userId is resolved ─────────────────────────────────────

  useEffect(() => {
    if (userId === null && loading) {
      // No session — stop loading, return empty state
      setLoading(false);
      return;
    }
    if (!userId) return;

    async function load() {
      setLoading(true);
      try {
        // Fetch positions
        const { data: posRows, error: posErr } = await supabase
          .from('portfolio_positions')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: true });

        if (posErr) {
          console.warn('[portfolio-sync] positions load failed:', posErr.message);
        } else if (posRows) {
          setSavedPositions(
            (posRows as PositionRow[]).map(r => ({
              id:               r.id,
              ticker:           r.ticker,
              shares:           Number(r.shares),
              costBasisPerShare: Number(r.cost_basis_per_share),
            }))
          );
        }

        // Fetch preferences
        const { data: prefRow, error: prefErr } = await supabase
          .from('user_preferences')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle();

        if (prefErr) {
          console.warn('[portfolio-sync] prefs load failed:', prefErr.message);
        } else if (prefRow) {
          const row = prefRow as PrefsRow;
          setSavedAccountType(row.account_type as AccountType);
          setSavedSectorTargets(row.sector_targets ?? {});
          setSavedCashAmount(row.cash_amount ?? 0);   // NEW
          setSavedPreferences(row.preferences ?? null);  // NEW
        }
      } finally {
        setLoading(false);
      }
    }

    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // ── Write: positions ──────────────────────────────────────────────────────
  // Strategy: delete all rows for user, then re-insert current snapshot.
  // Simple and correct for a small portfolio. Debounced 800ms, with the same
  // pending-ref + flush-on-leave treatment as preferences below.

  const pendingPositionsWrite = useRef<PortfolioPosition[] | null>(null);

  const writePositionsNow = useCallback(async (uid: string, positions: PortfolioPosition[]) => {
    await supabase.from('portfolio_positions').delete().eq('user_id', uid);
    if (positions.length === 0) return { error: null };

    const rows: PositionRow[] = positions.map(p => ({
      id:                   p.id,
      user_id:              uid,
      ticker:               p.ticker,
      shares:               p.shares,
      cost_basis_per_share: p.costBasisPerShare,
    }));

    return supabase.from('portfolio_positions').insert(rows);
  }, []);

  const savePositions = useCallback(async (positions: PortfolioPosition[]) => {
    if (!userId) return;

    pendingPositionsWrite.current = positions;

    if (positionsTimer.current) clearTimeout(positionsTimer.current);
    positionsTimer.current = setTimeout(async () => {
      const payload = pendingPositionsWrite.current;
      pendingPositionsWrite.current = null;
      if (payload === null) return;
      const { error } = await writePositionsNow(userId, payload);
      if (error) console.warn('[portfolio-sync] positions save failed:', error.message);
    }, 800);
  }, [userId, writePositionsNow]);

  // ── Write: preferences ────────────────────────────────────────────────────
  // Upsert single row. Debounced 800ms under normal typing, but the debounce
  // alone means a change made right before closing the tab can be lost — the
  // setTimeout never gets a chance to fire once the page is gone. To fix that,
  // every call also stashes its payload in a ref, and a separate effect below
  // flushes that ref immediately (bypassing the debounce) when the tab is
  // hidden, navigated away from, or closed.

  const pendingPrefsWrite = useRef<{
    accountType: AccountType;
    sectorTargets: SectorTargets;
    cashAmount: number;
    preferences: InvestorPreferences;
  } | null>(null);

  const writePrefsNow = useCallback((uid: string, payload: NonNullable<typeof pendingPrefsWrite.current>) => {
    return supabase
      .from('user_preferences')
      .upsert({
        user_id:        uid,
        account_type:   payload.accountType,
        sector_targets: payload.sectorTargets,
        cash_amount:    payload.cashAmount,
        preferences:    payload.preferences,
        updated_at:     new Date().toISOString(),
      }, { onConflict: 'user_id' });
  }, []);

  const savePreferences = useCallback(async (
    accountType:   AccountType,
    sectorTargets: SectorTargets,
    cashAmount:    number,               // NEW
    preferences:   InvestorPreferences,  // NEW
  ) => {
    if (!userId) return;

    pendingPrefsWrite.current = { accountType, sectorTargets, cashAmount, preferences };

    if (prefsTimer.current) clearTimeout(prefsTimer.current);
    prefsTimer.current = setTimeout(async () => {
      const payload = pendingPrefsWrite.current;
      pendingPrefsWrite.current = null;
      if (!payload) return;
      const { error } = await writePrefsNow(userId, payload);
      if (error) console.warn('[portfolio-sync] prefs save failed:', error.message);
    }, 800);
  }, [userId, writePrefsNow]);

  // ── Flush pending writes when the tab is hidden, navigated away from, or
  // closed — 'visibilitychange' fires reliably for tab switches, minimizing,
  // and most navigations; 'pagehide' catches the remaining close/unload cases.
  // Best-effort: an instantly-killed browser process can still outrace any
  // client-side handler, but this closes the ~800ms debounce window that was
  // the main source of lost cash-amount updates.
  useEffect(() => {
    function flush() {
      if (!userId) return;

      if (pendingPositionsWrite.current !== null) {
        if (positionsTimer.current) clearTimeout(positionsTimer.current);
        const payload = pendingPositionsWrite.current;
        pendingPositionsWrite.current = null;
        writePositionsNow(userId, payload).then(({ error }) => {
          if (error) console.warn('[portfolio-sync] positions flush failed:', error.message);
        });
      }

      if (pendingPrefsWrite.current) {
        if (prefsTimer.current) clearTimeout(prefsTimer.current);
        const payload = pendingPrefsWrite.current;
        pendingPrefsWrite.current = null;
        writePrefsNow(userId, payload).then(({ error }) => {
          if (error) console.warn('[portfolio-sync] prefs flush failed:', error.message);
        });
      }
    }

    function handleVisibility() {
      if (document.visibilityState === 'hidden') flush();
    }

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pagehide', flush);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pagehide', flush);
    };
  }, [userId, writePrefsNow, writePositionsNow]);

  return {
    savedPositions,
    savedAccountType,
    savedSectorTargets,
    savedCashAmount,     // NEW
    savedPreferences,    // NEW
    loading,
    savePositions,
    savePreferences,
    isAuthenticated: !!userId,
  };
}