import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AppState, LivePrice, StockAnalysis, Sector, SortField, SortDir } from '../types';

const ANALYSIS_STORAGE_KEY = 'space-tracker-analyses';

// ─── Extend AppState with auth ─────────────────────────────────────────────────
// isAdmin = true  → logged-in user, sees Run Analysis button
// isAdmin = false → reader, dashboard is read-only, portfolio still works

interface ExtendedAppState extends AppState {
  isAdmin: boolean;
  setAdminSession: (isAdmin: boolean) => void;
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
      isAdmin: false,

      // ── Auth actions ───────────────────────────────────────────────────────
      setAdminSession: (isAdmin: boolean) => set({ isAdmin }),

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
      // Persist analyses + admin session to localStorage
      partialize: (state) => ({
        analyses: state.analyses,
        isAdmin:  state.isAdmin,
      }),
    },
  ),
);
