import { useState, useCallback, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import SectorTargetsPanel from './SectorTargetsPanel';
import type { SectorTargets, SectorActuals, SubSectorActuals } from './SectorTargetsPanel';
import {
  classifyTicker,
  isInUniverse,
  SECTOR_DISPLAY,
  SUBSECTOR_DISPLAY,
  type TopLevelSector,
  type SubSector,
} from '../../config/gics';

// ─── Session cache (anonymous fallback only) ──────────────────────────────────

const SESSION_KEY = 'portfolio_session_v2';
const SESSION_TTL_MS = 60 * 60 * 1000;

interface SessionCache {
  positions: PortfolioPosition[];
  liveData: Record<string, { price: number | null; loading: boolean; error: boolean }>;
  sectorTargets: SectorTargets;
  accountType: AccountType;
  savedAt: number;
}

function loadSession(): Partial<SessionCache> {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return {};
    const parsed: SessionCache = JSON.parse(raw);
    if (Date.now() - parsed.savedAt > SESSION_TTL_MS) {
      sessionStorage.removeItem(SESSION_KEY);
      return {};
    }
    return parsed;
  } catch {
    return {};
  }
}

function saveSession(data: SessionCache) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
  } catch {}
}

// ─── Sync props (passed from Portfolio.tsx when authenticated) ────────────────

export interface PortfolioTabSyncProps {
  syncedPositions:     PortfolioPosition[] | null;  // null = not yet loaded / not authenticated
  syncedAccountType:   AccountType | null;
  syncedSectorTargets: SectorTargets | null;
  syncedCashAmount:    number | null;               // NEW: persisted cash balance
  syncedPreferences:   InvestorPreferences | null;   // NEW: persisted investor preferences
  syncLoading:         boolean;
  isAuthenticated:     boolean;
  onSavePositions:     (positions: PortfolioPosition[]) => Promise<void>;
  onSavePreferences:   (accountType: AccountType, sectorTargets: SectorTargets, cashAmount: number, preferences: InvestorPreferences) => Promise<void>;
}

// ─── Account types ────────────────────────────────────────────────────────────

export type AccountType =
  | 'unspecified' | 'taxable' | 'roth_ira' | 'traditional_ira'
  | 'sep_ira' | '401k_roth' | '401k_traditional' | 'hsa' | 'custodial' | 'trust';

interface AccountTypeConfig {
  label: string;
  shortLabel: string;
  color: string;
  constraints: string[];
  taxTreatment: string;
}

export const ACCOUNT_TYPES: Record<AccountType, AccountTypeConfig> = {
  unspecified: { label: 'Not specified', shortLabel: '—', color: '#8b93a8', constraints: [], taxTreatment: 'Account type not specified. Provide general analysis.' },
  taxable: { label: 'Taxable brokerage', shortLabel: 'Taxable', color: '#f97316', constraints: ['Short-term gains taxed as income', 'Long-term gains at lower rate', 'Tax-loss harvesting available'], taxTreatment: 'Taxable brokerage account. Short-term capital gains (held <1yr) taxed as ordinary income; long-term gains (held >1yr) taxed at lower rate. Tax-loss harvesting is possible. Fractional shares may be available depending on broker. Be explicit about tax implications when suggesting trims.' },
  roth_ira: { label: 'Roth IRA', shortLabel: 'Roth IRA', color: '#00e676', constraints: ['Tax-free growth & withdrawals', 'Whole shares only (most brokers)', 'Cannot add cash above annual limit', 'No margin or short-selling'], taxTreatment: 'Roth IRA: tax-free growth and withdrawals. Cannot easily add new cash beyond annual contribution limits ($7K/yr in 2025, $8K if 50+). Most brokers require whole shares only — no fractional shares. No margin or short-selling. Tax-loss harvesting has no benefit. Prioritize highest long-term appreciation potential. When suggesting trims, specify whole share amounts only.' },
  traditional_ira: { label: 'Traditional IRA', shortLabel: 'Trad IRA', color: '#a259ff', constraints: ['Tax-deferred growth', 'Withdrawals taxed as ordinary income', 'RMDs start at age 73', 'Whole shares only (most brokers)'], taxTreatment: 'Traditional IRA: tax-deferred growth; all withdrawals taxed as ordinary income. Required Minimum Distributions (RMDs) begin at age 73. Most brokers require whole shares. No margin or short-selling.' },
  sep_ira: { label: 'SEP IRA', shortLabel: 'SEP IRA', color: '#a259ff', constraints: ['Tax-deferred growth', 'Higher contribution limits than IRA', 'RMDs apply', 'Withdrawals taxed as ordinary income'], taxTreatment: 'SEP IRA: same tax treatment as Traditional IRA (tax-deferred, withdrawals as ordinary income, RMDs apply) but with higher contribution limits. No margin or short-selling. Whole shares only at most brokers.' },
  '401k_roth': { label: 'Roth 401(k)', shortLabel: 'Roth 401k', color: '#00e676', constraints: ['Tax-free growth', 'Limited to employer plan options', 'Whole shares or fund units only'], taxTreatment: 'Roth 401(k): tax-free growth like Roth IRA, but typically limited to a menu of employer-selected mutual funds or ETFs. Whole share/unit amounts only. No margin or short-selling.' },
  '401k_traditional': { label: 'Traditional 401(k)', shortLabel: '401k', color: '#fbbf24', constraints: ['Tax-deferred growth', 'Withdrawals taxed as income', 'RMDs at age 73', 'Limited to plan options'], taxTreatment: 'Traditional 401(k): tax-deferred, withdrawals taxed as ordinary income, RMDs at age 73. Typically limited to employer plan options. Whole share/unit amounts only.' },
  hsa: { label: 'HSA (Health Savings)', shortLabel: 'HSA', color: '#06b6d4', constraints: ['Triple tax advantage', 'Penalty-free for healthcare', 'After 65: any withdrawal (taxed as income)', 'Whole shares only (most brokers)'], taxTreatment: 'HSA: triple tax advantage. After age 65, withdrawals for non-medical purposes are taxed as ordinary income. Whole shares only at most brokers. Long-term investing strategy preferred.' },
  custodial: { label: 'Custodial (UGMA/UTMA)', shortLabel: 'Custodial', color: '#f59e0b', constraints: ['Taxable account rules apply', 'Kiddie tax may apply for minors', 'Assets transfer to beneficiary at 18–21', 'Long horizon typical'], taxTreatment: 'Custodial account (UGMA/UTMA): taxable, long investment horizon. Kiddie tax rules may apply for minors. Favor long-term growth positions.' },
  trust: { label: 'Trust account', shortLabel: 'Trust', color: '#8b93a8', constraints: ['Tax rules depend on trust type', 'May have distribution requirements', 'Consult trust documents for constraints'], taxTreatment: 'Trust account: tax treatment depends on trust type (revocable vs irrevocable). Note that specific tax implications depend on the trust structure.' },
};

// ─── Investor preferences ──────────────────────────────────────────────────────
// Standing risk/style profile — separate from account type (which is about tax
// rules and trading constraints). Preferences shape *what* Claude recommends;
// account type shapes how it's framed. Single profile per user for now — see
// note in CLAUDE.md re: multi-account being a separate, larger feature.

export type RiskTolerance = 'conservative' | 'moderate' | 'aggressive';
export type TimeHorizon = 'short' | 'medium' | 'long';
export type NewMoneyCadence = 'lump_sum' | 'dca';
export type ExclusionFlag = 'defense' | 'fossil_fuels' | 'tobacco_gambling';

export interface InvestorPreferences {
  riskTolerance: RiskTolerance;
  timeHorizon: TimeHorizon;
  incomeGrowthTilt: number;          // 0 = income-focused, 100 = growth-focused
  diversificationPreference: number; // 0 = individual stocks, 100 = prefer funds
  maxPositionSizePct: number;        // 5 | 10 | 15 | 25
  newMoneyCadence: NewMoneyCadence;
  exclusions: ExclusionFlag[];
}

export const DEFAULT_PREFERENCES: InvestorPreferences = {
  riskTolerance: 'moderate',
  timeHorizon: 'medium',
  incomeGrowthTilt: 70,
  diversificationPreference: 30,
  maxPositionSizePct: 15,
  newMoneyCadence: 'lump_sum',
  exclusions: [],
};

const RISK_LABELS: Record<RiskTolerance, { label: string; desc: string }> = {
  conservative: { label: 'Conservative', desc: 'Avoid speculative/pre-revenue names' },
  moderate:     { label: 'Moderate',     desc: 'Some speculative exposure is fine' },
  aggressive:   { label: 'Aggressive',   desc: 'Growth and upside over volatility' },
};

const HORIZON_LABELS: Record<TimeHorizon, { label: string; desc: string }> = {
  short:  { label: 'Short',  desc: '< 2 years' },
  medium: { label: 'Medium', desc: '2–7 years' },
  long:   { label: 'Long',   desc: '7+ years' },
};

const EXCLUSION_LABELS: Record<ExclusionFlag, string> = {
  defense: 'Defense',
  fossil_fuels: 'Fossil Fuels',
  tobacco_gambling: 'Tobacco & Gambling',
};

const MAX_POSITION_OPTIONS = [5, 10, 15, 25];

// ─── Constants ────────────────────────────────────────────────────────────────

const SECTOR_ORDER: TopLevelSector[] = [
  'information_technology', 'industrials', 'energy', 'communication_services',
  'financials', 'consumer_discretionary', 'consumer_staples', 'health_care',
  'materials', 'real_estate', 'utilities', 'diversified', 'other',
];

function fmt(n: number, decimals = 1) { return n.toFixed(decimals); }
function fmtDelta(delta: number) { const s = delta > 0 ? '+' : ''; return `${s}${Math.round(delta)}pp`; }

// ─── Markdown prose styles ────────────────────────────────────────────────────

const mdProseStyle: React.CSSProperties = {
  fontSize: 13,
  lineHeight: 1.7,
  color: '#c5cad8',
};

// Custom ReactMarkdown components for the dark theme
function MarkdownCard({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h2: () => null, // suppress top-level ## headings (card header already labels it)
        h3: ({ children }) => (
          <div style={{
            fontSize: 10,
            fontFamily: 'Space Mono, monospace',
            fontWeight: 600,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: '#8b93a8',
            marginTop: 14,
            marginBottom: 6,
            paddingTop: 10,
            borderTop: '1px solid #1e2230',
          }}>{children}</div>
        ),
        p: ({ children }) => (
          <p style={{ margin: '0 0 8px 0', fontSize: 13, lineHeight: 1.7, color: '#c5cad8' }}>{children}</p>
        ),
        strong: ({ children }) => (
          <strong style={{ color: '#e2e6f0', fontWeight: 600 }}>{children}</strong>
        ),
        ul: ({ children }) => (
          <ul style={{ margin: '0 0 8px 0', paddingLeft: 0, listStyle: 'none' }}>{children}</ul>
        ),
        li: ({ children }) => (
          <li style={{ fontSize: 13, color: '#c5cad8', lineHeight: 1.65, marginBottom: 4, paddingLeft: 12, position: 'relative' }}>
            <span style={{ position: 'absolute', left: 0, color: '#8b93a8' }}>—</span>
            {children}
          </li>
        ),
        table: ({ children }) => (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 8 }}>{children}</table>
        ),
        thead: ({ children }) => <thead>{children}</thead>,
        tbody: ({ children }) => <tbody>{children}</tbody>,
        tr: ({ children }) => (
          <tr style={{ borderBottom: '1px solid #1e2230' }}>{children}</tr>
        ),
        th: ({ children }) => (
          <th style={{ textAlign: 'left', padding: '4px 8px 4px 0', fontSize: 10, color: '#8b93a8', fontFamily: 'Space Mono, monospace', fontWeight: 400, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{children}</th>
        ),
        td: ({ children }) => (
          <td style={{ padding: '5px 8px 5px 0', fontSize: 12, color: '#c5cad8', fontFamily: 'Space Mono, monospace' }}>{children}</td>
        ),
        hr: () => <hr style={{ border: 'none', borderTop: '1px solid #1e2230', margin: '10px 0' }} />,
        code: ({ children }) => (
          <code style={{ fontFamily: 'Space Mono, monospace', fontSize: 11, color: '#e2e6f0', background: '#161922', padding: '1px 4px', borderRadius: 3 }}>{children}</code>
        ),
      }}
    >
      {children}
    </ReactMarkdown>
  );
}



// ─── Yahoo Finance → GICS sector mapper ──────────────────────────────────────
// Maps Yahoo's plain-English sector strings to our TopLevelSector keys.
// Used to classify external tickers using live Yahoo data instead of fallback.

const YAHOO_TO_GICS: Record<string, TopLevelSector> = {
  'Technology': 'information_technology',
  'Financial Services': 'financials',
  'Financials': 'financials',
  'Healthcare': 'health_care',
  'Health Care': 'health_care',
  'Consumer Cyclical': 'consumer_discretionary',
  'Consumer Defensive': 'consumer_staples',
  'Consumer Staples': 'consumer_staples',
  'Communication Services': 'communication_services',
  'Energy': 'energy',
  'Industrials': 'industrials',
  'Basic Materials': 'materials',
  'Materials': 'materials',
  'Real Estate': 'real_estate',
  'Utilities': 'utilities',
};

function yahooSectorToGics(yahooSector?: string): TopLevelSector {
  if (!yahooSector) return 'other';
  return YAHOO_TO_GICS[yahooSector] ?? 'other';
}

// ─── Fund category (Morningstar-style) → GICS mapper ─────────────────────────
// Sparse and honest — only categories that genuinely map to ONE sector get
// mapped. Everything else (Large Blend, Target-Date, World/Moderate
// Allocation, Foreign Large Blend, etc.) falls through to 'diversified'
// rather than guessing a sector a broad fund doesn't really have.
const FUND_CATEGORY_TO_GICS: Record<string, TopLevelSector> = {
  'Industrials':    'industrials',
  'Real Estate':    'real_estate',
  'Utilities':      'utilities',
  'Equity Energy':  'energy',
  'Technology':     'information_technology',
  'Financial':      'financials',
  'Health':         'health_care',
  'Communications': 'communication_services',
};

function fundCategoryToGics(category?: string): TopLevelSector {
  if (!category) return 'diversified';
  return FUND_CATEGORY_TO_GICS[category] ?? 'diversified';
}

// ─── Single source of truth for ticker → sector resolution ───────────────────
// Replaces the previously-duplicated inline "sector === 'other' && live?.yahooSector
// ? yahooSectorToGics(...) : ..." checks scattered across this file. Order:
// 1. Known universe/KNOWN_TICKERS classification (classifyTicker)
// 2. If unclassified and it's a fund (ETF/mutual fund) → fund category mapper
// 3. If unclassified and it's a stock → live Yahoo sector fallback
// 4. Otherwise 'other'
function resolveSector(
  ticker: string,
  live?: { yahooSector?: string; fundCategory?: string; quoteType?: string },
): { sector: TopLevelSector; subSector: SubSector | null } {
  const base = classifyTicker(ticker);
  if (base.sector !== 'other') return base;

  const isFund = live?.quoteType === 'ETF' || live?.quoteType === 'MUTUALFUND';
  if (isFund) return { sector: fundCategoryToGics(live?.fundCategory), subSector: null };
  if (live?.yahooSector) return { sector: yahooSectorToGics(live.yahooSector), subSector: null };
  return base;
}

// ─── TickerSearchInput ────────────────────────────────────────────────────────

interface TickerSearchInputProps {
  value: string;
  onChange: (val: string) => void;
  onEnter?: () => void;
  placeholder?: string;
  style?: React.CSSProperties;
}

function TickerSearchInput({ value, onChange, onEnter, placeholder = 'Enter ticker…', style }: TickerSearchInputProps) {
  const [inputVal, setInputVal] = useState(value);
  const [validating, setValidating] = useState(false);
  const [validError, setValidError] = useState('');

  // Sync controlled value → local input
  useEffect(() => { setInputVal(value); }, [value]);

  async function handleBlur() {
    const upper = inputVal.trim().toUpperCase();
    if (!upper) { setValidError(''); return; }

    // Validate via price API
    setValidating(true);
    setValidError('');
    try {
      const res = await fetch(`/api/prices?tickers=${encodeURIComponent(upper)}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      const entry = Array.isArray(data) ? data.find((d: { ticker: string; fetchError?: boolean }) => d.ticker === upper) : null;
      if (!entry || entry.fetchError || entry.price == null) {
        setValidError('Ticker not found');
        onChange('');
      } else {
        onChange(upper);
        setValidError('');
      }
    } catch {
      setValidError('Ticker not found');
      onChange('');
    } finally {
      setValidating(false);
    }
  }

  function handleInputChange(raw: string) {
    const upper = raw.toUpperCase();
    setInputVal(upper);
    setValidError('');
  }

  const baseStyle: React.CSSProperties = {
    background: '#161922',
    border: `1px solid ${validError ? '#ff4b6e' : '#1e2230'}`,
    borderRadius: 6,
    color: '#e2e6f0',
    fontSize: 12,
    padding: '6px 10px',
    outline: 'none',
    fontFamily: 'Space Mono, monospace',
    textTransform: 'uppercase',
    width: '100%',
    boxSizing: 'border-box',
  };

  return (
    <div style={{ position: 'relative', ...style }}>
      <input
        value={inputVal}
        onChange={e => handleInputChange(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={e => { if (e.key === 'Enter') onEnter?.(); }}
        placeholder={placeholder}
        maxLength={8}
        style={baseStyle}
        autoComplete="off"
        spellCheck={false}
      />
      {validating && (
        <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: '#8b93a8' }}>…</span>
      )}
      {validError && (
        <div style={{ fontSize: 10, color: '#ff4b6e', marginTop: 3 }}>{validError}</div>
      )}
    </div>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PortfolioPosition {
  id: string;
  ticker: string;
  shares: number;
  costBasisPerShare: number;
}

interface LiveData {
  price: number | null;
  loading: boolean;
  error: boolean;
  yahooSector?: string;
  yahooIndustry?: string;
  fundCategory?: string;
  quoteType?: string;
}

interface ComputedPosition extends PortfolioPosition {
  sector: TopLevelSector;
  subSector: SubSector | null;
  inUniverse: boolean;
  livePrice: number | null;
  currentValue: number | null;
  unrealizedGainPct: number | null;
  portfolioWeightPct: number;
  liveLoading: boolean;
  liveError: boolean;
}

interface ExploreSuggestion {
  ticker: string;
  rationale: string;
  marketCapRange: string;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PortfolioTab({
  syncedPositions     = null,
  syncedAccountType   = null,
  syncedSectorTargets = null,
  syncedCashAmount    = null,
  syncedPreferences   = null,
  syncLoading         = false,
  isAuthenticated     = false,
  onSavePositions     = async () => {},
  onSavePreferences   = async () => {},
}: Partial<PortfolioTabSyncProps> = {}) {
  // When authenticated, Supabase data is source of truth; session is anonymous fallback
  const _session = isAuthenticated ? {} : loadSession();

  // Track whether we've seeded state from synced data yet (avoid double-init)
  const syncSeeded = useRef(false);

  const [positions, setPositions] = useState<PortfolioPosition[]>(_session.positions ?? []);
  const [liveData, setLiveData] = useState<Record<string, LiveData>>(_session.liveData ?? {});
  const [accountType, setAccountType] = useState<AccountType>(_session.accountType ?? 'unspecified');
  const [acctPanelOpen, setAcctPanelOpen] = useState(false);
  const [investorPreferences, setInvestorPreferences] = useState<InvestorPreferences>(DEFAULT_PREFERENCES);
  const [prefsPanelOpen, setPrefsPanelOpen] = useState(false);

  // Add form
  const [addTicker, setAddTicker] = useState('');
  const [addShares, setAddShares] = useState('');
  const [addBasis, setAddBasis] = useState('');
  const [addError, setAddError] = useState('');

  // Sector targets
  const [targetsOpen, setTargetsOpen] = useState(false);
  const [sectorTargets, setSectorTargets] = useState<SectorTargets>(_session.sectorTargets ?? {});
  const hasTargets = Object.values(sectorTargets).some(v => v != null);

  // Chart expansion
  const [chartExpanded, setChartExpanded] = useState<Set<TopLevelSector>>(new Set());

  // Macro risk
  const [macroRisk, setMacroRisk] = useState<string | null>(null);
  const [macroLoading, setMacroLoading] = useState(false);
  const [macroError, setMacroError] = useState('');

  // Scenario analysis
  const [scenarioOpen, setScenarioOpen] = useState(false);
  const [projectedTargets, setProjectedTargets] = useState<Record<string, number | null>>({});
  const [scenarioResult, setScenarioResult] = useState<string | null>(null);
  const [scenarioLoading, setScenarioLoading] = useState(false);
  const [scenarioError, setScenarioError] = useState('');

  // Add simulation
  const [simTicker, setSimTicker] = useState('');
  const [simAlloc, setSimAlloc] = useState(0);
  const [simLive, setSimLive] = useState<LiveData>({ price: null, loading: false, error: false });
  const [trimResult, setTrimResult] = useState<string | null>(null);
  const [trimLoading, setTrimLoading] = useState(false);
  const [trimError, setTrimError] = useState('');
  const [memoResult, setMemoResult] = useState<string | null>(null);
  const [memoLoading, setMemoLoading] = useState(false);
  const [memoError, setMemoError] = useState('');

  // Sector Explore
  const [exploreOpen, setExploreOpen] = useState(false);
  const [exploreSector, setExploreSector] = useState<TopLevelSector | null>(null);
  const [exploreSuggestions, setExploreSuggestions] = useState<ExploreSuggestion[]>([]);
  const [exploreLoading, setExploreLoading] = useState(false);
  const [exploreError, setExploreError] = useState('');

  const simFetchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Cash state ───────────────────────────────────────────────────────────
  const [cashAmount, setCashAmount]     = useState<number>(0);
  const [cashMode, setCashMode]         = useState<boolean>(false);   // $ mode vs % slider mode
  const [cashResult, setCashResult]     = useState<string | null>(null);
  const [cashLoading, setCashLoading]   = useState(false);
  const [cashError, setCashError]       = useState('');

  // ─── Seed state from Supabase when sync data arrives (authenticated users) ──
  useEffect(() => {
    if (!isAuthenticated || syncSeeded.current) return;
    if (syncedPositions === null) return; // still loading

    syncSeeded.current = true;

    if (syncedPositions.length > 0) {
      setPositions(syncedPositions);
      // Kick off live price fetches for each loaded position
      syncedPositions.forEach(p => fetchLiveForPosition(p.id, p.ticker));
    }
    if (syncedAccountType) {
      setAccountType(syncedAccountType);
    }
    if (syncedSectorTargets && Object.keys(syncedSectorTargets).length > 0) {
      setSectorTargets(syncedSectorTargets);
    }
    if (syncedCashAmount != null && syncedCashAmount > 0) {
      setCashAmount(syncedCashAmount);
    }
    if (syncedPreferences) {
      setInvestorPreferences(syncedPreferences);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, syncedPositions, syncedAccountType, syncedSectorTargets, syncedPreferences]);

  // ─── Persist positions ────────────────────────────────────────────────────
  // Authenticated: write to Supabase (debounced in hook)
  // Anonymous: write to sessionStorage
  useEffect(() => {
    if (!syncSeeded.current && isAuthenticated) return; // don't write empty state before seed
    if (isAuthenticated) {
      onSavePositions(positions);
    } else {
      if (positions.length === 0 && Object.keys(sectorTargets).length === 0) return;
      saveSession({ positions, liveData, sectorTargets, accountType, savedAt: Date.now() });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions]);

  // ─── Persist preferences (account type + sector targets + cash + investor prefs) ─
  useEffect(() => {
    if (!syncSeeded.current && isAuthenticated) return;
    if (isAuthenticated) {
      onSavePreferences(accountType, sectorTargets, cashAmount, investorPreferences);
    } else {
      if (positions.length === 0 && Object.keys(sectorTargets).length === 0) return;
      saveSession({ positions, liveData, sectorTargets, accountType, savedAt: Date.now() });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountType, sectorTargets, cashAmount, investorPreferences]);

  // ─── Price fetching ───────────────────────────────────────────────────────

  const fetchPrice = useCallback(async (ticker: string): Promise<{ price: number | null; yahooSector?: string; yahooIndustry?: string; fundCategory?: string; quoteType?: string }> => {
    try {
      const res = await fetch(`/api/prices?tickers=${encodeURIComponent(ticker)}`);
      if (!res.ok) return { price: null };
      const data = await res.json();
      const entry = Array.isArray(data) ? data.find((d: { ticker: string }) => d.ticker === ticker) : null;
      return {
        price: entry?.price ?? null,
        yahooSector: entry?.yahooSector,
        yahooIndustry: entry?.yahooIndustry,
        fundCategory: entry?.fundCategory,
        quoteType: entry?.quoteType,
      };
    } catch { return { price: null }; }
  }, []);

  async function fetchLiveForPosition(id: string, ticker: string) {
    setLiveData(prev => ({ ...prev, [id]: { price: null, loading: true, error: false } }));
    const result = await fetchPrice(ticker);
    setLiveData(prev => ({ ...prev, [id]: { price: result.price, loading: false, error: result.price == null, yahooSector: result.yahooSector, yahooIndustry: result.yahooIndustry, fundCategory: result.fundCategory, quoteType: result.quoteType } }));
  }

  // ─── Computed positions ───────────────────────────────────────────────────

  function getComputed(): ComputedPosition[] {
    const raw = positions.map(p => {
      const live = liveData[p.id];
      const livePrice = live?.price ?? null;
      const currentValue = livePrice != null ? livePrice * p.shares : null;
      const costTotal = p.shares * p.costBasisPerShare;
      const unrealizedGainPct = currentValue != null && costTotal > 0
        ? ((currentValue - costTotal) / costTotal) * 100 : null;
      // For external tickers, prefer Yahoo Finance sector classification —
      // resolveSector() branches to fund-category mapping for ETFs/mutual funds.
      const { sector, subSector } = resolveSector(p.ticker, live);
      return { ...p, sector, subSector, inUniverse: isInUniverse(p.ticker), livePrice, currentValue, unrealizedGainPct, portfolioWeightPct: 0, liveLoading: live?.loading ?? false, liveError: live?.error ?? false };
    });
    const positionsValue = raw.reduce((s, p) => s + (p.currentValue ?? 0), 0);
    // When cash is set, weights are diluted across the expanded total (positions + cash)
    const expandedTotal = positionsValue + (cashAmount > 0 ? cashAmount : 0);
    const denominator = expandedTotal > 0 ? expandedTotal : positionsValue;
    return raw.map(p => ({ ...p, portfolioWeightPct: denominator > 0 && p.currentValue != null ? (p.currentValue / denominator) * 100 : 0 }));
  }

  function getSectorActuals(computed: ComputedPosition[]): SectorActuals {
    const acc: SectorActuals = {};
    for (const p of computed) acc[p.sector] = (acc[p.sector] ?? 0) + p.portfolioWeightPct;
    return acc;
  }

  function getSubSectorActuals(computed: ComputedPosition[]): SubSectorActuals {
    const acc: SubSectorActuals = {};
    for (const p of computed) {
      if (p.subSector) acc[p.subSector] = (acc[p.subSector] ?? 0) + p.portfolioWeightPct;
    }
    return acc;
  }

  // ─── Add / remove position ────────────────────────────────────────────────

  async function handleAddPosition() {
    setAddError('');
    const ticker = addTicker.trim().toUpperCase();
    const shares = parseFloat(addShares);
    const basis = parseFloat(addBasis);
    if (!ticker) { setAddError('Enter a ticker symbol.'); return; }
    if (isNaN(shares) || shares <= 0) { setAddError('Enter a valid number of shares.'); return; }
    if (isNaN(basis) || basis <= 0) { setAddError('Enter a valid cost basis per share.'); return; }
    if (positions.some(p => p.ticker === ticker)) { setAddError(`${ticker} is already added.`); return; }
    const id = `${ticker}-${Date.now()}`;
    setPositions(prev => [...prev, { id, ticker, shares, costBasisPerShare: basis }]);
    setAddTicker(''); setAddShares(''); setAddBasis('');
    fetchLiveForPosition(id, ticker);
  }

  function handleRemovePosition(id: string) {
    setPositions(prev => prev.filter(p => p.id !== id));
    setLiveData(prev => { const n = { ...prev }; delete n[id]; return n; });
    setMacroRisk(null); setTrimResult(null); setScenarioResult(null);
  }

  // ─── Chart expand ─────────────────────────────────────────────────────────

  function toggleChartExpand(sector: TopLevelSector) {
    setChartExpanded(prev => {
      const next = new Set(prev);
      next.has(sector) ? next.delete(sector) : next.add(sector);
      return next;
    });
  }

  // ─── Macro risk ───────────────────────────────────────────────────────────

  async function runMacroRisk(computed: ComputedPosition[], sectorActuals: SectorActuals, subSectorActuals: SubSectorActuals) {
    setMacroLoading(true); setMacroError('');
    try {
      const expandedTotal = totalValue + (cashAmount > 0 ? cashAmount : 0);
      const cashCtx = cashAmount > 0 ? buildCashContext(cashAmount, totalValue) : undefined;
      const res = await fetch('/api/portfolio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'macro_risk',
          positions: computed.map(p => ({
            ticker: p.ticker, sector: p.sector, subSector: p.subSector ?? undefined,
            // Send weights as % of expanded total (including cash) so everything adds to <100% when cash is present
            weightPct: parseFloat((expandedTotal > 0 && p.currentValue != null ? (p.currentValue / expandedTotal * 100) : p.portfolioWeightPct).toFixed(1)),
            gainPct: parseFloat((p.unrealizedGainPct ?? 0).toFixed(1)),
            inUniverse: p.inUniverse,
          })),
          accountType,
          accountContext: ACCOUNT_TYPES[accountType].taxTreatment,
          preferences: investorPreferences,
          sectorTargets: hasTargets ? sectorTargets : undefined,
          sectorActuals: hasTargets ? sectorActuals : undefined,
          subSectorActuals: Object.keys(subSectorActuals).length > 0 ? subSectorActuals : undefined,
          cashContext: cashCtx,
        }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error ?? 'API error'); }
      const { result } = await res.json();
      setMacroRisk(result);
    } catch (e: unknown) {
      setMacroError(e instanceof Error ? e.message : 'Unknown error');
    } finally { setMacroLoading(false); }
  }

  // ─── Scenario analysis ────────────────────────────────────────────────────

  function initProjectedTargets(sectorActuals: SectorActuals) {
    // Pre-fill projected targets from current targets (or actuals if no targets set)
    const init: Record<string, number | null> = {};
    for (const sector of SECTOR_ORDER) {
      const existing = sectorTargets[sector];
      const actual = sectorActuals[sector];
      if (existing != null) init[sector] = existing;
      else if ((actual ?? 0) > 0.1) init[sector] = Math.round(actual ?? 0);
      else init[sector] = null;
    }
    setProjectedTargets(init);
    setScenarioResult(null);
    setScenarioError('');
  }

  function projectedTotal(): number {
    const vals = Object.values(projectedTargets);
    let t = 0;
    for (const v of vals) t += (v ?? 0);
    return t;
  }

  async function runScenarioAnalysis(computed: ComputedPosition[], sectorActuals: SectorActuals) {
    setScenarioLoading(true); setScenarioError('');
    try {
      const res = await fetch('/api/portfolio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'macro_scenario',
          positions: computed.map(p => ({
            ticker: p.ticker, sector: p.sector, subSector: p.subSector ?? undefined,
            weightPct: parseFloat(p.portfolioWeightPct.toFixed(1)),
            gainPct: parseFloat((p.unrealizedGainPct ?? 0).toFixed(1)),
            inUniverse: p.inUniverse,
          })),
          accountType,
          accountContext: ACCOUNT_TYPES[accountType].taxTreatment,
          preferences: investorPreferences,
          sectorTargets: hasTargets ? sectorTargets : undefined,
          sectorActuals,
          projectedTargets,
        }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error ?? 'API error'); }
      const { result } = await res.json();
      setScenarioResult(result);
    } catch (e: unknown) {
      setScenarioError(e instanceof Error ? e.message : 'Unknown error');
    } finally { setScenarioLoading(false); }
  }

  // ─── Simulation ───────────────────────────────────────────────────────────

  function handleSimTickerChange(raw: string) {
    const ticker = raw.toUpperCase();
    setSimTicker(ticker);
    setSimLive({ price: null, loading: false, error: false });
    setTrimResult(null);
    setMemoResult(null);
    if (simFetchRef.current) clearTimeout(simFetchRef.current);
    if (!ticker) { setSimAlloc(0); return; }
    if (!cashMode) {
      // % mode: snap slider to current weight if ticker is already held
      const existingPos = computed.find(p => p.ticker === ticker);
      if (existingPos) {
        setSimAlloc(Math.round(existingPos.portfolioWeightPct));
      } else {
        setSimAlloc(8);
      }
    }
    simFetchRef.current = setTimeout(async () => {
      setSimLive({ price: null, loading: true, error: false });
      const result = await fetchPrice(ticker);
      setSimLive({ price: result.price, loading: false, error: result.price == null, yahooSector: result.yahooSector, yahooIndustry: result.yahooIndustry });
    }, 600);
  }

  function getSimSectorImpact(sectorActuals: SectorActuals) {
    if (!simTicker) return null;
    const { sector: simSector } = resolveSector(simTicker, simLive);

    const existingPos = computed.find(p => p.ticker === simTicker);
    const currentPct = existingPos ? existingPos.portfolioWeightPct : 0;
    // In cash mode use the render-scope cashWeightPct so math is consistent;
    // fall back to 0 if prices not yet loaded (prevents divide-by-zero crash)
    const newTargetPct = cashMode
      ? cashWeightPct   // already guarded: 0 when totalValue === 0 or cashAmount === 0
      : simAlloc;

    const newActuals: SectorActuals = {};

    if (cashMode && !existingPos) {
      // Cash-funded new position: all existing weights dilute, new sector grows
      if (newTargetPct === 0) return null;
      const scaleFactor = (100 - newTargetPct) / 100;
      for (const sector of SECTOR_ORDER) newActuals[sector] = (sectorActuals[sector] ?? 0) * scaleFactor;
      newActuals[simSector] = (newActuals[simSector] ?? 0) + newTargetPct;
    } else if (existingPos) {
      // Adjusting an existing position (trim or add): remove current weight, rescale remainder, add at new target
      const remainingBase = 100 - currentPct;
      const scaleFactor = remainingBase > 0 ? (100 - newTargetPct) / remainingBase : 0;
      for (const sector of SECTOR_ORDER) {
        const existing = sectorActuals[sector] ?? 0;
        if (sector === simSector) {
          const sectorWithoutPos = existing - currentPct;
          newActuals[sector] = sectorWithoutPos * scaleFactor + newTargetPct;
        } else {
          newActuals[sector] = existing * scaleFactor;
        }
      }
    } else {
      // % mode, new position: scale everything down and inject at target
      if (newTargetPct === 0) return null;
      const scaleFactor = (100 - newTargetPct) / 100;
      for (const sector of SECTOR_ORDER) newActuals[sector] = (sectorActuals[sector] ?? 0) * scaleFactor;
      newActuals[simSector] = (newActuals[simSector] ?? 0) + newTargetPct;
    }

    return SECTOR_ORDER
      .filter(s => (sectorActuals[s] ?? 0) > 0.1 || (newActuals[s] ?? 0) > 0.1)
      .map(sector => {
        const before = sectorActuals[sector] ?? 0;
        const after = Math.max(0, newActuals[sector] ?? 0);
        const target = sectorTargets[sector] ?? null;
        const beforeGap = target != null ? Math.abs(before - target) : null;
        const afterGap = target != null ? Math.abs(after - target) : null;

        let direction: 'toward' | 'away' | 'neutral' = 'neutral';
        if (beforeGap != null && afterGap != null && Math.abs(after - before) >= 0.5) {
          direction = afterGap < beforeGap ? 'toward' : 'away';
        } else if (target == null && Math.abs(after - before) >= 0.5) {
          direction = sector === simSector ? (newTargetPct > currentPct ? 'toward' : 'away') : 'neutral';
        }

        return { sector, before, after, target, direction };
      });
  }

  async function runTrimSuggestion(computed: ComputedPosition[], sectorActuals: SectorActuals) {
    if (!simTicker) { setTrimError('Enter a candidate ticker first.'); return; }
    setTrimLoading(true); setTrimError('');
    try {
      const { sector: candidateSector, subSector: candidateSubSector } = resolveSector(simTicker, simLive);
      const existingPos = computed.find(p => p.ticker === simTicker);
      const currentWeightPct = existingPos ? parseFloat(existingPos.portfolioWeightPct.toFixed(1)) : undefined;
      const isTrimMode = existingPos != null && simAlloc < existingPos.portfolioWeightPct && !cashMode;
      const isCashFunded = cashMode && !existingPos;

      // Effective target weight: in cash mode, computed from cash share of expanded portfolio
      const effectiveTargetPct = cashMode && cashAmount > 0 && totalValue > 0
        ? parseFloat(((cashAmount / (totalValue + cashAmount)) * 100).toFixed(1))
        : simAlloc;

      const cashCtx = isCashFunded ? buildCashContext(cashAmount, totalValue, [simTicker]) : undefined;

      const res = await fetch('/api/portfolio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'trim',
          positions: computed.map(p => ({
            ticker: p.ticker, sector: p.sector, subSector: p.subSector ?? undefined,
            weightPct: parseFloat(p.portfolioWeightPct.toFixed(1)),
            gainPct: parseFloat((p.unrealizedGainPct ?? 0).toFixed(1)),
            inUniverse: p.inUniverse,
          })),
          candidate: {
            ticker: simTicker, sector: candidateSector,
            subSector: candidateSubSector ?? undefined,
            targetWeightPct: effectiveTargetPct,
            currentWeightPct,
            isTrimMode,
            isCashFunded,
            inUniverse: isInUniverse(simTicker),
          },
          accountType,
          accountContext: ACCOUNT_TYPES[accountType].taxTreatment,
          preferences: investorPreferences,
          sectorTargets: hasTargets ? sectorTargets : undefined,
          sectorActuals: hasTargets ? sectorActuals : undefined,
          cashContext: cashCtx,
        }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error ?? 'API error'); }
      const { result } = await res.json();
      setTrimResult(result);
      // Auto-trigger sector explore when trimming to 0% (full exit) or reducing significantly
      if (isTrimMode && simAlloc === 0 && hasTargets) {
        const freedSector = candidateSector;
        // Find the most underweight sector to explore for redeployment
        // 'diversified' is excluded — suggesting stocks to fill a broad-fund gap
        // is incoherent; the natural action there is "buy more of the fund."
        const bestExplore = SECTOR_ORDER.find(s => {
          const target = sectorTargets[s];
          const actual = sectorActuals[s] ?? 0;
          return target != null && actual < target - 2 && s !== freedSector && s !== 'diversified';
        });
        if (bestExplore) {
          runSectorExplore(bestExplore, computed);
        }
      }
    } catch (e: unknown) {
      setTrimError(e instanceof Error ? e.message : 'Unknown error');
    } finally { setTrimLoading(false); }
  }

  // ─── Memo helpers ─────────────────────────────────────────────────────────

  function getKeyMetrics(ticker: string): string | undefined {
    try {
      const raw = localStorage.getItem('space-tracker-analyses');
      if (!raw) return undefined;
      const parsed = JSON.parse(raw);
      const analysis = parsed?.state?.analyses?.[ticker];
      return analysis?.keyMetrics ?? undefined;
    } catch { return undefined; }
  }

  async function runTrimMemo(computed: ComputedPosition[], sectorActuals: SectorActuals) {
    if (!simTicker) { setMemoError('Enter a candidate ticker first.'); return; }
    setMemoLoading(true); setMemoError('');
    try {
      const { sector: candidateSector, subSector: candidateSubSector } = resolveSector(simTicker, simLive);
      const existingPos = computed.find(p => p.ticker === simTicker);
      const currentWeightPct = existingPos ? parseFloat(existingPos.portfolioWeightPct.toFixed(1)) : undefined;
      const isTrimMode = existingPos != null && simAlloc < existingPos.portfolioWeightPct && !cashMode;
      const isCashFunded = cashMode && !existingPos;

      const effectiveTargetPct = cashMode && cashAmount > 0 && totalValue > 0
        ? parseFloat(((cashAmount / (totalValue + cashAmount)) * 100).toFixed(1))
        : simAlloc;

      const cashCtx = isCashFunded ? buildCashContext(cashAmount, totalValue, [simTicker]) : undefined;

      const res = await fetch('/api/portfolio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'trim_memo',
          positions: computed.map(p => ({
            ticker: p.ticker,
            sector: p.sector,
            subSector: p.subSector ?? undefined,
            weightPct: parseFloat(p.portfolioWeightPct.toFixed(1)),
            gainPct: parseFloat((p.unrealizedGainPct ?? 0).toFixed(1)),
            inUniverse: p.inUniverse,
            keyMetrics: getKeyMetrics(p.ticker),
          })),
          candidate: {
            ticker: simTicker,
            sector: candidateSector,
            subSector: candidateSubSector ?? undefined,
            targetWeightPct: effectiveTargetPct,
            currentWeightPct,
            isTrimMode,
            isCashFunded,
            inUniverse: isInUniverse(simTicker),
            keyMetrics: getKeyMetrics(simTicker),
          },
          accountType,
          accountContext: ACCOUNT_TYPES[accountType].taxTreatment,
          preferences: investorPreferences,
          sectorTargets: hasTargets ? sectorTargets : undefined,
          sectorActuals: hasTargets ? sectorActuals : undefined,
          cashContext: cashCtx,
        }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error ?? 'API error'); }
      const { result } = await res.json();
      setMemoResult(result);
      // Auto-trigger sector explore for trim mode with targets set — show where to redeploy
      if (isTrimMode && hasTargets) {
        const freedSector = candidateSector;
        // 'diversified' is excluded — suggesting stocks to fill a broad-fund gap
        // is incoherent; the natural action there is "buy more of the fund."
        const bestExplore = SECTOR_ORDER.find(s => {
          const target = sectorTargets[s];
          const actual = sectorActuals[s] ?? 0;
          return target != null && actual < target - 2 && s !== freedSector && s !== 'diversified';
        });
        if (bestExplore) {
          runSectorExplore(bestExplore, computed);
        }
      }
    } catch (e: unknown) {
      setMemoError(e instanceof Error ? e.message : 'Unknown error');
    } finally { setMemoLoading(false); }
  }

  // ─── Cash context builder ─────────────────────────────────────────────────
  // Computes cashWeightPct and share-count estimates for up to 3 tickers.
  // Called client-side so no dollar amounts are ever sent to the API.

  function buildCashContext(
    cashDollars: number,
    totalPositionValue: number,
    tickers?: string[],
  ) {
    if (cashDollars <= 0) return undefined;
    const expandedTotal = totalPositionValue + cashDollars;
    const cashWeightPct = expandedTotal > 0 ? (cashDollars / expandedTotal) * 100 : 0;

    const shareExamples = (tickers ?? [])
      .filter(t => {
        if (simTicker === t) return simLive.price != null && simLive.price > 0;
        const pos = positions.find(p => p.ticker === t);
        if (!pos) return false;
        const ld = liveData[pos.id];
        return ld?.price != null && ld.price > 0;
      })
      .slice(0, 4)
      .map(t => {
        let price: number;
        if (simTicker === t && simLive.price != null) {
          price = simLive.price;
        } else {
          const pos = positions.find(p => p.ticker === t);
          price = (pos ? liveData[pos.id]?.price : null) ?? 0;
        }
        if (price <= 0) return null;
        const shares = Math.floor(cashDollars / price);
        const leftover = parseFloat((cashDollars - shares * price).toFixed(2));
        return { ticker: t, shares, leftover };
      })
      .filter((e): e is { ticker: string; shares: number; leftover: number } => e !== null);

    return { cashWeightPct, shareExamples };
  }

  // ─── Cash deploy memo ─────────────────────────────────────────────────────

  async function runCashDeploy(computed: ComputedPosition[], sectorActuals: SectorActuals) {
    if (cashAmount <= 0) { setCashError('Enter a cash amount first.'); return; }
    setCashLoading(true); setCashError('');
    const expandedTotal = totalValue + cashAmount;
    const cashCtx = buildCashContext(cashAmount, totalValue);
    try {
      const res = await fetch('/api/portfolio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'cash_deploy',
          positions: computed.map(p => ({
            ticker: p.ticker, sector: p.sector, subSector: p.subSector ?? undefined,
            weightPct: parseFloat(((p.currentValue ?? 0) / expandedTotal * 100).toFixed(1)),
            gainPct: parseFloat((p.unrealizedGainPct ?? 0).toFixed(1)),
            inUniverse: p.inUniverse,
          })),
          accountType,
          accountContext: ACCOUNT_TYPES[accountType].taxTreatment,
          preferences: investorPreferences,
          sectorTargets: hasTargets ? sectorTargets : undefined,
          sectorActuals: hasTargets ? sectorActuals : undefined,
          cashContext: cashCtx,
        }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error ?? 'API error'); }
      const { result } = await res.json();
      setCashResult(result);
    } catch (e: unknown) {
      setCashError(e instanceof Error ? e.message : 'Unknown error');
    } finally { setCashLoading(false); }
  }

  // ─── Sector Explore ───────────────────────────────────────────────────────

  async function runSectorExplore(sector: TopLevelSector, computed: ComputedPosition[]) {
    setExploreSector(sector);
    setExploreOpen(true);
    setExploreSuggestions([]);
    setExploreLoading(true);
    setExploreError('');

    try {
      const res = await fetch('/api/portfolio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'sector_explore',
          exploreSector: sector,
          positions: computed.map(p => ({
            ticker: p.ticker, sector: p.sector, subSector: p.subSector ?? undefined,
            weightPct: parseFloat(p.portfolioWeightPct.toFixed(1)),
            gainPct: parseFloat((p.unrealizedGainPct ?? 0).toFixed(1)),
            inUniverse: p.inUniverse,
          })),
          accountType,
          accountContext: ACCOUNT_TYPES[accountType].taxTreatment,
          preferences: investorPreferences,
          sectorTargets: hasTargets ? sectorTargets : undefined,
          sectorActuals: hasTargets ? getSectorActuals(computed) : undefined,
        }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error ?? 'API error'); }
      const { result } = await res.json();
      const parsed: ExploreSuggestion[] = JSON.parse(result);
      setExploreSuggestions(parsed);
    } catch (e: unknown) {
      setExploreError(e instanceof Error ? e.message : 'Failed to load suggestions');
    } finally {
      setExploreLoading(false);
    }
  }

  function handleSimulateExplored(ticker: string) {
    setExploreOpen(false);
    handleSimTickerChange(ticker);
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  const computed = getComputed();
  const sectorActuals = getSectorActuals(computed);
  const subSectorActuals = getSubSectorActuals(computed);
  const simImpact = getSimSectorImpact(sectorActuals);
  // totalValue = positions market value only (not including cash)
  const totalValue = computed.reduce((s, p) => s + (p.currentValue ?? 0), 0);
  const effectiveTotalValue = totalValue + (cashAmount > 0 ? cashAmount : 0);
  // cashWeightPct = cash as % of the expanded portfolio
  const cashWeightPct = effectiveTotalValue > 0 && cashAmount > 0
    ? (cashAmount / effectiveTotalValue) * 100 : 0;
  // Share count estimate for sim ticker in cash mode
  const cashSimShares = cashMode && simLive.price != null && simLive.price > 0 && cashAmount > 0
    ? Math.floor(cashAmount / simLive.price) : null;
  const cashSimLeftover = cashSimShares != null && simLive.price != null
    ? parseFloat((cashAmount - cashSimShares * simLive.price).toFixed(2)) : null;

  const hasPrices = computed.some(p => p.livePrice != null);
  const activeSectors = SECTOR_ORDER.filter(s => (sectorActuals[s] ?? 0) > 0.05);
  const maxActual = Math.max(...activeSectors.map(s => sectorActuals[s] ?? 0), 1);
  const simClassified = simTicker ? resolveSector(simTicker, simLive) : null;
  const acctCfg = ACCOUNT_TYPES[accountType];

  // Sim mode detection — auto-detected from slider vs current weight (% mode only)
  const simExistingPos = simTicker ? computed.find(p => p.ticker === simTicker) : null;
  const simCurrentPct = simExistingPos ? simExistingPos.portfolioWeightPct : 0;
  const simIsHeld = simExistingPos != null;
  const simIsTrim = !cashMode && simIsHeld && simAlloc < simCurrentPct;
  const simIsExit = !cashMode && simIsHeld && simAlloc === 0;
  // simIsAdd derived but not used directly in render — trim/cash modes cover all cases

  // 'diversified' is excluded from gap-fill suggestions for the same reason —
  // no single stock closes a "not enough index fund" gap.
  const underweightSectors = SECTOR_ORDER.filter(s => {
    const target = sectorTargets[s];
    const actual = sectorActuals[s] ?? 0;
    return target != null && actual < target - 2 && s !== 'diversified';
  });

  function renderDirectionArrow(d: 'toward' | 'away' | 'neutral', hasTarget: boolean) {
    if (d === 'toward') return <span style={{ color: '#00e676', fontSize: 13 }}>↑</span>;
    if (d === 'away') return <span style={{ color: '#ff4b6e', fontSize: 13 }}>↓</span>;
    if (!hasTarget) return <span style={{ color: '#8b93a8', fontSize: 13 }}>–</span>;
    return <span style={{ color: '#8b93a8', fontSize: 13 }}>–</span>;
  }

  const inputStyle: React.CSSProperties = {
    background: '#161922', border: '1px solid #1e2230', borderRadius: 6,
    color: '#e2e6f0', fontSize: 12, padding: '5px 8px', outline: 'none',
  };

  const total = projectedTotal();
  const totalOk = Math.abs(total - 100) < 0.5;

  return (
    <div style={{ fontFamily: 'DM Sans, sans-serif', color: '#e2e6f0' }}>

      {/* Supabase loading overlay — shown briefly while hydrating authenticated session */}
      {syncLoading && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 50,
          background: '#08090dcc', backdropFilter: 'blur(2px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: 12,
        }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid #1e2230', borderTopColor: '#a259ff', animation: 'spin 0.7s linear infinite' }} />
          <span style={{ fontFamily: 'Space Mono, monospace', fontSize: 11, letterSpacing: '0.1em', color: '#8b93a8' }}>LOADING YOUR PORTFOLIO…</span>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* Targets panel */}
      <SectorTargetsPanel
        open={targetsOpen} onClose={() => setTargetsOpen(false)}
        actuals={sectorActuals} subSectorActuals={subSectorActuals}
        targets={sectorTargets}
        onSave={t => { setSectorTargets(t); setMacroRisk(null); }}
      />

      {/* Account type panel */}
      {acctPanelOpen && (
        <AccountTypePanel
          value={accountType}
          onChange={t => { setAccountType(t); setMacroRisk(null); setTrimResult(null); }}
          onClose={() => setAcctPanelOpen(false)}
        />
      )}

      {/* Investor preferences panel */}
      {prefsPanelOpen && (
        <PreferencesPanel
          value={investorPreferences}
          onChange={p => { setInvestorPreferences(p); setMacroRisk(null); setTrimResult(null); }}
          onClose={() => setPrefsPanelOpen(false)}
        />
      )}

      {/* Sector Explore panel */}
      {exploreOpen && exploreSector && (
        <SectorExplorePanel
          sector={exploreSector}
          loading={exploreLoading}
          error={exploreError}
          suggestions={exploreSuggestions}
          sectorActuals={sectorActuals}
          sectorTargets={sectorTargets}
          onSimulate={handleSimulateExplored}
          onClose={() => setExploreOpen(false)}
        />
      )}

      {/* Scenario panel */}
      {scenarioOpen && (
        <ScenarioPanel
          sectorActuals={sectorActuals}
          sectorTargets={sectorTargets}
          projectedTargets={projectedTargets}
          setProjectedTargets={setProjectedTargets}
          scenarioResult={scenarioResult}
          scenarioLoading={scenarioLoading}
          scenarioError={scenarioError}
          total={total}
          totalOk={totalOk}
          accountType={accountType}
          acctCfg={acctCfg}
          onRun={() => runScenarioAnalysis(computed, sectorActuals)}
          onClose={() => setScenarioOpen(false)}
        />
      )}

      {/* Account type bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, padding: '10px 16px', background: '#0f1117', border: '1px solid #1e2230', borderRadius: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: '#8b93a8', letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Account type</span>
        <button onClick={() => setAcctPanelOpen(true)} style={{ background: `${acctCfg.color}18`, border: `1px solid ${acctCfg.color}55`, borderRadius: 6, cursor: 'pointer', color: acctCfg.color, fontSize: 12, fontFamily: 'Space Mono, monospace', padding: '4px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
          {acctCfg.label}<span style={{ fontSize: 10, opacity: 0.7 }}>▾</span>
        </button>
        <button onClick={() => setPrefsPanelOpen(true)} style={{ background: '#a259ff18', border: '1px solid #a259ff55', borderRadius: 6, cursor: 'pointer', color: '#a259ff', fontSize: 12, fontFamily: 'Space Mono, monospace', padding: '4px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
          Preferences <span style={{ fontSize: 10, opacity: 0.7 }}>▾</span>
        </button>
        {acctCfg.constraints.length > 0 && (
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', flex: 1 }}>
            {acctCfg.constraints.map(c => (
              <span key={c} style={{ fontSize: 10, color: acctCfg.color, border: `1px solid ${acctCfg.color}33`, borderRadius: 4, padding: '2px 6px', background: `${acctCfg.color}0d`, whiteSpace: 'nowrap' }}>{c}</span>
            ))}
          </div>
        )}
        {accountType === 'unspecified' && <span style={{ fontSize: 11, color: '#8b93a8', fontStyle: 'italic' }}>Set account type for tax-aware analysis</span>}
      </div>

      {/* ══════════════════════════════════════════════════════════════════ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(0,3fr)', gap: 20, alignItems: 'start' }}>

        {/* ══════════ LEFT COLUMN ══════════ */}
        <div>
          {/* Positions header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8b93a8' }}>Your positions</span>
              {isAuthenticated && (
                <span style={{ fontSize: 10, color: '#00e676', fontFamily: 'Space Mono, monospace', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#00e676', display: 'inline-block' }} />
                  SYNCED
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {cashAmount > 0 && hasPrices && (
                <span style={{ fontSize: 11, fontFamily: 'Space Mono, monospace', color: '#00e676' }}>
                  + ${cashAmount >= 1_000_000 ? `${(cashAmount / 1_000_000).toFixed(2)}M` : cashAmount >= 1_000 ? `${(cashAmount / 1_000).toFixed(1)}K` : cashAmount.toFixed(0)} cash
                </span>
              )}
              <span style={{ fontSize: 11, color: '#8b93a8', fontFamily: 'Space Mono, monospace' }}>
                {positions.length} position{positions.length !== 1 ? 's' : ''}
                {hasPrices && effectiveTotalValue > 0 && (
                  <> · ${effectiveTotalValue >= 1_000_000 ? `${(effectiveTotalValue / 1_000_000).toFixed(2)}M` : effectiveTotalValue >= 1_000 ? `${(effectiveTotalValue / 1_000).toFixed(1)}K` : effectiveTotalValue.toFixed(0)} total</>
                )}
              </span>
            </div>
          </div>

          {/* Cash balance row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, padding: '8px 12px', background: cashAmount > 0 ? '#00e67608' : '#0f1117', border: `1px solid ${cashAmount > 0 ? '#00e67633' : '#1e2230'}`, borderRadius: 8, transition: 'all 0.2s' }}>
            <span style={{ fontSize: 11, color: '#8b93a8', whiteSpace: 'nowrap', letterSpacing: '0.03em' }}>Cash available</span>
            <span style={{ fontSize: 13, color: '#8b93a8' }}>$</span>
            <input
              type="number"
              min={0}
              step={100}
              value={cashAmount || ''}
              onChange={e => {
                const v = parseFloat(e.target.value);
                setCashAmount(isNaN(v) || v < 0 ? 0 : v);
                setCashResult(null);
              }}
              placeholder="0"
              style={{ ...inputStyle, width: 120, fontFamily: 'Space Mono, monospace', fontSize: 13, color: cashAmount > 0 ? '#00e676' : '#e2e6f0' }}
            />
            {cashAmount > 0 && hasPrices && totalValue > 0 && (
              <span style={{ fontSize: 10, color: '#00e676', fontFamily: 'Space Mono, monospace', marginLeft: 4 }}>
                ≈ {cashWeightPct.toFixed(1)}% of portfolio
              </span>
            )}
            {cashAmount > 0 && (
              <button
                onClick={() => { setCashAmount(0); setCashResult(null); setCashMode(false); }}
                style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#8b93a8', fontSize: 13, lineHeight: 1, padding: '2px 4px' }}
                title="Clear cash"
              >×</button>
            )}
          </div>

          {/* Cash deployment — standalone, no macro risk run required first */}
          {cashAmount > 0 && computed.length > 0 && hasPrices && (
            <div style={{ marginBottom: 16 }}>
              {!cashResult && !cashLoading && (
                <button
                  onClick={() => runCashDeploy(computed, sectorActuals)}
                  style={{ background: 'none', border: '1px solid #00e67644', borderRadius: 8, color: '#00e676', fontSize: 12, padding: '8px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <span style={{ fontSize: 13 }}>$</span> Where to deploy cash?
                </button>
              )}
              {cashLoading && <div style={{ fontSize: 12, color: '#8b93a8', padding: '12px 0' }}>Analyzing…</div>}
              {cashError && <div style={{ fontSize: 11, color: '#ff4b6e', padding: '8px 0' }}>{cashError}</div>}
              {cashResult && (
                <div style={{ borderLeft: '3px solid #00e676', padding: '16px 18px', background: '#00e6760d', borderRadius: '0 8px 8px 0' }}>
                  <div style={{ fontSize: 10, fontWeight: 500, color: '#00e676', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                    Cash Deployment
                    <span style={{ color: '#8b93a8', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>· {cashWeightPct.toFixed(1)}% of portfolio</span>
                    {accountType !== 'unspecified' && (
                      <span style={{ color: acctCfg.color, background: `${acctCfg.color}18`, border: `1px solid ${acctCfg.color}44`, borderRadius: 4, padding: '1px 6px', fontSize: 9, fontFamily: 'Space Mono, monospace' }}>{acctCfg.shortLabel}</span>
                    )}
                  </div>
                  <MarkdownCard>{cashResult}</MarkdownCard>
                  <button onClick={() => runCashDeploy(computed, sectorActuals)} disabled={cashLoading} style={{ marginTop: 10, background: 'none', border: '1px solid #1e2230', borderRadius: 6, color: '#8b93a8', fontSize: 11, padding: '4px 10px', cursor: 'pointer' }}>↺ Re-run</button>
                </div>
              )}
            </div>
          )}

          {/* Positions table */}
          <div style={{ background: '#0f1117', border: '1px solid #1e2230', borderRadius: 12, overflow: 'hidden', marginBottom: 24 }}>
            {positions.length === 0 ? (
              <div style={{ padding: '32px 20px', textAlign: 'center', color: '#8b93a8', fontSize: 13 }}>Add your first position below to get started.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #1e2230' }}>
                    {['Ticker', 'Sector', 'Price', 'Cost basis', 'Gain / loss', 'Allocation', ''].map(h => (
                      <th key={h} style={{ textAlign: ['Allocation', 'Price', 'Cost basis', 'Gain / loss'].includes(h) ? 'right' : 'left', padding: '6px 10px', color: '#8b93a8', fontWeight: 400, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {computed.map(p => {
                    const { color } = SECTOR_DISPLAY[p.sector];
                    const subLabel = p.subSector ? SUBSECTOR_DISPLAY[p.subSector]?.label : null;
                    const gainColor = p.unrealizedGainPct == null ? '#8b93a8' : p.unrealizedGainPct >= 0 ? '#00e676' : '#ff4b6e';
                    return (
                      <tr key={p.id} style={{ borderBottom: '1px solid #1e2230' }}>
                        <td style={{ padding: '6px 10px' }}>
                          <span style={{ background: `${color}22`, color, fontFamily: 'Space Mono, monospace', fontSize: 11, fontWeight: 500, padding: '2px 6px', borderRadius: 4 }}>{p.ticker}</span>
                          {!p.inUniverse && <span style={{ marginLeft: 5, fontSize: 9, color: '#8b93a8', border: '1px solid #1e2230', borderRadius: 3, padding: '1px 4px' }}>EXT</span>}
                        </td>
                        <td style={{ padding: '6px 10px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ width: 5, height: 5, borderRadius: '50%', background: color, flexShrink: 0 }} />
                              <span style={{ fontSize: 10, color }}>{SECTOR_DISPLAY[p.sector].label}</span>
                            </span>
                            {subLabel && <span style={{ fontSize: 9, color: '#6b7190', paddingLeft: 9 }}>{subLabel}</span>}
                          </div>
                        </td>
                        <td style={{ padding: '6px 10px', textAlign: 'right', fontFamily: 'Space Mono, monospace', fontSize: 11, color: '#e2e6f0' }}>
                          {p.liveLoading ? <span style={{ color: '#8b93a8' }}>…</span> : p.livePrice != null ? `$${p.livePrice.toFixed(2)}` : <span style={{ color: '#ff4b6e', fontSize: 10 }}>ERR</span>}
                        </td>
                        <td style={{ padding: '6px 10px', textAlign: 'right', fontFamily: 'Space Mono, monospace', fontSize: 11, color: '#8b93a8' }}>${p.costBasisPerShare.toFixed(2)}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'right', fontFamily: 'Space Mono, monospace', fontSize: 11, color: gainColor }}>
                          {p.unrealizedGainPct != null ? `${p.unrealizedGainPct >= 0 ? '+' : ''}${fmt(p.unrealizedGainPct)}%` : '—'}
                        </td>
                        <td style={{ padding: '6px 10px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'flex-end' }}>
                            <div style={{ width: 48, height: 3, background: '#1e2230', borderRadius: 2, flexShrink: 0 }}>
                              <div style={{ height: 3, borderRadius: 2, background: color, width: `${Math.min(p.portfolioWeightPct * 2.5, 100)}%` }} />
                            </div>
                            <span style={{ fontSize: 11, fontFamily: 'Space Mono, monospace', color: '#8b93a8', minWidth: 30 }}>
                              {hasPrices ? `${fmt(p.portfolioWeightPct)}%` : '—'}
                            </span>
                          </div>
                        </td>
                        <td style={{ padding: '6px 6px' }}>
                          <button onClick={() => handleRemovePosition(p.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8b93a8', fontSize: 14, lineHeight: 1, padding: '2px 4px' }} title="Remove">×</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            {/* Add row */}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '8px 10px', borderTop: positions.length > 0 ? '1px solid #1e2230' : 'none', background: '#0f1117' }}>
              <TickerSearchInput
                value={addTicker}
                onChange={setAddTicker}
                onEnter={handleAddPosition}
                placeholder="Search ticker…"
                style={{ width: 160 }}
              />
              <input value={addShares} onChange={e => setAddShares(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddPosition()} placeholder="Shares" type="number" min="0" style={{ ...inputStyle, width: 80 }} />
              <input value={addBasis} onChange={e => setAddBasis(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddPosition()} placeholder="Cost basis / share" type="number" min="0" style={{ ...inputStyle, width: 130 }} />
              <button onClick={handleAddPosition} style={{ background: '#e2e6f0', border: 'none', borderRadius: 6, color: '#08090d', fontSize: 12, fontWeight: 500, padding: '6px 14px', cursor: 'pointer', whiteSpace: 'nowrap' }}>+ Add</button>
              {addError && <span style={{ fontSize: 11, color: '#ff4b6e' }}>{addError}</span>}
            </div>
          </div>

          {/* Sector concentration chart */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8b93a8' }}>Sector concentration</span>
            <div style={{ display: 'flex', gap: 8 }}>
              {hasTargets && underweightSectors.length > 0 && (
                <button
                  onClick={() => runSectorExplore(underweightSectors[0], computed)}
                  style={{ background: 'none', border: '1px solid #00e67633', borderRadius: 6, color: '#00e676', fontSize: 11, padding: '4px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
                  title={`You're underweight ${underweightSectors.map(s => SECTOR_DISPLAY[s].label).join(', ')}`}
                >
                  <span style={{ fontSize: 13 }}>↗</span> Explore gaps
                </button>
              )}
              <button onClick={() => setTargetsOpen(true)} style={{ background: 'none', border: '1px solid #1e2230', borderRadius: 6, color: '#e2e6f0', fontSize: 11, padding: '4px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: 13 }}>⇌</span>{hasTargets ? 'Edit targets' : 'Set targets'}
              </button>
            </div>
          </div>

          <div style={{ background: '#0f1117', border: '1px solid #1e2230', borderRadius: 12, padding: '16px 20px', marginBottom: 16 }}>
            {hasTargets && (
              <div style={{ display: 'flex', gap: 16, marginBottom: 14, fontSize: 11, color: '#8b93a8' }}>
                <span>■ Actual</span><span style={{ opacity: 0.5 }}>□ Target</span>
                <span style={{ color: '#ff4b6e' }}>▲ Over</span><span style={{ color: '#00e676' }}>▼ Under</span>
              </div>
            )}
            {positions.length === 0 ? (
              <div style={{ color: '#8b93a8', fontSize: 13, textAlign: 'center', padding: '16px 0' }}>Add positions to see sector breakdown.</div>
            ) : (
              activeSectors.map(sector => {
                const actual = sectorActuals[sector] ?? 0;
                const target = sectorTargets[sector] ?? null;
                const { color, label } = SECTOR_DISPLAY[sector];
                const delta = target != null ? actual - target : null;
                const barWidth = hasPrices ? (actual / maxActual) * 100 : 0;
                const targetBarWidth = target != null ? (target / maxActual) * 100 : 0;
                const isExp = chartExpanded.has(sector);
                const activeSubSectors = (Object.keys(subSectorActuals) as SubSector[])
                  .filter(ss => SUBSECTOR_DISPLAY[ss]?.parent === sector && (subSectorActuals[ss] ?? 0) > 0.05)
                  .sort((a, b) => (subSectorActuals[b] ?? 0) - (subSectorActuals[a] ?? 0));
                const canExpand = activeSubSectors.length > 0;
                const isUnderweight = target != null && actual < target - 2;

                return (
                  <div key={sector}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: isExp ? 4 : 10 }}>
                      <button onClick={() => canExpand && toggleChartExpand(sector)} style={{ background: 'none', border: 'none', padding: 0, cursor: canExpand ? 'pointer' : 'default', color: canExpand ? '#8b93a8' : 'transparent', fontSize: 9, width: 12, flexShrink: 0, lineHeight: 1 }}>
                        {canExpand ? (isExp ? '▼' : '▶') : ''}
                      </button>
                      <span style={{ width: 100, fontSize: 12, color: '#8b93a8', flexShrink: 0 }}>{label}</span>
                      <div style={{ flex: 1, position: 'relative', height: 22 }}>
                        <div style={{ position: 'absolute', top: 1, left: 0, height: 8, borderRadius: 2, width: `${barWidth}%`, background: color, transition: 'width 0.3s ease' }} />
                        {target != null && <div style={{ position: 'absolute', top: 13, left: 0, height: 8, borderRadius: 2, width: `${targetBarWidth}%`, border: `1.5px solid ${color}`, opacity: 0.5 }} />}
                      </div>
                      <span style={{ fontFamily: 'Space Mono, monospace', fontSize: 11, color, width: 36, textAlign: 'right', flexShrink: 0 }}>{hasPrices ? `${fmt(actual)}%` : '—'}</span>
                      <span style={{ fontFamily: 'Space Mono, monospace', fontSize: 11, width: 40, textAlign: 'right', flexShrink: 0, color: delta == null ? 'transparent' : Math.abs(delta) < 0.5 ? '#8b93a8' : delta > 0 ? '#ff4b6e' : '#00e676' }}>{delta != null ? fmtDelta(delta) : '—'}</span>
                      {isUnderweight && (
                        <button
                          onClick={() => runSectorExplore(sector, computed)}
                          title={`Explore ${label} stocks`}
                          style={{ background: 'none', border: '1px solid #00e67633', borderRadius: 4, color: '#00e676', fontSize: 9, padding: '2px 6px', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
                        >
                          ↗ explore
                        </button>
                      )}
                    </div>
                    {isExp && activeSubSectors.map(ss => {
                      const ssActual = subSectorActuals[ss] ?? 0;
                      return (
                        <div key={ss} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, paddingLeft: 22, opacity: 0.85 }}>
                          <span style={{ width: 90, fontSize: 11, color: '#6b7190', flexShrink: 0 }}>{SUBSECTOR_DISPLAY[ss]?.label ?? ss}</span>
                          <div style={{ flex: 1, position: 'relative', height: 10 }}>
                            <div style={{ position: 'absolute', top: 1, left: 0, height: 6, borderRadius: 2, width: `${hasPrices ? (ssActual / maxActual) * 100 : 0}%`, background: color, opacity: 0.5, transition: 'width 0.3s ease' }} />
                          </div>
                          <span style={{ fontFamily: 'Space Mono, monospace', fontSize: 10, color: '#6b7190', width: 36, textAlign: 'right', flexShrink: 0 }}>{hasPrices ? `${fmt(ssActual)}%` : '—'}</span>
                          <span style={{ width: 40 }} />
                        </div>
                      );
                    })}
                    {isExp && <div style={{ marginBottom: 6 }} />}
                  </div>
                );
              })
            )}
          </div>

          {/* ── Macro risk ── */}
          {computed.length > 0 && hasPrices && (
            <>
              {!macroRisk && !macroLoading && (
                <button onClick={() => runMacroRisk(computed, sectorActuals, subSectorActuals)} style={{ background: 'none', border: '1px solid #1e2230', borderRadius: 8, color: '#e2e6f0', fontSize: 12, padding: '8px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                  ✦ Run macro risk analysis{cashAmount > 0 ? ' · includes cash' : ''}
                </button>
              )}
              {macroLoading && <div style={{ fontSize: 12, color: '#8b93a8', padding: '12px 0' }}>Analyzing portfolio…</div>}
              {macroError && <div style={{ fontSize: 12, color: '#ff4b6e', padding: '8px 0' }}>{macroError}</div>}
              {macroRisk && (
                <>
                  <div style={{ borderLeft: '3px solid #ff4b6e', padding: '16px 18px', background: '#ff4b6e0d', marginBottom: 8, borderRadius: '0 8px 8px 0' }}>
                    <div style={{ fontSize: 10, fontWeight: 500, color: '#ff4b6e', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                      Macro Risk
                      {cashAmount > 0 && <span style={{ color: '#00e676', border: '1px solid #00e67633', borderRadius: 4, padding: '1px 6px', fontSize: 9, fontFamily: 'Space Mono, monospace' }}>+ CASH</span>}
                      {accountType !== 'unspecified' && (
                        <span style={{ color: acctCfg.color, background: `${acctCfg.color}18`, border: `1px solid ${acctCfg.color}44`, borderRadius: 4, padding: '1px 6px', fontSize: 9, fontFamily: 'Space Mono, monospace' }}>{acctCfg.shortLabel}</span>
                      )}
                    </div>
                    <MarkdownCard>{macroRisk}</MarkdownCard>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                    <button onClick={() => runMacroRisk(computed, sectorActuals, subSectorActuals)} disabled={macroLoading} style={{ background: 'none', border: '1px solid #1e2230', borderRadius: 6, color: '#8b93a8', fontSize: 11, padding: '4px 10px', cursor: 'pointer' }}>↺ Re-run</button>
                    <button
                      onClick={() => { initProjectedTargets(sectorActuals); setScenarioOpen(true); }}
                      style={{ background: 'none', border: '1px solid #a259ff44', borderRadius: 6, color: '#a259ff', fontSize: 11, padding: '4px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
                    >
                      <span style={{ fontSize: 12 }}>⟳</span> Run scenario analysis
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {/* ══════════ RIGHT COLUMN ══════════ */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8b93a8', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>{cashMode ? 'Cash injection' : simIsTrim ? 'Trim simulation' : 'Add simulation'}</span>
            <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: '1px solid #1e2230', marginLeft: 'auto' }}>
              <button
                onClick={() => { setCashMode(false); setTrimResult(null); setMemoResult(null); }}
                style={{ background: !cashMode ? '#e2e6f0' : '#0f1117', border: 'none', cursor: 'pointer', color: !cashMode ? '#08090d' : '#8b93a8', fontSize: 10, fontFamily: 'Space Mono, monospace', padding: '4px 10px', letterSpacing: '0.06em' }}
              >% MODE</button>
              <button
                onClick={() => { setCashMode(true); setTrimResult(null); setMemoResult(null); }}
                style={{ background: cashMode ? '#00e676' : '#0f1117', border: 'none', cursor: 'pointer', color: cashMode ? '#08090d' : (cashAmount > 0 ? '#00e676' : '#8b93a8'), fontSize: 10, fontFamily: 'Space Mono, monospace', padding: '4px 10px', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 4 }}
              >$ CASH{cashAmount > 0 && !cashMode && <span style={{ opacity: 0.7 }}>·{cashWeightPct.toFixed(0)}%</span>}</button>
            </div>
          </div>
          <div style={{ background: '#0f1117', border: '1px solid #1e2230', borderRadius: 12, padding: '16px' }}>
            <div style={{ fontSize: 12, color: '#8b93a8', marginBottom: 14, lineHeight: 1.5 }}>
              {cashMode
                ? cashAmount > 0
                  ? `Simulating deployment of ${cashWeightPct.toFixed(1)}% cash into a new position. No existing position needs to be sold.`
                  : 'Enter a cash amount in the left column, then pick a stock to see how deploying it changes your sector weights.'
                : simIsTrim
                  ? simIsExit
                    ? `Simulating full exit from ${simTicker}. Proceeds redeployment will be suggested automatically.`
                    : `Simulating a trim — reducing ${simTicker} from ${fmt(simCurrentPct)}% to ${simAlloc}%.`
                  : 'Simulate adding a position and see its impact on your sector alignment.'}
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: '#8b93a8', marginBottom: 6 }}>
                {cashMode ? 'Stock to buy with cash' : simIsTrim ? 'Position to trim' : 'Candidate stock'}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <TickerSearchInput
                  value={simTicker}
                  onChange={handleSimTickerChange}
                  placeholder="Search ticker…"
                  style={{ width: 200 }}
                />
                {simLive.loading && <span style={{ fontSize: 11, color: '#8b93a8' }}>…</span>}
                {simLive.price != null && <span style={{ fontSize: 12, fontFamily: 'Space Mono, monospace', color: '#e2e6f0' }}>${simLive.price.toFixed(2)}</span>}
                {simTicker && !simLive.loading && simLive.error && <span style={{ fontSize: 11, color: '#ff4b6e' }}>Not found</span>}
              </div>
              {simTicker && simClassified && (
                <div style={{ marginTop: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: SECTOR_DISPLAY[simClassified.sector].color }} />
                    <span style={{ fontSize: 11, color: SECTOR_DISPLAY[simClassified.sector].color }}>{SECTOR_DISPLAY[simClassified.sector].label}</span>
                    {simClassified.sector === 'other' && !isInUniverse(simTicker) && <span style={{ fontSize: 10, color: '#8b93a8' }}>(unknown)</span>}
                  </div>
                  {simClassified.subSector && <div style={{ fontSize: 10, color: '#6b7190', paddingLeft: 11, marginTop: 2 }}>{SUBSECTOR_DISPLAY[simClassified.subSector]?.label}</div>}
                </div>
              )}
              {cashMode && cashAmount > 0 && simLive.price != null && cashSimShares != null && (
                <div style={{ marginTop: 8, padding: '8px 10px', background: '#00e67610', border: '1px solid #00e67630', borderRadius: 6 }}>
                  <span style={{ fontSize: 11, fontFamily: 'Space Mono, monospace', color: '#00e676' }}>
                    ~{cashSimShares} share{cashSimShares !== 1 ? 's' : ''}
                  </span>
                  {cashSimLeftover != null && cashSimLeftover > 0 && (
                    <span style={{ fontSize: 10, color: '#8b93a8', marginLeft: 8 }}>· ${cashSimLeftover.toFixed(2)} leftover</span>
                  )}
                  {cashSimLeftover === 0 && (
                    <span style={{ fontSize: 10, color: '#8b93a8', marginLeft: 8 }}>· uses cash fully</span>
                  )}
                  <span style={{ fontSize: 10, color: '#4a4e63', marginLeft: 8 }}>at ${simLive.price.toFixed(2)}/share</span>
                </div>
              )}
            </div>

            {!cashMode && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: '#8b93a8' }}>
                    {simIsHeld
                      ? <>Target allocation <span style={{ color: '#4a4e63' }}>(currently {fmt(simCurrentPct)}%)</span></>
                      : 'Target allocation'}
                  </span>
                  <span style={{ fontSize: 14, fontFamily: 'Space Mono, monospace', fontWeight: 500, color: simIsExit ? '#ff4b6e' : simIsTrim ? '#ffd166' : '#e2e6f0' }}>
                    {simIsExit ? 'EXIT' : `${simAlloc}%`}
                  </span>
                </div>
                <input
                  type="range" min={0} max={100} step={1} value={simAlloc}
                  onChange={e => { setSimAlloc(parseInt(e.target.value)); setTrimResult(null); setMemoResult(null); }}
                  style={{ width: '100%', accentColor: simIsExit ? '#ff4b6e' : simIsTrim ? '#ffd166' : '#e2e6f0' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#8b93a8', marginTop: 2 }}>
                  <span style={{ color: '#ff4b6e' }}>0% exit</span>
                  {simIsHeld && <span style={{ color: '#4a4e63' }}>▲ {fmt(simCurrentPct)}% now</span>}
                  <span>100%</span>
                </div>
              </div>
            )}

            {cashMode && cashAmount > 0 && totalValue > 0 && (
              <div style={{ marginBottom: 16, padding: '8px 12px', background: '#161922', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: '#8b93a8' }}>Effective weight after injection</span>
                <span style={{ fontSize: 14, fontFamily: 'Space Mono, monospace', fontWeight: 500, color: '#00e676' }}>
                  ≈ {cashWeightPct.toFixed(1)}%
                </span>
              </div>
            )}

            {simImpact && simTicker && (
              <>
                <div style={{ fontSize: 11, color: '#8b93a8', marginBottom: 8 }}>
                  {cashMode
                    ? <span>Sector impact <span style={{ color: '#00e676' }}>deploying cash → {simTicker}</span></span>
                    : simIsTrim
                      ? <span>Sector impact <span style={{ color: '#ffd166' }}>trimming {simIsExit ? 'full exit' : `→ ${simAlloc}%`}</span></span>
                      : <>Sector impact{hasTargets ? <span style={{ color: '#4a4e63', marginLeft: 6 }}>vs targets</span> : ''}</>
                  }
                </div>
                <div style={{ background: '#161922', borderRadius: 8, overflow: 'hidden', marginBottom: 14 }}>
                  {simImpact.map(row => {
                    const targetDelta = row.target != null ? row.after - row.target : null;
                    return (
                      <div key={row.sector} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid #1e2230', fontSize: 12 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: SECTOR_DISPLAY[row.sector].color }} />
                        <span style={{ flex: 1, color: '#e2e6f0' }}>{SECTOR_DISPLAY[row.sector].label}</span>
                        <span style={{ fontFamily: 'Space Mono, monospace', fontSize: 11, color: '#8b93a8' }}>{fmt(row.before)}% → {fmt(row.after)}%</span>
                        {targetDelta != null && (
                          <span style={{ fontFamily: 'Space Mono, monospace', fontSize: 10, color: Math.abs(targetDelta) < 1 ? '#00e676' : targetDelta > 0 ? '#ff4b6e' : '#ffd166', background: Math.abs(targetDelta) < 1 ? '#00e67618' : targetDelta > 0 ? '#ff4b6e18' : '#ffd16618', borderRadius: 3, padding: '1px 5px', whiteSpace: 'nowrap' }}>
                            {Math.abs(targetDelta) < 1 ? '✓' : `${targetDelta > 0 ? '+' : ''}${targetDelta.toFixed(1)}pp`}
                          </span>
                        )}
                        {renderDirectionArrow(row.direction, row.target != null)}
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            <div style={{ display: 'flex', gap: 8, flexDirection: 'column' }}>
              <button
                onClick={() => runTrimMemo(computed, sectorActuals)}
                disabled={memoLoading || trimLoading || !simTicker || (cashMode && cashAmount <= 0)}
                style={{
                  width: '100%',
                  background: memoLoading || trimLoading || !simTicker || (cashMode && cashAmount <= 0) ? '#161922' : cashMode ? '#00e676' : simIsTrim ? '#ffd166' : '#a259ff',
                  border: 'none', borderRadius: 8,
                  color: memoLoading || trimLoading || !simTicker || (cashMode && cashAmount <= 0) ? '#8b93a8' : cashMode ? '#08090d' : simIsTrim ? '#08090d' : '#fff',
                  fontSize: 12, fontWeight: 500, padding: '10px 0',
                  cursor: memoLoading || trimLoading || !simTicker || (cashMode && cashAmount <= 0) ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
              >
                {memoLoading
                  ? 'Writing memo…'
                  : cashMode
                    ? `✦ Deploy cash into ${simTicker || '…'} — get memo`
                    : simIsExit
                      ? '✦ Full exit — where should proceeds go?'
                      : simIsTrim
                        ? '✦ Trim memo — should I reduce?'
                        : '✦ Should I? — get memo'}
              </button>
              <button
                onClick={() => runTrimSuggestion(computed, sectorActuals)}
                disabled={trimLoading || memoLoading || !simTicker || (cashMode && cashAmount <= 0)}
                style={{
                  width: '100%', background: 'none',
                  border: '1px solid #1e2230', borderRadius: 8,
                  color: trimLoading || memoLoading || !simTicker || (cashMode && cashAmount <= 0) ? '#4a4e63' : '#8b93a8',
                  fontSize: 12, padding: '8px 0',
                  cursor: trimLoading || memoLoading || !simTicker || (cashMode && cashAmount <= 0) ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
              >
                {trimLoading ? 'Analyzing…' : cashMode ? 'Cash deployment plan' : simIsTrim ? 'Where should proceeds go?' : 'Quick trim suggestion'}
              </button>
            </div>
            {memoError && <div style={{ fontSize: 11, color: '#ff4b6e', marginTop: 8 }}>{memoError}</div>}
            {trimError && <div style={{ fontSize: 11, color: '#ff4b6e', marginTop: 8 }}>{trimError}</div>}
          </div>


          {memoResult && (
            <div style={{ borderLeft: '3px solid #a259ff', padding: '16px 18px', background: '#a259ff0d', marginTop: 12, borderRadius: '0 8px 8px 0' }}>
              <div style={{ fontSize: 10, fontWeight: 500, color: '#a259ff', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                {simIsTrim
                  ? simIsExit
                    ? `Exit memo — ${simTicker}`
                    : `Trim memo — ${simTicker} ${fmt(simCurrentPct)}% → ${simAlloc}%`
                  : cashMode
                    ? `Cash deploy — ${simTicker} (~${cashSimShares ?? '?'} shares)`
                    : `Should I? — ${simTicker} at ${simAlloc}%`}
                {accountType !== 'unspecified' && (
                  <span style={{ color: acctCfg.color, background: `${acctCfg.color}18`, border: `1px solid ${acctCfg.color}44`, borderRadius: 4, padding: '1px 6px', fontSize: 9, fontFamily: 'Space Mono, monospace' }}>{acctCfg.shortLabel}</span>
                )}
              </div>
              <MarkdownCard>{memoResult}</MarkdownCard>
              <button onClick={() => runTrimMemo(computed, sectorActuals)} disabled={memoLoading} style={{ marginTop: 10, background: 'none', border: '1px solid #1e2230', borderRadius: 6, color: '#8b93a8', fontSize: 11, padding: '4px 10px', cursor: 'pointer' }}>↺ Re-run</button>
            </div>
          )}

          {trimResult && (
            <div style={{ borderLeft: '3px solid #ffd166', padding: '16px 18px', background: '#ffd1660d', marginTop: 12, borderRadius: '0 8px 8px 0' }}>
              <div style={{ fontSize: 10, fontWeight: 500, color: '#ffd166', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                Trim Suggestion
                {accountType !== 'unspecified' && (
                  <span style={{ color: acctCfg.color, background: `${acctCfg.color}18`, border: `1px solid ${acctCfg.color}44`, borderRadius: 4, padding: '1px 6px', fontSize: 9, fontFamily: 'Space Mono, monospace' }}>{acctCfg.shortLabel}</span>
                )}
              </div>
              <MarkdownCard>{trimResult}</MarkdownCard>
              <button onClick={() => runTrimSuggestion(computed, sectorActuals)} disabled={trimLoading} style={{ marginTop: 10, background: 'none', border: '1px solid #1e2230', borderRadius: 6, color: '#8b93a8', fontSize: 11, padding: '4px 10px', cursor: 'pointer' }}>↺ Re-run</button>
            </div>
          )}

          {computed.length === 0 && (
            <div style={{ marginTop: 16, padding: '16px', background: '#0f1117', border: '1px solid #1e2230', borderRadius: 12, fontSize: 12, color: '#8b93a8', lineHeight: 1.5 }}>
              Add at least one position on the left to enable simulation and trim suggestion.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Scenario Panel ───────────────────────────────────────────────────────────

interface ScenarioPanelProps {
  sectorActuals: SectorActuals;
  sectorTargets: SectorTargets;
  projectedTargets: Record<string, number | null>;
  setProjectedTargets: React.Dispatch<React.SetStateAction<Record<string, number | null>>>;
  scenarioResult: string | null;
  scenarioLoading: boolean;
  scenarioError: string;
  total: number;
  totalOk: boolean;
  accountType: AccountType;
  acctCfg: { shortLabel: string; color: string };
  onRun: () => void;
  onClose: () => void;
}

const SECTOR_ORDER_LOCAL: TopLevelSector[] = [
  'information_technology', 'industrials', 'energy', 'communication_services',
  'financials', 'consumer_discretionary', 'consumer_staples', 'health_care',
  'materials', 'real_estate', 'utilities', 'diversified', 'other',
];

function ScenarioPanel({
  sectorActuals, sectorTargets, projectedTargets, setProjectedTargets,
  scenarioResult, scenarioLoading, scenarioError, total, totalOk,
  accountType, acctCfg, onRun, onClose
}: ScenarioPanelProps) {

  // Show all 12 GICS sectors so users can set targets for sectors they don't yet hold
  const activeSectors = SECTOR_ORDER_LOCAL.filter(s => s !== 'other');

  function updateTarget(sector: string, val: string) {
    const n = val === '' ? null : parseFloat(val);
    setProjectedTargets(prev => ({ ...prev, [sector]: isNaN(n as number) ? null : n }));
  }

  const totalColor = totalOk ? '#00e676' : Math.abs(total - 100) < 5 ? '#ffd166' : '#ff4b6e';

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(0,0,0,0.6)' }} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 50, width: 500, background: '#0f1117', borderLeft: '1px solid #1e2230', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #1e2230', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 500, color: '#e2e6f0', marginBottom: 4 }}>Scenario Analysis</div>
            <div style={{ fontSize: 12, color: '#8b93a8', lineHeight: 1.5 }}>
              Adjust your proposed sector weightings and get an AI analysis of how this shift would perform in the current macro environment.
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8b93a8', fontSize: 20, lineHeight: 1, padding: 4, marginLeft: 12 }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>

          {/* Sector weight editor */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px 70px 52px', gap: 0, marginBottom: 8 }}>
              <span style={{ fontSize: 10, color: '#8b93a8', fontFamily: 'Space Mono, monospace', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Sector</span>
              <span style={{ fontSize: 10, color: '#8b93a8', fontFamily: 'Space Mono, monospace', letterSpacing: '0.06em', textTransform: 'uppercase', textAlign: 'right' }}>Actual</span>
              <span style={{ fontSize: 10, color: '#8b93a8', fontFamily: 'Space Mono, monospace', letterSpacing: '0.06em', textTransform: 'uppercase', textAlign: 'right' }}>Current target</span>
              <span style={{ fontSize: 10, color: '#a259ff', fontFamily: 'Space Mono, monospace', letterSpacing: '0.06em', textTransform: 'uppercase', textAlign: 'right' }}>Proposed</span>
            </div>

            {activeSectors.map(sector => {
              const { color, label } = SECTOR_DISPLAY[sector];
              const actual = sectorActuals[sector] ?? 0;
              const currentTarget = sectorTargets[sector];
              const proposed = projectedTargets[sector];
              const delta = proposed != null ? proposed - actual : null;

              return (
                <div key={sector} style={{ display: 'grid', gridTemplateColumns: '1fr 70px 70px 52px', gap: 0, alignItems: 'center', padding: '7px 0', borderBottom: '1px solid #1e223088' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: '#c5cad8' }}>{label}</span>
                    {delta != null && Math.abs(delta) >= 1 && (
                      <span style={{ fontSize: 10, fontFamily: 'Space Mono, monospace', color: delta > 0 ? '#00e676' : '#ff4b6e' }}>
                        {delta > 0 ? '+' : ''}{delta.toFixed(0)}pp
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: 11, fontFamily: 'Space Mono, monospace', color: '#8b93a8', textAlign: 'right' }}>{actual.toFixed(1)}%</span>
                  <span style={{ fontSize: 11, fontFamily: 'Space Mono, monospace', color: currentTarget != null ? '#8b93a8' : '#4a4e63', textAlign: 'right' }}>
                    {currentTarget != null ? `${currentTarget}%` : '—'}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 2, justifyContent: 'flex-end' }}>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      value={proposed ?? ''}
                      placeholder="—"
                      onChange={e => updateTarget(sector, e.target.value)}
                      style={{
                        background: '#161922',
                        border: `1px solid ${proposed != null ? '#a259ff55' : '#1e2230'}`,
                        borderRadius: 5,
                        color: proposed != null ? '#a259ff' : '#8b93a8',
                        fontSize: 12,
                        fontFamily: 'Space Mono, monospace',
                        padding: '4px 6px',
                        width: 44,
                        textAlign: 'right',
                        outline: 'none',
                        MozAppearance: 'textfield',
                      } as React.CSSProperties}
                    />
                  </div>
                </div>
              );
            })}

            {/* Total row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0 4px', borderTop: '1px solid #1e2230', marginTop: 4 }}>
              <span style={{ fontSize: 11, color: '#8b93a8', fontFamily: 'Space Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total</span>
              <span style={{ fontSize: 13, fontFamily: 'Space Mono, monospace', color: totalColor, fontWeight: 600 }}>
                {(total ?? 0).toFixed(0)}% {totalOk ? '✓' : total < 100 ? `(${(100 - total).toFixed(0)}pp remaining)` : `(${(total - 100).toFixed(0)}pp over)`}
              </span>
            </div>
            {!totalOk && (
              <div style={{ fontSize: 11, color: '#ffd166', marginTop: 4, lineHeight: 1.5 }}>
                Proposed weights must sum to 100% to run the analysis.
              </div>
            )}
          </div>

          {/* Run button */}
          <button
            onClick={onRun}
            disabled={scenarioLoading || !totalOk}
            style={{
              width: '100%', background: scenarioLoading || !totalOk ? '#161922' : '#a259ff',
              border: 'none', borderRadius: 8,
              color: scenarioLoading || !totalOk ? '#8b93a8' : '#fff',
              fontSize: 12, fontWeight: 500, padding: '10px 0',
              cursor: scenarioLoading || !totalOk ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              marginBottom: 16,
            }}
          >
            {scenarioLoading ? 'Analyzing scenario…' : '✦ Analyze proposed weightings'}
          </button>

          {scenarioError && <div style={{ fontSize: 12, color: '#ff4b6e', marginBottom: 12 }}>{scenarioError}</div>}

          {/* Scenario result */}
          {scenarioResult && (
            <div style={{ borderLeft: '3px solid #a259ff', padding: '16px 18px', background: '#a259ff0d', borderRadius: '0 8px 8px 0' }}>
              <div style={{ fontSize: 10, fontWeight: 500, color: '#a259ff', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                Scenario Analysis
                {accountType !== 'unspecified' && (
                  <span style={{ color: acctCfg.color, background: `${acctCfg.color}18`, border: `1px solid ${acctCfg.color}44`, borderRadius: 4, padding: '1px 6px', fontSize: 9, fontFamily: 'Space Mono, monospace' }}>{acctCfg.shortLabel}</span>
                )}
              </div>
              <MarkdownCard>{scenarioResult}</MarkdownCard>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Sector Explore Panel ─────────────────────────────────────────────────────

interface SectorExplorePanelProps {
  sector: TopLevelSector;
  loading: boolean;
  error: string;
  suggestions: ExploreSuggestion[];
  sectorActuals: SectorActuals;
  sectorTargets: SectorTargets;
  onSimulate: (ticker: string) => void;
  onClose: () => void;
}

function SectorExplorePanel({ sector, loading, error, suggestions, sectorActuals, sectorTargets, onSimulate, onClose }: SectorExplorePanelProps) {
  const { label, color } = SECTOR_DISPLAY[sector];
  const actual = sectorActuals[sector] ?? 0;
  const target = sectorTargets[sector] ?? null;
  const gap = target != null ? target - actual : null;

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(0,0,0,0.55)' }} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 50, width: 420, background: '#0f1117', borderLeft: '1px solid #1e2230', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #1e2230', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
              <div style={{ fontSize: 15, fontWeight: 500, color }}>{label}</div>
            </div>
            {gap != null && gap > 0 ? (
              <div style={{ fontSize: 12, color: '#8b93a8' }}>
                You're <span style={{ color: '#00e676' }}>{gap.toFixed(1)}pp underweight</span> vs your {target}% target.
                Here are stocks that could close the gap.
              </div>
            ) : (
              <div style={{ fontSize: 12, color: '#8b93a8' }}>
                Exploring {label} stocks that could fit your portfolio.
              </div>
            )}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8b93a8', fontSize: 20, lineHeight: 1, padding: 4, marginLeft: 12 }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
          {loading && (
            <div style={{ padding: '40px 0', textAlign: 'center', color: '#8b93a8', fontSize: 13 }}>
              Finding {label} opportunities…
            </div>
          )}
          {error && <div style={{ fontSize: 12, color: '#ff4b6e', padding: '16px 0' }}>{error}</div>}
          {!loading && !error && suggestions.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {suggestions.map((s, i) => (
                <div key={i} style={{ background: '#161922', border: '1px solid #1e2230', borderRadius: 10, padding: '14px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontFamily: 'Space Mono, monospace', fontSize: 13, fontWeight: 600, color, background: `${color}22`, padding: '2px 8px', borderRadius: 4 }}>{s.ticker}</span>
                      {s.marketCapRange && <span style={{ fontSize: 10, color: '#8b93a8', fontFamily: 'Space Mono, monospace' }}>{s.marketCapRange}</span>}
                    </div>
                    <button
                      onClick={() => onSimulate(s.ticker)}
                      style={{ fontSize: 11, color: '#e2e6f0', background: '#1e2230', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', whiteSpace: 'nowrap' }}
                    >
                      Simulate →
                    </button>
                  </div>
                  <p style={{ fontSize: 12, color: '#8b93a8', lineHeight: 1.55, margin: 0 }}>{s.rationale}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ padding: '12px 24px', borderTop: '1px solid #1e2230' }}>
          <div style={{ fontSize: 11, color: '#4a4e63', lineHeight: 1.5 }}>
            Click "Simulate →" on any stock to pre-fill the Add Simulation panel and see how it would affect your sector weights.
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Account Type Panel ───────────────────────────────────────────────────────

interface AccountTypePanelProps {
  value: AccountType;
  onChange: (t: AccountType) => void;
  onClose: () => void;
}

function AccountTypePanel({ value, onChange, onClose }: AccountTypePanelProps) {
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(0,0,0,0.55)' }} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 50, width: 400, background: '#0f1117', borderLeft: '1px solid #1e2230', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #1e2230', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 500, color: '#e2e6f0', marginBottom: 4 }}>Account type</div>
            <div style={{ fontSize: 12, color: '#8b93a8', lineHeight: 1.5 }}>Tells Claude what tax rules and trading constraints apply so analysis is accurate for your situation.</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8b93a8', fontSize: 20, lineHeight: 1, padding: 4, marginLeft: 12 }}>×</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {(Object.keys(ACCOUNT_TYPES) as AccountType[]).map(key => {
            const cfg = ACCOUNT_TYPES[key];
            const isSelected = value === key;
            return (
              <button key={key} onClick={() => { onChange(key); onClose(); }} style={{ width: '100%', textAlign: 'left', background: isSelected ? `${cfg.color}12` : 'none', border: 'none', borderBottom: '1px solid #1e2230', borderLeft: isSelected ? `3px solid ${cfg.color}` : '3px solid transparent', cursor: 'pointer', padding: '14px 24px', transition: 'background 0.1s' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: cfg.constraints.length > 0 ? 8 : 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: isSelected ? cfg.color : '#e2e6f0' }}>{cfg.label}</span>
                  {isSelected && <span style={{ fontSize: 10, color: cfg.color, fontFamily: 'Space Mono, monospace' }}>✓ selected</span>}
                </div>
                {cfg.constraints.length > 0 && (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {cfg.constraints.map(c => (
                      <span key={c} style={{ fontSize: 10, color: isSelected ? cfg.color : '#8b93a8', border: `1px solid ${isSelected ? cfg.color + '44' : '#1e2230'}`, borderRadius: 4, padding: '2px 6px', background: isSelected ? `${cfg.color}0d` : '#161922', whiteSpace: 'nowrap' }}>{c}</span>
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>
        <div style={{ padding: '14px 24px', borderTop: '1px solid #1e2230' }}>
          <div style={{ fontSize: 11, color: '#8b93a8', lineHeight: 1.6 }}>Account context is passed to Claude with every macro risk and trim suggestion call. It is not stored anywhere outside your browser session.</div>
        </div>
      </div>
    </>
  );
}

// ─── PreferencesPanel ───────────────────────────────────────────────────────

interface PreferencesPanelProps {
  value: InvestorPreferences;
  onChange: (p: InvestorPreferences) => void;
  onClose: () => void;
}

function PreferencesPanel({ value, onChange, onClose }: PreferencesPanelProps) {
  const [draft, setDraft] = useState<InvestorPreferences>(value);

  function patch(p: Partial<InvestorPreferences>) {
    setDraft(prev => ({ ...prev, ...p }));
  }

  function toggleExclusion(flag: ExclusionFlag) {
    setDraft(prev => ({
      ...prev,
      exclusions: prev.exclusions.includes(flag)
        ? prev.exclusions.filter(f => f !== flag)
        : [...prev.exclusions, flag],
    }));
  }

  function save() {
    onChange(draft);
    onClose();
  }

  const segButtonStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    background: active ? '#a259ff18' : 'none',
    border: `1px solid ${active ? '#a259ff' : '#1e2230'}`,
    borderRadius: 6,
    color: active ? '#a259ff' : '#8b93a8',
    fontSize: 12,
    padding: '8px 6px',
    cursor: 'pointer',
    textAlign: 'center',
  });

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(0,0,0,0.55)' }} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 50, width: 420, background: '#0f1117', borderLeft: '1px solid #1e2230', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #1e2230', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 500, color: '#e2e6f0', marginBottom: 4 }}>Investor preferences</div>
            <div style={{ fontSize: 12, color: '#8b93a8', lineHeight: 1.5 }}>Shapes what Claude recommends — not just how it's phrased. Applies to macro risk, trim/add memos, sector explore, and cash deployment.</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8b93a8', fontSize: 20, lineHeight: 1, padding: 4, marginLeft: 12 }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 22 }}>

          {/* Risk tolerance */}
          <div>
            <div style={{ fontSize: 12, color: '#e2e6f0', marginBottom: 8 }}>Risk tolerance</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {(Object.keys(RISK_LABELS) as RiskTolerance[]).map(key => (
                <button key={key} onClick={() => patch({ riskTolerance: key })} style={segButtonStyle(draft.riskTolerance === key)}>
                  <div>{RISK_LABELS[key].label}</div>
                </button>
              ))}
            </div>
            <div style={{ fontSize: 10, color: '#6b7190', marginTop: 6 }}>{RISK_LABELS[draft.riskTolerance].desc}</div>
          </div>

          {/* Time horizon */}
          <div>
            <div style={{ fontSize: 12, color: '#e2e6f0', marginBottom: 8 }}>Time horizon</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {(Object.keys(HORIZON_LABELS) as TimeHorizon[]).map(key => (
                <button key={key} onClick={() => patch({ timeHorizon: key })} style={segButtonStyle(draft.timeHorizon === key)}>
                  <div>{HORIZON_LABELS[key].label}</div>
                </button>
              ))}
            </div>
            <div style={{ fontSize: 10, color: '#6b7190', marginTop: 6 }}>{HORIZON_LABELS[draft.timeHorizon].desc}</div>
          </div>

          {/* Income vs growth */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: '#e2e6f0' }}>Income ↔ Growth</span>
              <span style={{ fontSize: 11, color: '#a259ff', fontFamily: 'Space Mono, monospace' }}>{draft.incomeGrowthTilt}%</span>
            </div>
            <input
              type="range" min={0} max={100} step={5}
              value={draft.incomeGrowthTilt}
              onChange={e => patch({ incomeGrowthTilt: Number(e.target.value) })}
              style={{ width: '100%', accentColor: '#a259ff' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#6b7190', marginTop: 4 }}>
              <span>Income</span><span>Growth</span>
            </div>
          </div>

          {/* Diversification preference */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: '#e2e6f0' }}>Stock picking ↔ Funds</span>
              <span style={{ fontSize: 11, color: '#a259ff', fontFamily: 'Space Mono, monospace' }}>{draft.diversificationPreference}%</span>
            </div>
            <input
              type="range" min={0} max={100} step={5}
              value={draft.diversificationPreference}
              onChange={e => patch({ diversificationPreference: Number(e.target.value) })}
              style={{ width: '100%', accentColor: '#a259ff' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#6b7190', marginTop: 4 }}>
              <span>Individual stocks</span><span>Prefer funds</span>
            </div>
          </div>

          {/* Max position size */}
          <div>
            <div style={{ fontSize: 12, color: '#e2e6f0', marginBottom: 8 }}>Max single-position size</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {MAX_POSITION_OPTIONS.map(pct => (
                <button key={pct} onClick={() => patch({ maxPositionSizePct: pct })} style={segButtonStyle(draft.maxPositionSizePct === pct)}>
                  {pct}%
                </button>
              ))}
            </div>
          </div>

          {/* New money cadence */}
          <div>
            <div style={{ fontSize: 12, color: '#e2e6f0', marginBottom: 8 }}>New money</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => patch({ newMoneyCadence: 'lump_sum' })} style={segButtonStyle(draft.newMoneyCadence === 'lump_sum')}>Lump sum</button>
              <button onClick={() => patch({ newMoneyCadence: 'dca' })} style={segButtonStyle(draft.newMoneyCadence === 'dca')}>Dollar-cost avg</button>
            </div>
          </div>

          {/* Exclusions */}
          <div>
            <div style={{ fontSize: 12, color: '#e2e6f0', marginBottom: 4 }}>Exclusions</div>
            <div style={{ fontSize: 10, color: '#6b7190', marginBottom: 8 }}>Best-effort — Claude is instructed to avoid these, not code-filtered yet.</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {(Object.keys(EXCLUSION_LABELS) as ExclusionFlag[]).map(flag => {
                const active = draft.exclusions.includes(flag);
                return (
                  <button
                    key={flag}
                    onClick={() => toggleExclusion(flag)}
                    style={{ background: active ? '#ff4b6e18' : 'none', border: `1px solid ${active ? '#ff4b6e' : '#1e2230'}`, borderRadius: 6, color: active ? '#ff4b6e' : '#8b93a8', fontSize: 11, padding: '6px 10px', cursor: 'pointer' }}
                  >
                    {active ? '✕ ' : ''}{EXCLUSION_LABELS[flag]}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div style={{ padding: '14px 24px', borderTop: '1px solid #1e2230', display: 'flex', gap: 10 }}>
          <button onClick={() => { setDraft(DEFAULT_PREFERENCES); }} style={{ background: 'none', border: '1px solid #1e2230', borderRadius: 6, color: '#8b93a8', fontSize: 12, padding: '8px 14px', cursor: 'pointer' }}>Reset</button>
          <button onClick={save} style={{ flex: 1, background: '#a259ff', border: 'none', borderRadius: 6, color: '#08090d', fontSize: 12, fontWeight: 600, padding: '8px 14px', cursor: 'pointer' }}>Save preferences</button>
        </div>
      </div>
    </>
  );
}

// Suppress unused warning
void mdProseStyle;