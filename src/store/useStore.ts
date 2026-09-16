import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AppState, LivePrice, StockAnalysis, Sector, SortField, SortDir } from '../types';

const ANALYSIS_STORAGE_KEY = 'space-tracker-analyses';

// ─── Extend AppState with auth ─────────────────────────────────────────────────
// isAuthenticated = has a valid magic-link session (portfolio/networth persist)
// isAdmin         = email is on ADMIN_EMAILS (Run Analysis / operator actions)
// Magic-link login does NOT imply admin — /api/me is the source of truth.
// sessionEmail    = signed-in address for UX copy (not an auth signal).
// operatorCheckFailed = /api/me did not return 200; isAdmin stays false.

interface AuthSnapshot {
  isAuthenticated: boolean;
  isAdmin: boolean;
  email?: string | null;
  operatorCheckFailed?: boolean;
}

interface ExtendedAppState extends AppState {
  isAuthenticated: boolean;
  isAdmin: boolean;
  sessionEmail: string | null;
  operatorCheckFailed: boolean;
  setAuthState: (next: AuthSnapshot) => void;
}

export const useStore = create<ExtendedAppState>()(
  persist(
    (set, get) => ({
      // ── State ──────────────────────────────────────────────────────────────
      prices: {},
      pricesLoadingState: 'idle',
      analyses: {},
      selectedTicker: null,
      sectorFilter: null,
      sortBy: 'dayChange',
      sortDir: 'desc',
      isAuthenticated: false,
      isAdmin: false,
      sessionEmail: null,
      operatorCheckFailed: false,

      // ── Auth actions ───────────────────────────────────────────────────────
      setAuthState: (next) => set({
        isAuthenticated: next.isAuthenticated,
        isAdmin: next.isAdmin,
        sessionEmail: next.email === undefined ? get().sessionEmail : next.email,
        operatorCheckFailed: next.operatorCheckFailed ?? false,
      }),

      // ── Price actions ──────────────────────────────────────────────────────
      setPrices: (prices: LivePrice[]) => {
        const map = Object.fromEntries(prices.map((p) => [p.ticker, p]));
        set((s) => ({ prices: { ...s.prices, ...map } }));
      },

      setPricesLoadingState: (pricesLoadingState) => set({ pricesLoadingState }),

      // ── Analysis actions ───────────────────────────────────────────────────
      setAnalysis: (analysis: StockAnalysis) =>
        set((s) => ({
          analyses: { ...s.analyses, [analysis.ticker]: analysis },
        })),

      patchAnalysis: (ticker: string, patch: Partial<StockAnalysis>) =>
        set((s) => {
          const existing = s.analyses[ticker];
          if (!existing) return s;
          return {
            analyses: {
              ...s.analyses,
              [ticker]: { ...existing, ...patch },
            },
          };
        }),

      // ── UI actions ─────────────────────────────────────────────────────────
      setSelectedTicker: (selectedTicker) => set({ selectedTicker }),

      setSectorFilter: (sectorFilter: Sector | null) => set({ sectorFilter }),

      setSortBy: (sortBy: SortField) => set({ sortBy }),

      setSortDir: (sortDir: SortDir) => set({ sortDir }),

      toggleSort: (field: SortField) => {
        const { sortBy, sortDir } = get();
        if (sortBy === field) {
          set({ sortDir: sortDir === 'asc' ? 'desc' : 'asc' });
        } else {
          set({ sortBy: field, sortDir: 'desc' });
        }
      },
    }),
    {
      name: ANALYSIS_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      // Persist analyses only. Auth flags are derived from the live session
      // + /api/me on every load — never from localStorage (a stale isAdmin
      // true would show Run Analysis to a non-operator).
      partialize: (state) => ({
        analyses: state.analyses,
      }),
    },
  ),
);
