import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AppState, LivePrice, StockAnalysis, Sector, SortField, SortDir } from '../types';

const ANALYSIS_STORAGE_KEY = 'space-tracker-analyses';

export const useStore = create<AppState>()(
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
      // Only persist analyses to localStorage — prices are always re-fetched
      partialize: (state) => ({ analyses: state.analyses }),
    },
  ),
);
