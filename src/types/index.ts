// ─── Sectors ─────────────────────────────────────────────────────────────────

export type Sector = 'space' | 'ai_infrastructure' | 'defense' | 'clean_energy' | 'cyber';

export const SECTOR_LABELS: Record<Sector, string> = {
  space: 'Space',
  ai_infrastructure: 'AI Infra',
  defense: 'Defense',
  clean_energy: 'Clean Energy',
  cyber: 'Cyber',
};

export const SECTOR_COLORS: Record<Sector, string> = {
  space: '#00c8ff',
  ai_infrastructure: '#a259ff',
  defense: '#f97316',
  clean_energy: '#00e676',
  cyber: '#ff4b6e',
};

// ─── Ticker Config ────────────────────────────────────────────────────────────

export interface TickerConfig {
  ticker: string;
  name: string;
  sectors: Sector[];
  color?: string;              // brand accent for specific stocks
  description?: string;
  fiscalYearEnd?: string;      // e.g. "December", "March"
  nextEarningsDate?: string | null;
  specialNotes?: string | null;
}

// ─── Live Price ───────────────────────────────────────────────────────────────

export interface LivePrice {
  ticker: string;
  price: number;
  change: number;           // absolute $ change vs prev close
  changePercent: number;    // 1d % change
  weekChangePercent?: number; // 1w % change (if available)
  marketCap?: number;
  volume?: number;
  regularMarketOpen?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  // Analyst consensus data sourced from Yahoo Finance (updated daily)
  analystTargetPrice?: number;   // mean analyst price target
  recommendationMean?: number;   // 1.0 (Strong Buy) → 5.0 (Strong Sell)
  // Earliest upcoming earnings date, sourced from Yahoo calendarEvents.
  // null when Yahoo has no earnings data for this ticker (e.g. some ETFs, thin coverage names).
  nextEarningsDate?: string | null;
  // Fiscal period-end Yahoo has ACTUAL reported data for, sourced from
  // defaultKeyStatistics.mostRecentQuarter. Ground-truth "last actually
  // reported quarter" — the primary reportDue signal (nextEarningsDate is a
  // forward-looking estimate that can roll forward before the app catches up).
  // null when Yahoo has no such data for this ticker.
  lastReportedQuarterEnd?: string | null;
  fetchError?: boolean;
  fetchedAt: number;        // unix ms timestamp
}

// ─── Guidance & Ratings ───────────────────────────────────────────────────────

export type GuidanceDirection = 'Raised' | 'Maintained' | 'Lowered';

export type AnalystRating = 'Strong Buy' | 'Buy' | 'Hold' | 'Sell' | 'Strong Sell';

// ─── Stock Analysis ───────────────────────────────────────────────────────────

export interface StockAnalysis {
  ticker: string;
  analyzedAt: number;       // unix ms timestamp

  // Structured fields (JSON-extracted by LLM)
  analystTarget?: number;   // consensus price target — NEVER stored as upside%; computed at render
  guidanceDirection?: GuidanceDirection;
  analystRating?: AnalystRating;
  revenueGrowthYoY?: number;    // e.g. 0.42 = 42%
  revenueGrowthQoQ?: number;
  grossMargin?: number;          // e.g. 0.63 = 63%
  operatingMargin?: number;
  nextEarningsDate?: string;     // ISO date string "YYYY-MM-DD"
  lastEarningsDate?: string;
  recentRevenue?: number;        // most recent quarter revenue in $
  recentEPS?: number;            // most recent quarter EPS

  // Narrative fields (LLM prose)
  summary?: string;
  bullCase?: string;
  bearCase?: string;
  catalysts?: string[];
  risks?: string[];
  keyMetrics?: string;           // brief formatted metrics block

  // Raw input (stored for re-analysis)
  earningsText?: string;
  transcriptText?: string;

  // Streaming / loading state (not persisted)
  isStreaming?: boolean;
  streamedContent?: string;
  streamError?: string;
}

// ─── impliedUpsidePercent helper (NEVER stored) ───────────────────────────────

export function computeImpliedUpside(
  currentPrice: number | undefined,
  analystTarget: number | undefined,
): number | undefined {
  if (!currentPrice || !analystTarget || currentPrice <= 0) return undefined;
  return ((analystTarget - currentPrice) / currentPrice) * 100;
}

// ─── Analyst rating helpers (sourced from Yahoo Finance recommendationMean) ───
// Yahoo uses a 1–5 numeric scale: 1.0 = Strong Buy, 5.0 = Strong Sell

export type YahooRatingLabel = 'Strong Buy' | 'Buy' | 'Hold' | 'Sell' | 'Strong Sell';

export function recommendationMeanToLabel(mean: number | undefined): YahooRatingLabel | undefined {
  if (mean == null) return undefined;
  if (mean <= 1.5) return 'Strong Buy';
  if (mean <= 2.5) return 'Buy';
  if (mean <= 3.5) return 'Hold';
  if (mean <= 4.5) return 'Sell';
  return 'Strong Sell';
}

export const YAHOO_RATING_COLORS: Record<YahooRatingLabel, { text: string; bg: string }> = {
  'Strong Buy':  { text: '#00e676', bg: '#00e67614' },
  'Buy':         { text: '#4ade80', bg: '#4ade8014' },
  'Hold':        { text: '#6b7190', bg: '#6b719014' },
  'Sell':        { text: '#f87171', bg: '#f8717114' },
  'Strong Sell': { text: '#ff4b6e', bg: '#ff4b6e14' },
};

// ─── Staleness ────────────────────────────────────────────────────────────────

export const ANALYSIS_STALE_DAYS = 30;

export function isAnalysisStale(analysis: StockAnalysis): boolean {
  const ageMs = Date.now() - analysis.analyzedAt;
  return ageMs > ANALYSIS_STALE_DAYS * 24 * 60 * 60 * 1000;
}

export const PRICE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

export function isPriceStale(price: LivePrice): boolean {
  return Date.now() - price.fetchedAt > PRICE_CACHE_TTL_MS;
}

// ─── App State ────────────────────────────────────────────────────────────────

export type SortField = 'ticker' | 'price' | 'dayChange' | 'weekChange' | 'marketCap' | 'upside';
export type SortDir = 'asc' | 'desc';

export interface AppState {
  // Live prices keyed by ticker
  prices: Record<string, LivePrice>;
  pricesLoadingState: 'idle' | 'loading' | 'error' | 'success';

  // Analyses keyed by ticker (synced to localStorage)
  analyses: Record<string, StockAnalysis>;

  // UI state
  selectedTicker: string | null;
  sectorFilter: Sector | null;
  sortBy: SortField;
  sortDir: SortDir;

  // Actions
  setPrices: (prices: LivePrice[]) => void;
  setPricesLoadingState: (s: AppState['pricesLoadingState']) => void;
  setAnalysis: (analysis: StockAnalysis) => void;
  patchAnalysis: (ticker: string, patch: Partial<StockAnalysis>) => void;
  setSelectedTicker: (ticker: string | null) => void;
  setSectorFilter: (sector: Sector | null) => void;
  setSortBy: (field: SortField) => void;
  setSortDir: (dir: SortDir) => void;
  toggleSort: (field: SortField) => void;
}