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
  syncLoading:         boolean;
  isAuthenticated:     boolean;
  onSavePositions:     (positions: PortfolioPosition[]) => Promise<void>;
  onSavePreferences:   (accountType: AccountType, sectorTargets: SectorTargets) => Promise<void>;
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

// ─── Constants ────────────────────────────────────────────────────────────────

const SECTOR_ORDER: TopLevelSector[] = [
  'information_technology', 'industrials', 'energy', 'communication_services',
  'financials', 'consumer_discretionary', 'consumer_staples', 'health_care',
  'materials', 'real_estate', 'utilities', 'other',
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, syncedPositions, syncedAccountType, syncedSectorTargets]);

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

  // ─── Persist preferences (account type + sector targets) ─────────────────
  useEffect(() => {
    if (!syncSeeded.current && isAuthenticated) return;
    if (isAuthenticated) {
      onSavePreferences(accountType, sectorTargets);
    } else {
      if (positions.length === 0 && Object.keys(sectorTargets).length === 0) return;
      saveSession({ positions, liveData, sectorTargets, accountType, savedAt: Date.now() });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountType, sectorTargets]);

  // ─── Price fetching ───────────────────────────────────────────────────────

  const fetchPrice = useCallback(async (ticker: string): Promise<{ price: number | null; yahooSector?: string; yahooIndustry?: string }> => {
    try {
      const res = await fetch(`/api/prices?tickers=${encodeURIComponent(ticker)}`);
      if (!res.ok) return { price: null };
      const data = await res.json();
      const entry = Array.isArray(data) ? data.find((d: { ticker: string }) => d.ticker === ticker) : null;
      return {
        price: entry?.price ?? null,
        yahooSector: entry?.yahooSector,
        yahooIndustry: entry?.yahooIndustry,
      };
    } catch { return { price: null }; }
  }, []);

  async function fetchLiveForPosition(id: string, ticker: string) {
    setLiveData(prev => ({ ...prev, [id]: { price: null, loading: true, error: false } }));
    const result = await fetchPrice(ticker);
    setLiveData(prev => ({ ...prev, [id]: { price: result.price, loading: false, error: result.price == null, yahooSector: result.yahooSector, yahooIndustry: result.yahooIndustry } }));
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
      // For external tickers, prefer Yahoo Finance sector classification
      let { sector, subSector } = classifyTicker(p.ticker);
      if (sector === 'other' && live?.yahooSector) {
        sector = yahooSectorToGics(live.yahooSector);
      }
      return { ...p, sector, subSector, inUniverse: isInUniverse(p.ticker), livePrice, currentValue, unrealizedGainPct, portfolioWeightPct: 0, liveLoading: live?.loading ?? false, liveError: live?.error ?? false };
    });
    const totalValue = raw.reduce((s, p) => s + (p.currentValue ?? 0), 0);
    return raw.map(p => ({ ...p, portfolioWeightPct: totalValue > 0 && p.currentValue != null ? (p.currentValue / totalValue) * 100 : 0 }));
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
      const res = await fetch('/api/portfolio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'macro_risk',
          positions: computed.map(p => ({
            ticker: p.ticker, sector: p.sector, subSector: p.subSector ?? undefined,
            weightPct: parseFloat(p.portfolioWeightPct.toFixed(1)),
            gainPct: parseFloat((p.unrealizedGainPct ?? 0).toFixed(1)),
            inUniverse: p.inUniverse,
          })),
          accountType,
          accountContext: ACCOUNT_TYPES[accountType].taxTreatment,
          sectorTargets: hasTargets ? sectorTargets : undefined,
          sectorActuals: hasTargets ? sectorActuals : undefined,
          subSectorActuals: Object.keys(subSectorActuals).length > 0 ? subSectorActuals : undefined,
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
    // Snap slider to current weight if ticker is already held
    const existingPos = computed.find(p => p.ticker === ticker);
    if (existingPos) {
      setSimAlloc(Math.round(existingPos.portfolioWeightPct));
    } else {
      setSimAlloc(8);
    }
    simFetchRef.current = setTimeout(async () => {
      setSimLive({ price: null, loading: true, error: false });
      const result = await fetchPrice(ticker);
      setSimLive({ price: result.price, loading: false, error: result.price == null, yahooSector: result.yahooSector, yahooIndustry: result.yahooIndustry });
    }, 600);
  }

  function getSimSectorImpact(sectorActuals: SectorActuals) {
    if (!simTicker) return null;
    const _simBase = classifyTicker(simTicker);
    const simSector: TopLevelSector = _simBase.sector === 'other' && simLive.yahooSector
      ? yahooSectorToGics(simLive.yahooSector)
      : _simBase.sector;

    const existingPos = computed.find(p => p.ticker === simTicker);
    const currentPct = existingPos ? existingPos.portfolioWeightPct : 0;
    const newTargetPct = simAlloc;

    const newActuals: SectorActuals = {};

    if (existingPos) {
      // Adjusting an existing position: remove current weight, rescale remainder, add at new target
      const remainingBase = 100 - currentPct;
      const scaleFactor = remainingBase > 0 ? (100 - newTargetPct) / remainingBase : 0;
      for (const sector of SECTOR_ORDER) {
        const existing = sectorActuals[sector] ?? 0;
        if (sector === simSector) {
          // Remove the position's contribution from its sector, rescale, then add new target
          const sectorWithoutPos = existing - currentPct;
          newActuals[sector] = sectorWithoutPos * scaleFactor + newTargetPct;
        } else {
          newActuals[sector] = existing * scaleFactor;
        }
      }
    } else {
      // New position: scale everything down and inject at target
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
      const _trimBase = classifyTicker(simTicker);
      const candidateSector: TopLevelSector = _trimBase.sector === 'other' && simLive.yahooSector
        ? yahooSectorToGics(simLive.yahooSector)
        : _trimBase.sector;
      const candidateSubSector = _trimBase.subSector;
      const existingPos = computed.find(p => p.ticker === simTicker);
      const currentWeightPct = existingPos ? parseFloat(existingPos.portfolioWeightPct.toFixed(1)) : undefined;
      const isTrimMode = existingPos != null && simAlloc < existingPos.portfolioWeightPct;
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
            targetWeightPct: simAlloc,
            currentWeightPct,
            isTrimMode,
            inUniverse: isInUniverse(simTicker),
          },
          accountType,
          accountContext: ACCOUNT_TYPES[accountType].taxTreatment,
          sectorTargets: hasTargets ? sectorTargets : undefined,
          sectorActuals: hasTargets ? sectorActuals : undefined,
        }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error ?? 'API error'); }
      const { result } = await res.json();
      setTrimResult(result);
      // Auto-trigger sector explore when trimming to 0% (full exit) or reducing significantly
      if (isTrimMode && simAlloc === 0 && hasTargets) {
        const freedSector = candidateSector;
        // Find the most underweight sector to explore for redeployment
        const bestExplore = SECTOR_ORDER.find(s => {
          const target = sectorTargets[s];
          const actual = sectorActuals[s] ?? 0;
          return target != null && actual < target - 2 && s !== freedSector;
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
      const _trimBase = classifyTicker(simTicker);
      const candidateSector: TopLevelSector = _trimBase.sector === 'other' && simLive.yahooSector
        ? yahooSectorToGics(simLive.yahooSector)
        : _trimBase.sector;
      const candidateSubSector = _trimBase.subSector;
      const existingPos = computed.find(p => p.ticker === simTicker);
      const currentWeightPct = existingPos ? parseFloat(existingPos.portfolioWeightPct.toFixed(1)) : undefined;
      const isTrimMode = existingPos != null && simAlloc < existingPos.portfolioWeightPct;
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
            targetWeightPct: simAlloc,
            currentWeightPct,
            isTrimMode,
            inUniverse: isInUniverse(simTicker),
            keyMetrics: getKeyMetrics(simTicker),
          },
          accountType,
          accountContext: ACCOUNT_TYPES[accountType].taxTreatment,
          sectorTargets: hasTargets ? sectorTargets : undefined,
          sectorActuals: hasTargets ? sectorActuals : undefined,
        }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error ?? 'API error'); }
      const { result } = await res.json();
      setMemoResult(result);
      // Auto-trigger sector explore for trim mode with targets set — show where to redeploy
      if (isTrimMode && hasTargets) {
        const freedSector = candidateSector;
        const bestExplore = SECTOR_ORDER.find(s => {
          const target = sectorTargets[s];
          const actual = sectorActuals[s] ?? 0;
          return target != null && actual < target - 2 && s !== freedSector;
        });
        if (bestExplore) {
          runSectorExplore(bestExplore, computed);
        }
      }
    } catch (e: unknown) {
      setMemoError(e instanceof Error ? e.message : 'Unknown error');
    } finally { setMemoLoading(false); }
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
  const totalValue = computed.reduce((s, p) => s + (p.currentValue ?? 0), 0);
  const hasPrices = computed.some(p => p.livePrice != null);
  const activeSectors = SECTOR_ORDER.filter(s => (sectorActuals[s] ?? 0) > 0.05);
  const maxActual = Math.max(...activeSectors.map(s => sectorActuals[s] ?? 0), 1);
  const simClassifiedBase = simTicker ? classifyTicker(simTicker) : null;
  const simClassified = simClassifiedBase
    ? {
        sector: simClassifiedBase.sector === 'other' && simLive.yahooSector
          ? yahooSectorToGics(simLive.yahooSector)
          : simClassifiedBase.sector,
        subSector: simClassifiedBase.subSector,
      }
    : null;
  const acctCfg = ACCOUNT_TYPES[accountType];

  // Sim mode detection — auto-detected from slider vs current weight
  const simExistingPos = simTicker ? computed.find(p => p.ticker === simTicker) : null;
  const simCurrentPct = simExistingPos ? simExistingPos.portfolioWeightPct : 0;
  const simIsHeld = simExistingPos != null;
  const simIsTrim = simIsHeld && simAlloc < simCurrentPct;
  const simIsExit = simIsHeld && simAlloc === 0;
  const simIsAdd = !simIsHeld || simAlloc > simCurrentPct;

  const underweightSectors = SECTOR_ORDER.filter(s => {
    const target = sectorTargets[s];
    const actual = sectorActuals[s] ?? 0;
    return target != null && actual < target - 2;
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
            <span style={{ fontSize: 11, color: '#8b93a8', fontFamily: 'Space Mono, monospace' }}>
              {positions.length} position{positions.length !== 1 ? 's' : ''}
              {hasPrices && totalValue > 0 && (
                <> · ${totalValue >= 1_000_000 ? `${(totalValue / 1_000_000).toFixed(2)}M` : totalValue >= 1_000 ? `${(totalValue / 1_000).toFixed(1)}K` : totalValue.toFixed(0)} total</>
              )}
            </span>
          </div>

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
                  ✦ Run macro risk analysis
                </button>
              )}
              {macroLoading && <div style={{ fontSize: 12, color: '#8b93a8', padding: '12px 0' }}>Analyzing portfolio…</div>}
              {macroError && <div style={{ fontSize: 12, color: '#ff4b6e', padding: '8px 0' }}>{macroError}</div>}
              {macroRisk && (
                <>
                  <div style={{ borderLeft: '3px solid #ff4b6e', padding: '16px 18px', background: '#ff4b6e0d', marginBottom: 8, borderRadius: '0 8px 8px 0' }}>
                    <div style={{ fontSize: 10, fontWeight: 500, color: '#ff4b6e', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                      Macro Risk
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
          <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8b93a8', marginBottom: 12 }}>
            {simIsTrim ? 'Trim simulation' : simIsAdd && simIsHeld ? 'Add simulation' : 'Add simulation'}
          </div>
          <div style={{ background: '#0f1117', border: '1px solid #1e2230', borderRadius: 12, padding: '16px' }}>
            <div style={{ fontSize: 12, color: '#8b93a8', marginBottom: 14, lineHeight: 1.5 }}>
              {simIsTrim
                ? simIsExit
                  ? `Simulating full exit from ${simTicker}. Proceeds redeployment will be suggested automatically.`
                  : `Simulating a trim — reducing ${simTicker} from ${fmt(simCurrentPct)}% to ${simAlloc}%.`
                : 'Simulate adding a position and see its impact on your sector alignment.'}
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: '#8b93a8', marginBottom: 6 }}>
                {simIsTrim ? 'Position to trim' : 'Candidate stock'}
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
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: '#8b93a8' }}>
                  {simIsHeld
                    ? <>Target allocation <span style={{ color: '#4a4e63' }}>(currently {fmt(simCurrentPct)}%)</span></>
                    : 'Target allocation'}
                </span>
                <span style={{
                  fontSize: 14, fontFamily: 'Space Mono, monospace', fontWeight: 500,
                  color: simIsExit ? '#ff4b6e' : simIsTrim ? '#ffd166' : '#e2e6f0',
                }}>
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

            {simImpact && simTicker && (
              <>
                <div style={{ fontSize: 11, color: '#8b93a8', marginBottom: 8 }}>
                  {simIsTrim
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
                          <span style={{
                            fontFamily: 'Space Mono, monospace', fontSize: 10,
                            color: Math.abs(targetDelta) < 1 ? '#00e676' : targetDelta > 0 ? '#ff4b6e' : '#ffd166',
                            background: Math.abs(targetDelta) < 1 ? '#00e67618' : targetDelta > 0 ? '#ff4b6e18' : '#ffd16618',
                            borderRadius: 3, padding: '1px 5px', whiteSpace: 'nowrap',
                          }}>
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
                disabled={memoLoading || trimLoading || !simTicker}
                style={{
                  width: '100%',
                  background: memoLoading || trimLoading || !simTicker ? '#161922'
                    : simIsTrim ? '#ffd166' : '#a259ff',
                  border: 'none', borderRadius: 8,
                  color: memoLoading || trimLoading || !simTicker ? '#8b93a8'
                    : simIsTrim ? '#08090d' : '#fff',
                  fontSize: 12, fontWeight: 500, padding: '10px 0',
                  cursor: memoLoading || trimLoading || !simTicker ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
              >
                {memoLoading
                  ? 'Writing memo…'
                  : simIsExit
                    ? '✦ Full exit — where should proceeds go?'
                    : simIsTrim
                      ? '✦ Trim memo — should I reduce?'
                      : '✦ Should I? — get memo'}
              </button>
              <button
                onClick={() => runTrimSuggestion(computed, sectorActuals)}
                disabled={trimLoading || memoLoading || !simTicker}
                style={{
                  width: '100%',
                  background: 'none',
                  border: '1px solid #1e2230', borderRadius: 8,
                  color: trimLoading || memoLoading || !simTicker ? '#4a4e63' : '#8b93a8',
                  fontSize: 12, padding: '8px 0',
                  cursor: trimLoading || memoLoading || !simTicker ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
              >
                {trimLoading
                  ? 'Analyzing…'
                  : simIsTrim
                    ? 'Where should proceeds go?'
                    : 'Quick trim suggestion'}
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
  'materials', 'real_estate', 'utilities', 'other',
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

// Suppress unused warning
void mdProseStyle;