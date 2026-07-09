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
  // Simple and correct for a small portfolio. Debounced 800ms.

  const savePositions = useCallback(async (positions: PortfolioPosition[]) => {
    if (!userId) return;

    if (positionsTimer.current) clearTimeout(positionsTimer.current);
    positionsTimer.current = setTimeout(async () => {
      // Delete existing rows
      await supabase
        .from('portfolio_positions')
        .delete()
        .eq('user_id', userId);

      if (positions.length === 0) return;

      // Insert fresh snapshot
      const rows: PositionRow[] = positions.map(p => ({
        id:                   p.id,
        user_id:              userId,
        ticker:               p.ticker,
        shares:               p.shares,
        cost_basis_per_share: p.costBasisPerShare,
      }));

      const { error } = await supabase
        .from('portfolio_positions')
        .insert(rows);

      if (error) console.warn('[portfolio-sync] positions save failed:', error.message);
    }, 800);
  }, [userId]);

  // ── Write: preferences ────────────────────────────────────────────────────
  // Upsert single row. Debounced 800ms. Now includes cashAmount + investor preferences.

  const savePreferences = useCallback(async (
    accountType:   AccountType,
    sectorTargets: SectorTargets,
    cashAmount:    number,               // NEW
    preferences:   InvestorPreferences,  // NEW
  ) => {
    if (!userId) return;

    if (prefsTimer.current) clearTimeout(prefsTimer.current);
    prefsTimer.current = setTimeout(async () => {
      const { error } = await supabase
        .from('user_preferences')
        .upsert({
          user_id:        userId,
          account_type:   accountType,
          sector_targets: sectorTargets,
          cash_amount:    cashAmount,     // NEW
          preferences:    preferences,    // NEW
          updated_at:     new Date().toISOString(),
        }, { onConflict: 'user_id' });

      if (error) console.warn('[portfolio-sync] prefs save failed:', error.message);
    }, 800);
  }, [userId]);

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