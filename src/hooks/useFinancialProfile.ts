import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface FinancialProfile {
  monthlyIncome: number | null;
  monthlySavingsTarget: number | null;
  goalLabel: string | null;
  goalTargetDate: string | null;   // 'YYYY-MM-DD'
  goalTargetAmount: number | null;
}

const EMPTY_PROFILE: FinancialProfile = {
  monthlyIncome: null,
  monthlySavingsTarget: null,
  goalLabel: null,
  goalTargetDate: null,
  goalTargetAmount: null,
};

// ─── DB row shape (user_financial_profile table) ───────────────────────────────

interface ProfileRow {
  user_id: string;
  monthly_income: number | null;
  monthly_savings_target: number | null;
  goal_label: string | null;
  goal_target_date: string | null;
  goal_target_amount: number | null;
  updated_at?: string;
}

function mapRow(r: ProfileRow): FinancialProfile {
  return {
    monthlyIncome:        r.monthly_income == null ? null : Number(r.monthly_income),
    monthlySavingsTarget: r.monthly_savings_target == null ? null : Number(r.monthly_savings_target),
    goalLabel:            r.goal_label ?? null,
    goalTargetDate:       r.goal_target_date ?? null,
    goalTargetAmount:     r.goal_target_amount == null ? null : Number(r.goal_target_amount),
  };
}

// ─── Hook return shape ─────────────────────────────────────────────────────────

export interface FinancialProfileReturn {
  profile: FinancialProfile | null;    // null = not yet loaded
  loading: boolean;
  isAuthenticated: boolean;
  syncError: string | null;
  hasProfile: boolean;                 // true if any field is non-null — gates Tier 2
  updateProfile: (patch: Partial<FinancialProfile>) => Promise<void>;
}

// ─── Hook ──────────────────────────────────────────────────────────────────────
// Mirrors useNetWorthSync: resolve user via supabase.auth, load on mount,
// debounce writes 800ms, flush pending writes on visibilitychange/pagehide.
// Anonymous users get in-memory state only — nothing persists.

export function useFinancialProfile(): FinancialProfileReturn {
  const [profile,   setProfile]   = useState<FinancialProfile | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [userId,    setUserId]    = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

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

  // ── Load profile when userId is resolved ──────────────────────────────────

  useEffect(() => {
    if (userId === null) {
      // No session — in-memory state only
      setProfile(prev => prev ?? { ...EMPTY_PROFILE });
      setLoading(false);
      return;
    }

    async function load() {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('user_financial_profile')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle();

        if (error) {
          // Covers table-not-yet-created too — surfaced, never swallowed
          console.warn('[financial-profile] load failed:', error.message);
          setSyncError(`Financial profile failed to load: ${error.message}`);
          setProfile(prev => prev ?? { ...EMPTY_PROFILE });
          return;
        }

        setProfile(data ? mapRow(data as ProfileRow) : { ...EMPTY_PROFILE });
        setSyncError(null);
      } finally {
        setLoading(false);
      }
    }

    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // ── Write: debounced upsert of the whole row ──────────────────────────────
  // Same pending-ref + flush-on-leave treatment as useNetWorthSync — the
  // debounce alone means an edit made right before closing the tab can be lost.

  const writeTimer     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingProfile = useRef<FinancialProfile | null>(null);

  const flushProfile = useCallback(() => {
    if (!userId || pendingProfile.current == null) return;
    if (writeTimer.current) clearTimeout(writeTimer.current);
    const p = pendingProfile.current;
    pendingProfile.current = null;

    supabase
      .from('user_financial_profile')
      .upsert({
        user_id:                userId,
        monthly_income:         p.monthlyIncome,
        monthly_savings_target: p.monthlySavingsTarget,
        goal_label:             p.goalLabel,
        goal_target_date:       p.goalTargetDate,
        goal_target_amount:     p.goalTargetAmount,
        updated_at:             new Date().toISOString(),
      }, { onConflict: 'user_id' })
      .then(({ error }) => {
        if (error) {
          console.warn('[financial-profile] save failed:', error.message);
          setSyncError(`Financial profile failed to save: ${error.message}`);
        } else {
          setSyncError(null);
        }
      });
  }, [userId]);

  const updateProfile = useCallback(async (patch: Partial<FinancialProfile>) => {
    setProfile(prev => {
      const next = { ...(prev ?? EMPTY_PROFILE), ...patch };
      pendingProfile.current = next;
      return next;
    });

    if (!userId) {
      pendingProfile.current = null; // anonymous — in-memory only
      return;
    }

    if (writeTimer.current) clearTimeout(writeTimer.current);
    writeTimer.current = setTimeout(flushProfile, 800);
  }, [userId, flushProfile]);

  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === 'hidden') flushProfile();
    }

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pagehide', flushProfile);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pagehide', flushProfile);
    };
  }, [flushProfile]);

  const hasProfile = profile != null && (
    profile.monthlyIncome != null ||
    profile.monthlySavingsTarget != null ||
    (profile.goalLabel != null && profile.goalLabel !== '') ||
    profile.goalTargetDate != null ||
    profile.goalTargetAmount != null
  );

  return {
    profile,
    loading,
    isAuthenticated: !!userId,
    syncError,
    hasProfile,
    updateProfile,
  };
}
