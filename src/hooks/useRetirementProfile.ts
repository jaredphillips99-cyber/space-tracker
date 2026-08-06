import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface OtherRetirementAccount {
  label: string;
  kind: string;                       // e.g. 'roth_ira' | 'brokerage' | 'hsa' | 'other'
  balance: number | null;
  monthlyContribution: number | null;
}

export interface OtherInvestmentGoal {
  label: string;                      // e.g. 'DCA into Bitcoin'
  monthlyAmount: number | null;
  accountType: string;               // e.g. 'taxable' | 'crypto_wallet'
}

export interface RetirementProfile {
  employmentType: string | null;      // 'private' | 'state_government' | ...
  state: string | null;               // 2-letter US state code
  annualSalary: number | null;
  primaryPlanType: string | null;     // '401k' | '403b' | '457b' | 'pension_plus_457b' | 'none'
  primaryContributionPct: number | null;
  employerMatchPct: number | null;
  employerMatchUpToPct: number | null;
  hasPension: boolean | null;
  birthYear: number | null;
  otherRetirementAccounts: OtherRetirementAccount[];
  otherInvestmentGoals: OtherInvestmentGoal[];
}

const EMPTY_PROFILE: RetirementProfile = {
  employmentType: null,
  state: null,
  annualSalary: null,
  primaryPlanType: null,
  primaryContributionPct: null,
  employerMatchPct: null,
  employerMatchUpToPct: null,
  hasPension: null,
  birthYear: null,
  otherRetirementAccounts: [],
  otherInvestmentGoals: [],
};

// ─── DB row shape (retirement_profile table) ───────────────────────────────────

interface ProfileRow {
  user_id: string;
  employment_type: string | null;
  state: string | null;
  annual_salary: number | null;
  primary_plan_type: string | null;
  primary_contribution_pct: number | null;
  employer_match_pct: number | null;
  employer_match_up_to_pct: number | null;
  has_pension: boolean | null;
  birth_year: number | null;
  other_retirement_accounts: OtherRetirementAccount[] | null;
  other_investment_goals: OtherInvestmentGoal[] | null;
  updated_at?: string;
}

function mapRow(r: ProfileRow): RetirementProfile {
  return {
    employmentType:         r.employment_type ?? null,
    state:                  r.state ?? null,
    annualSalary:           r.annual_salary == null ? null : Number(r.annual_salary),
    primaryPlanType:        r.primary_plan_type ?? null,
    primaryContributionPct: r.primary_contribution_pct == null ? null : Number(r.primary_contribution_pct),
    employerMatchPct:       r.employer_match_pct == null ? null : Number(r.employer_match_pct),
    employerMatchUpToPct:   r.employer_match_up_to_pct == null ? null : Number(r.employer_match_up_to_pct),
    hasPension:             r.has_pension ?? null,
    birthYear:              r.birth_year == null ? null : Number(r.birth_year),
    otherRetirementAccounts: Array.isArray(r.other_retirement_accounts) ? r.other_retirement_accounts : [],
    otherInvestmentGoals:    Array.isArray(r.other_investment_goals) ? r.other_investment_goals : [],
  };
}

// ─── Hook return shape ─────────────────────────────────────────────────────────

export interface RetirementProfileReturn {
  profile: RetirementProfile | null;   // null = not yet loaded
  loading: boolean;
  isAuthenticated: boolean;
  syncError: string | null;
  hasCoreInputs: boolean;              // true when salary + contribution % are both set
  updateProfile: (patch: Partial<RetirementProfile>) => Promise<void>;
}

// ─── Hook ──────────────────────────────────────────────────────────────────────
// Mirrors useFinancialProfile: resolve user via supabase.auth, load on mount,
// debounce writes 800ms, flush pending writes on visibilitychange/pagehide.
// JSON array fields upsert as jsonb directly (not stringified). Anonymous users
// get in-memory state only — nothing persists.

export function useRetirementProfile(): RetirementProfileReturn {
  const [profile,   setProfile]   = useState<RetirementProfile | null>(null);
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
          .from('retirement_profile')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle();

        if (error) {
          // Covers table-not-yet-created too — surfaced, never swallowed
          console.warn('[retirement-profile] load failed:', error.message);
          setSyncError(`Retirement profile failed to load: ${error.message}`);
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
  // Same pending-ref + flush-on-leave treatment as useFinancialProfile — the
  // debounce alone means an edit made right before closing the tab can be lost.

  const writeTimer     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingProfile = useRef<RetirementProfile | null>(null);

  const flushProfile = useCallback(() => {
    if (!userId || pendingProfile.current == null) return;
    if (writeTimer.current) clearTimeout(writeTimer.current);
    const p = pendingProfile.current;
    pendingProfile.current = null;

    supabase
      .from('retirement_profile')
      .upsert({
        user_id:                  userId,
        employment_type:          p.employmentType,
        state:                    p.state,
        annual_salary:            p.annualSalary,
        primary_plan_type:        p.primaryPlanType,
        primary_contribution_pct: p.primaryContributionPct,
        employer_match_pct:       p.employerMatchPct,
        employer_match_up_to_pct: p.employerMatchUpToPct,
        has_pension:              p.hasPension,
        birth_year:               p.birthYear,
        // jsonb columns — upsert the arrays directly, not stringified
        other_retirement_accounts: p.otherRetirementAccounts,
        other_investment_goals:    p.otherInvestmentGoals,
        updated_at:               new Date().toISOString(),
      }, { onConflict: 'user_id' })
      .then(({ error }) => {
        if (error) {
          console.warn('[retirement-profile] save failed:', error.message);
          setSyncError(`Retirement profile failed to save: ${error.message}`);
        } else {
          setSyncError(null);
        }
      });
  }, [userId]);

  const updateProfile = useCallback(async (patch: Partial<RetirementProfile>) => {
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

  const hasCoreInputs = profile != null &&
    profile.annualSalary != null &&
    profile.primaryContributionPct != null;

  return {
    profile,
    loading,
    isAuthenticated: !!userId,
    syncError,
    hasCoreInputs,
    updateProfile,
  };
}
