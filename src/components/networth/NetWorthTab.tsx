import { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useNetWorthSync, type NetWorthAccount } from '../../hooks/useNetWorthSync';
import { useCryptoPrices, type CryptoPrice } from '../../hooks/useCryptoPrices';
import { usePortfolioSync } from '../../hooks/usePortfolioSync';
import { useFinancialProfile, type FinancialProfile } from '../../hooks/useFinancialProfile';
import { readSessionPositions, type PortfolioPosition } from '../compare/PortfolioTab';
import { classifyTicker } from '../../config/gics';
import AddAccountPanel from './AddAccountPanel';
import { KIND_DISPLAY } from './kindDisplay';

// ─── Formatting helpers ─────────────────────────────────────────────────────────

function fmtUSD(n: number): string {
  const abs = '$' + Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
  return n < 0 ? `−${abs}` : abs;
}

function fmtUpdated(iso: string | null): string {
  if (!iso) return '—';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return '1d ago';
  return `${days}d ago`;
}

// Per-unit crypto price — shows enough precision for low-priced coins (e.g. DOGE)
// without a wall of decimals on high-priced ones.
function fmtUnitPrice(n: number): string {
  const maxFrac = n >= 1 ? 2 : 6;
  return '$' + n.toLocaleString('en-US', { maximumFractionDigits: maxFrac });
}

function fmtQuantity(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 8 });
}

// A crypto account is live-priced only when both symbol and quantity are set.
function isLivePricedCrypto(a: NetWorthAccount): boolean {
  return a.kind === 'crypto' && !!a.cryptoSymbol && a.cryptoQuantity != null;
}

// Live value for a crypto account: quantity × live price when both the
// symbol/quantity are set AND a price has loaded; otherwise fall back to the
// stored manual balance (covers pre-migration manual crypto rows and the
// transient state before the price loads). Never returns NaN.
function cryptoValue(
  account: NetWorthAccount,
  prices: Record<string, CryptoPrice | undefined>,
): number {
  if (isLivePricedCrypto(account)) {
    const p = prices[account.cryptoSymbol!.toUpperCase()];
    if (p && p.price > 0) return account.cryptoQuantity! * p.price;
  }
  return account.balance ?? 0;
}

// ─── Credit card due-date helpers ───────────────────────────────────────────────
// All urgency is computed at render from today's date — never stored.

const RED   = '#ff4b6e';
const AMBER = '#ffd166';
const CYAN  = '#00c8ff';
const MUTED_ACCENT = 'var(--border-strong)';

// Whole days from today (local midnight) to a 'YYYY-MM-DD' due date.
// Negative = overdue.
function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dateStr.slice(0, 10) + 'T00:00:00');
  return Math.round((due.getTime() - today.getTime()) / 86_400_000);
}

function dueDaysLabel(days: number): string {
  if (days < 0) return `${-days}d overdue`;
  if (days === 0) return 'due today';
  return `in ${days}d`;
}

function dueDaysColor(days: number): string {
  if (days <= 5) return RED;
  if (days <= 14) return AMBER;
  return 'var(--text-secondary)';
}

function fmtDueShort(dateStr: string): string {
  return new Date(dateStr.slice(0, 10) + 'T00:00:00')
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtDateWithYear(dateStr: string): string {
  return new Date(dateStr.slice(0, 10) + 'T00:00:00')
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Linked Portfolio value ─────────────────────────────────────────────────────
// The holdings_link row's displayed value is always derived live: positions come
// from Supabase (authenticated, via usePortfolioSync) or the anonymous session
// cache, and prices from one batched /api/prices call — the same source
// PortfolioTab uses for its own total. Returns null while loading or when no
// price could be resolved, so the row degrades to "—" instead of breaking.

function useLinkedPortfolioValue(): {
  value: number | null;
  loading: boolean;
  hasPositions: boolean;
  // Top sector concentrations (% of portfolio value) — lightweight context for
  // the AI analysis call, not a full position list.
  sectorWeights: { sector: string; pct: number }[];
} {
  const { savedPositions, loading: syncLoading, isAuthenticated } = usePortfolioSync();
  const [value, setValue]     = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [positions, setPositions] = useState<PortfolioPosition[]>([]);
  const [sectorWeights, setSectorWeights] = useState<{ sector: string; pct: number }[]>([]);

  useEffect(() => {
    if (syncLoading) return;
    setPositions(isAuthenticated ? (savedPositions ?? []) : readSessionPositions());
  }, [syncLoading, isAuthenticated, savedPositions]);

  useEffect(() => {
    if (syncLoading) return;

    if (positions.length === 0) {
      setValue(0);
      setSectorWeights([]);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchTotal() {
      setLoading(true);
      try {
        const tickers = [...new Set(positions.map(p => p.ticker.toUpperCase()))];
        const res = await fetch(`/api/prices?tickers=${encodeURIComponent(tickers.join(','))}`);
        if (!res.ok) throw new Error('price fetch failed');
        const data = await res.json();
        if (cancelled) return;

        const priceMap = new Map<string, number>();
        if (Array.isArray(data)) {
          for (const d of data) {
            // fetchError entries come back with price: 0 — a valid-looking number
            // that must be treated as "not found", same guard as PortfolioTab
            if (!d.fetchError && d.price != null) priceMap.set(d.ticker, d.price);
          }
        }

        let total = 0;
        let anyPriced = false;
        const sectorTotals = new Map<string, number>();
        for (const p of positions) {
          const price = priceMap.get(p.ticker.toUpperCase());
          if (price != null) {
            const v = price * p.shares;
            total += v;
            anyPriced = true;
            const { sector } = classifyTicker(p.ticker);
            sectorTotals.set(sector, (sectorTotals.get(sector) ?? 0) + v);
          }
        }
        setValue(anyPriced ? total : null);
        setSectorWeights(
          anyPriced && total > 0
            ? [...sectorTotals.entries()]
                .map(([sector, v]) => ({ sector, pct: (v / total) * 100 }))
                .sort((a, b) => b.pct - a.pct)
                .slice(0, 4)
            : []
        );
      } catch {
        if (!cancelled) setValue(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchTotal();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncLoading, positions]);

  return {
    value,
    loading,
    hasPositions: positions.length > 0,
    sectorWeights,
  };
}

// ─── Inline balance editor ──────────────────────────────────────────────────────

function BalanceCell({ account, onCommit, color = 'var(--text-primary)' }: {
  account: NetWorthAccount;
  onCommit: (v: number) => void;
  color?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState('');

  function startEdit() {
    setDraft(String(account.balance ?? 0));
    setEditing(true);
  }

  function commit() {
    const n = parseFloat(draft);
    if (!isNaN(n) && n >= 0 && n !== account.balance) onCommit(n);
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        type="number"
        min={0}
        step="any"
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') setEditing(false);
        }}
        style={{
          width: 110,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-strong)',
          borderRadius: 6,
          color: 'var(--text-primary)',
          fontSize: 13,
          fontFamily: 'Space Mono, monospace',
          padding: '4px 8px',
          textAlign: 'right',
          outline: 'none',
          MozAppearance: 'textfield' as any,
        }}
      />
    );
  }

  return (
    <span
      onClick={startEdit}
      title="Click to edit"
      style={{
        fontSize: 14,
        fontFamily: 'Space Mono, monospace',
        color,
        cursor: 'pointer',
        borderBottom: '1px dashed var(--border-strong)',
      }}
    >
      {fmtUSD(account.balance ?? 0)}
    </span>
  );
}

// ─── Live-priced crypto value cell ──────────────────────────────────────────────
// Read-only computed value (quantity × live price) on top, with a small context
// line showing the holding. Clicking the value edits the QUANTITY (symbol edits
// aren't offered in v1 — remove and re-add to switch coins). Mirrors BalanceCell's
// click-to-edit pattern but commits via updateCryptoHolding.

function CryptoValueCell({ account, price, loading, onCommitQuantity }: {
  account: NetWorthAccount;
  price: number | undefined;
  loading: boolean;
  onCommitQuantity: (qty: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState('');

  const qty      = account.cryptoQuantity ?? 0;
  const symbol   = account.cryptoSymbol ?? '';
  const hasLive  = price != null && price > 0;
  const value    = hasLive ? qty * price! : (account.balance ?? 0);

  function startEdit() {
    setDraft(String(qty));
    setEditing(true);
  }

  function commit() {
    const n = parseFloat(draft);
    if (!isNaN(n) && n >= 0 && n !== qty) onCommitQuantity(n);
    setEditing(false);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
      {editing ? (
        <input
          type="number"
          min={0}
          step="any"
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') setEditing(false);
          }}
          style={{
            width: 110,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-strong)',
            borderRadius: 6,
            color: 'var(--text-primary)',
            fontSize: 13,
            fontFamily: 'Space Mono, monospace',
            padding: '4px 8px',
            textAlign: 'right',
            outline: 'none',
            MozAppearance: 'textfield' as any,
          }}
        />
      ) : (
        <span
          onClick={startEdit}
          title="Click to edit quantity"
          style={{
            fontSize: 14,
            fontFamily: 'Space Mono, monospace',
            color: 'var(--text-primary)',
            cursor: 'pointer',
            borderBottom: '1px dashed var(--border-strong)',
          }}
        >
          {hasLive ? fmtUSD(value) : (loading ? '…' : fmtUSD(value))}
        </span>
      )}
      <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'Space Mono, monospace' }}>
        {hasLive
          ? `${fmtQuantity(qty)} ${symbol} @ ${fmtUnitPrice(price!)}`
          : `${fmtQuantity(qty)} ${symbol} · ${loading ? 'pricing…' : 'price unavailable'}`}
      </span>
    </div>
  );
}

// ─── Small inline editors for credit-card fields ────────────────────────────────
// Same click-to-edit pattern as BalanceCell, scaled down for the detail row.
// Empty input commits null (clears the field) — optional fields stay optional.

function MiniNumberCell({ label, value, prefix = '', suffix = '', onCommit }: {
  label: string;
  value: number | null;
  prefix?: string;
  suffix?: string;
  onCommit: (v: number | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState('');

  function startEdit() {
    setDraft(value == null ? '' : String(value));
    setEditing(true);
  }

  function commit() {
    const t = draft.trim();
    if (t === '') {
      if (value != null) onCommit(null);
    } else {
      const n = parseFloat(t);
      if (!isNaN(n) && n >= 0 && n !== value) onCommit(n);
    }
    setEditing(false);
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5 }}>
      <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'Space Mono, monospace', letterSpacing: '0.07em' }}>
        {label}
      </span>
      {editing ? (
        <input
          type="number"
          min={0}
          step="any"
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') setEditing(false);
          }}
          style={{
            width: 68,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-strong)',
            borderRadius: 4,
            color: 'var(--text-primary)',
            fontSize: 11,
            fontFamily: 'Space Mono, monospace',
            padding: '2px 6px',
            textAlign: 'right',
            outline: 'none',
            MozAppearance: 'textfield' as any,
          }}
        />
      ) : (
        <span
          onClick={startEdit}
          title="Click to edit"
          style={{
            fontSize: 11,
            fontFamily: 'Space Mono, monospace',
            color: value == null ? 'var(--text-muted)' : 'var(--text-secondary)',
            cursor: 'pointer',
            borderBottom: '1px dashed var(--border-strong)',
          }}
        >
          {value == null
            ? 'set'
            : `${prefix}${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}${suffix}`}
        </span>
      )}
    </span>
  );
}

function MiniDateCell({ label, value, hint, valueColor, withYear, onCommit }: {
  label: string;
  value: string | null;
  hint?: string;
  valueColor?: string;
  withYear?: boolean;   // goal-type dates can be years out — show the year
  onCommit: (v: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState('');

  function startEdit() {
    setDraft(value ?? '');
    setEditing(true);
  }

  function commit() {
    const next = draft.trim() === '' ? null : draft;
    if (next !== value) onCommit(next);
    setEditing(false);
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5 }}>
      <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'Space Mono, monospace', letterSpacing: '0.07em' }}>
        {label}
      </span>
      {editing ? (
        <input
          type="date"
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') setEditing(false);
          }}
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-strong)',
            borderRadius: 4,
            color: 'var(--text-primary)',
            fontSize: 11,
            fontFamily: 'Space Mono, monospace',
            padding: '2px 6px',
            outline: 'none',
            colorScheme: 'dark',
          }}
        />
      ) : (
        <span
          onClick={startEdit}
          title="Click to edit"
          style={{
            fontSize: 11,
            fontFamily: 'Space Mono, monospace',
            color: value == null ? 'var(--text-muted)' : (valueColor ?? 'var(--text-secondary)'),
            cursor: 'pointer',
            borderBottom: '1px dashed var(--border-strong)',
          }}
        >
          {value == null ? 'set' : `${withYear ? fmtDateWithYear(value) : fmtDueShort(value)}${hint ? ` · ${hint}` : ''}`}
        </span>
      )}
    </span>
  );
}

// Free-text variant of MiniNumberCell — same click-to-edit pattern.
// Empty input commits null (clears the field).
function MiniTextCell({ label, value, placeholder, onCommit }: {
  label: string;
  value: string | null;
  placeholder?: string;
  onCommit: (v: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState('');

  function startEdit() {
    setDraft(value ?? '');
    setEditing(true);
  }

  function commit() {
    const next = draft.trim() === '' ? null : draft.trim();
    if (next !== value) onCommit(next);
    setEditing(false);
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5 }}>
      <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'Space Mono, monospace', letterSpacing: '0.07em' }}>
        {label}
      </span>
      {editing ? (
        <input
          type="text"
          autoFocus
          value={draft}
          placeholder={placeholder}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') setEditing(false);
          }}
          style={{
            width: 140,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-strong)',
            borderRadius: 4,
            color: 'var(--text-primary)',
            fontSize: 11,
            fontFamily: 'DM Sans, sans-serif',
            padding: '2px 6px',
            outline: 'none',
          }}
        />
      ) : (
        <span
          onClick={startEdit}
          title="Click to edit"
          style={{
            fontSize: 11,
            fontFamily: 'DM Sans, sans-serif',
            color: value == null ? 'var(--text-muted)' : 'var(--text-secondary)',
            cursor: 'pointer',
            borderBottom: '1px dashed var(--border-strong)',
          }}
        >
          {value == null ? 'set' : value}
        </span>
      )}
    </span>
  );
}

// ─── Markdown renderer for AI output ────────────────────────────────────────────
// Mirrors MarkdownCard in src/components/compare/PortfolioTab.tsx, which is a
// non-exported local there (and that file is off-limits to this change).
// Keep the two visually in sync if either is restyled.

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
            color: 'var(--text-secondary)',
            marginTop: 14,
            marginBottom: 6,
            paddingTop: 10,
            borderTop: '1px solid var(--border)',
          }}>{children}</div>
        ),
        p: ({ children }) => (
          <p style={{ margin: '0 0 8px 0', fontSize: 13, lineHeight: 1.7, color: 'var(--text-body)' }}>{children}</p>
        ),
        strong: ({ children }) => (
          <strong style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{children}</strong>
        ),
        ul: ({ children }) => (
          <ul style={{ margin: '0 0 8px 0', paddingLeft: 0, listStyle: 'none' }}>{children}</ul>
        ),
        li: ({ children }) => (
          <li style={{ fontSize: 13, color: 'var(--text-body)', lineHeight: 1.65, marginBottom: 4, paddingLeft: 12, position: 'relative' }}>
            <span style={{ position: 'absolute', left: 0, color: 'var(--text-secondary)' }}>—</span>
            {children}
          </li>
        ),
        table: ({ children }) => (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 8 }}>{children}</table>
        ),
        thead: ({ children }) => <thead>{children}</thead>,
        tbody: ({ children }) => <tbody>{children}</tbody>,
        tr: ({ children }) => (
          <tr style={{ borderBottom: '1px solid var(--border)' }}>{children}</tr>
        ),
        th: ({ children }) => (
          <th style={{ textAlign: 'left', padding: '4px 8px 4px 0', fontSize: 10, color: 'var(--text-secondary)', fontFamily: 'Space Mono, monospace', fontWeight: 400, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{children}</th>
        ),
        td: ({ children }) => (
          <td style={{ padding: '5px 8px 5px 0', fontSize: 12, color: 'var(--text-body)', fontFamily: 'Space Mono, monospace' }}>{children}</td>
        ),
        hr: () => <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '10px 0' }} />,
        code: ({ children }) => (
          <code style={{ fontFamily: 'Space Mono, monospace', fontSize: 11, color: 'var(--text-primary)', background: 'var(--bg-elevated)', padding: '1px 4px', borderRadius: 3 }}>{children}</code>
        ),
      }}
    >
      {children}
    </ReactMarkdown>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────────

export default function NetWorthTab() {
  const {
    accounts, loading, isAuthenticated, syncError,
    addAccount, updateAccountBalance, updateCreditCard, updateCryptoHolding, removeAccount,
  } = useNetWorthSync();

  const linked = useLinkedPortfolioValue();
  const [addOpen, setAddOpen] = useState(false);

  // ── Live crypto pricing — symbols from live-priced crypto accounts only ────
  const cryptoSymbols = (accounts ?? [])
    .filter(isLivePricedCrypto)
    .map(a => a.cryptoSymbol!);
  const { prices: cryptoPrices, loading: cryptoLoading } = useCryptoPrices(cryptoSymbols);

  // ── Financial profile (optional — unlocks Tier 2 analysis) ─────────────────
  const {
    profile, hasProfile, updateProfile,
    syncError: profileSyncError,
  } = useFinancialProfile();

  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  // Tier 2 needs actual figures to compute with — a goal label alone isn't enough.
  // The server re-derives this itself from the payload; this only drives UI labels.
  const tier2Available = profile != null &&
    (profile.monthlyIncome != null || profile.monthlySavingsTarget != null);

  const profileFieldsSet = profile == null ? 0 : [
    profile.monthlyIncome,
    profile.monthlySavingsTarget,
    profile.goalLabel,
    profile.goalTargetDate,
    profile.goalTargetAmount,
  ].filter(v => v != null && v !== '').length;

  // ── AI analysis — in-memory cache only; balances change too often for a
  //    persisted analysis to stay meaningful ─────────────────────────────────
  const [analysis, setAnalysis]               = useState<string | null>(null);
  const [analysisRanTier2, setAnalysisRanTier2] = useState(false);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError]     = useState('');

  // Cash no longer syncs into Net Worth from the Portfolio tab's "Cash
  // available" figure — that synthetic, read-only row was removed July 22,
  // 2026. It caused the most recently-set Portfolio cash value to persist
  // into Net Worth even when it no longer reflected reality. If a user has
  // cash sitting in an account (e.g. a Roth IRA), they add it manually here
  // via "+ Add account" instead. `accounts` (from useNetWorthSync) is the
  // full list actually rendered now — no synthetic rows are injected.

  // ── Totals — null/undefined balances count as 0, never crash ──────────────
  // Net worth = assets − credit card balances. Card balances stay stored as
  // positive amounts owed; the subtraction happens only here, at render.
  const { total, assetTotal, liabilityTotal, assetSegments, liabilitySegments } = useMemo(() => {
    const accs = accounts ?? [];
    const segs = accs.map(a => ({
      account: a,
      value: a.kind === 'holdings_link' ? (linked.value ?? 0)
           : a.kind === 'crypto'        ? cryptoValue(a, cryptoPrices)
           : (a.balance ?? 0),
    }));
    const assets = segs.filter(x => x.account.kind !== 'credit_card');
    const debts  = segs.filter(x => x.account.kind === 'credit_card');
    const assetTotal     = assets.reduce((s, x) => s + x.value, 0);
    const liabilityTotal = debts.reduce((s, x) => s + x.value, 0);
    return {
      total: assetTotal - liabilityTotal,
      assetTotal,
      liabilityTotal,
      assetSegments:     assets.filter(x => x.value > 0),
      liabilitySegments: debts.filter(x => x.value > 0),
    };
  }, [accounts, linked.value, cryptoPrices]);

  // ── 30-day cash flow — cards with a balance owed and a due date set ────────
  // A card with no due date simply doesn't appear here; a paid-off card has
  // no payment coming, so it's excluded too.
  const cashFlow = useMemo(() => {
    const items = (accounts ?? [])
      .filter(a => a.kind === 'credit_card' && (a.balance ?? 0) > 0 && a.dueDate != null)
      .map(a => ({ account: a, days: daysUntil(a.dueDate!) }))
      .filter(x => x.days <= 30)
      .sort((a, b) => a.days - b.days);

    const dueSoon = items.filter(x => x.days <= 5);
    return {
      items,
      // Cards without a min payment are listed but excluded from the sum
      minDueSoonSum:  dueSoon.reduce((s, x) => s + (x.account.minPayment ?? 0), 0),
      maxDueSoonDays: dueSoon.reduce((m, x) => Math.max(m, x.days), 0),
    };
  }, [accounts]);

  const manualAccounts = (accounts ?? []).filter(a => a.kind !== 'holdings_link');

  // ── Run AI analysis ────────────────────────────────────────────────────────
  // Deliberately sends real dollar figures — this tab is admin-only and the
  // Portfolio-tab percentages-only privacy rule does NOT apply here (and must
  // not be carried back there). See the privacy note in api/portfolio.ts.
  async function runAnalysis() {
    setAnalysisLoading(true);
    setAnalysisError('');
    try {
      const tier2 = tier2Available;

      const accountPayload = (accounts ?? [])
        // Skip the linked row when its live value is unavailable or empty —
        // a $0 "portfolio" line would just mislead the model
        .filter(a => a.kind !== 'holdings_link' || (linked.value != null && linked.value > 0))
        .map(a => ({
          kind: a.kind,
          label: a.label,
          balance: a.kind === 'holdings_link' ? (linked.value ?? 0)
                 : a.kind === 'crypto'        ? cryptoValue(a, cryptoPrices)
                 : (a.balance ?? 0),
          ...(a.kind === 'credit_card' ? {
            apr:              a.apr ?? null,
            dueDate:          a.dueDate ?? null,
            minPayment:       a.minPayment ?? null,
            statementBalance: a.statementBalance ?? null,
          } : {}),
          // Live-priced crypto: pass the holding so the prompt can name it
          // (e.g. "0.5 BTC-USD") rather than only a dollar figure.
          ...(isLivePricedCrypto(a) ? {
            cryptoSymbol:   a.cryptoSymbol,
            cryptoQuantity: a.cryptoQuantity,
          } : {}),
        }));

      const res = await fetch('/api/portfolio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'networth_analysis',
          accounts: accountPayload,
          ...(linked.sectorWeights.length > 0 ? {
            portfolioContext: {
              topSectorWeights: linked.sectorWeights.map(s => ({
                sector: s.sector,
                pct: parseFloat(s.pct.toFixed(1)),
              })),
            },
          } : {}),
          ...(hasProfile && profile ? { financialProfile: profile satisfies FinancialProfile } : {}),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'API error');
      }
      const { result } = await res.json();
      setAnalysis(result);
      setAnalysisRanTier2(tier2);
    } catch (e: unknown) {
      setAnalysisError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setAnalysisLoading(false);
    }
  }

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading || accounts === null) {
    return (
      <div style={{
        minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--text-muted)', fontFamily: "'Space Mono', monospace", fontSize: 12, letterSpacing: '0.08em',
      }}>
        LOADING…
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '28px 8px 48px', fontFamily: 'DM Sans, sans-serif' }}>
      {/* ── Sync error banner ─────────────────────────────────────────────── */}
      {syncError && (
        <div style={{
          background: '#ff4b6e14', border: '1px solid #ff4b6e40', borderRadius: 8,
          padding: '10px 14px', marginBottom: 16, color: '#ff4b6e', fontSize: 12, lineHeight: 1.5,
        }}>
          ⚠ Sync issue: {syncError}
        </div>
      )}
      {profileSyncError && (
        <div style={{
          background: '#ff4b6e14', border: '1px solid #ff4b6e40', borderRadius: 8,
          padding: '10px 14px', marginBottom: 16, color: '#ff4b6e', fontSize: 12, lineHeight: 1.5,
        }}>
          ⚠ Sync issue: {profileSyncError}
        </div>
      )}

      {/* ── Anonymous notice ──────────────────────────────────────────────── */}
      {!isAuthenticated && (
        <div style={{
          background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8,
          padding: '10px 14px', marginBottom: 16, color: 'var(--text-secondary)', fontSize: 12, lineHeight: 1.5,
        }}>
          You're not signed in — balances you enter here are held in memory only and
          will be lost when you close this tab.
        </div>
      )}

      {/* ── Total ─────────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{
          fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em',
          fontFamily: 'Space Mono, monospace', marginBottom: 8,
        }}>
          Total net worth
        </div>
        <div style={{ fontSize: 40, fontWeight: 700, fontFamily: 'Space Mono, monospace', color: total < 0 ? RED : 'var(--text-primary)', lineHeight: 1.1 }}>
          {fmtUSD(total)}
        </div>
        {liabilityTotal > 0 && (
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'Space Mono, monospace', marginTop: 6 }}>
            {fmtUSD(assetTotal)} assets − {fmtUSD(liabilityTotal)} liabilities
          </div>
        )}
        {linked.value === null && linked.hasPositions && (
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6 }}>
            Portfolio holdings value unavailable (price fetch failed) — excluded from total.
          </div>
        )}
      </div>

      {/* ── Composition bars — assets on top, liabilities (credit cards) below ── */}
      {(assetSegments.length > 0 || liabilitySegments.length > 0) && (
        <div style={{ marginBottom: 28 }}>
          {assetSegments.length > 0 && (
            <div style={{ display: 'flex', height: 14, borderRadius: 7, overflow: 'hidden', border: '1px solid var(--border)' }}>
              {assetSegments.map(({ account, value }) => (
                <div
                  key={account.id}
                  title={`${account.label} — ${fmtUSD(value)} (${((value / assetTotal) * 100).toFixed(1)}%)`}
                  style={{
                    width: `${(value / assetTotal) * 100}%`,
                    background: KIND_DISPLAY[account.kind].color,
                    opacity: 0.85,
                  }}
                />
              ))}
            </div>
          )}

          {/* Liabilities bar — width shows debt magnitude relative to assets */}
          {liabilitySegments.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
              <div style={{
                display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden',
                border: `1px solid ${RED}40`,
                width: `${assetTotal > 0 ? Math.min((liabilityTotal / assetTotal) * 100, 100) : 100}%`,
                minWidth: 24,
              }}>
                {liabilitySegments.map(({ account, value }, i) => (
                  <div
                    key={account.id}
                    title={`${account.label} — ${fmtUSD(value)} owed`}
                    style={{
                      width: `${(value / liabilityTotal) * 100}%`,
                      background: RED,
                      opacity: 0.8,
                      borderLeft: i > 0 ? '1px solid var(--bg-base)' : 'none',
                    }}
                  />
                ))}
              </div>
              <span style={{ fontSize: 11, color: RED, fontFamily: 'Space Mono, monospace', flexShrink: 0 }}>
                −{fmtUSD(liabilityTotal)} debt
              </span>
            </div>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', marginTop: 10 }}>
            {assetSegments.map(({ account, value }) => (
              <span key={account.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-secondary)' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: KIND_DISPLAY[account.kind].color, display: 'inline-block' }} />
                {account.label}
                <span style={{ fontFamily: 'Space Mono, monospace' }}>{((value / assetTotal) * 100).toFixed(1)}%</span>
              </span>
            ))}
            {liabilitySegments.map(({ account, value }) => (
              <span key={account.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-secondary)' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: RED, display: 'inline-block' }} />
                {account.label}
                <span style={{ fontFamily: 'Space Mono, monospace', color: RED }}>−{fmtUSD(value)}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Accounts list ─────────────────────────────────────────────────── */}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px', borderBottom: '1px solid var(--border)',
        }}>
          <span style={{
            fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em',
            fontFamily: 'Space Mono, monospace',
          }}>
            Accounts
          </span>
          <button
            onClick={() => setAddOpen(true)}
            style={{
              background: 'none', border: '1px solid var(--border)', borderRadius: 6,
              color: 'var(--text-primary)', fontSize: 12, padding: '5px 12px', cursor: 'pointer',
              fontFamily: 'DM Sans, sans-serif',
            }}
          >
            + Add account
          </button>
        </div>

        {(accounts ?? []).map(account => {
          const isLinked   = account.kind === 'holdings_link';
          const isReadOnly = isLinked;   // synthetic, non-editable row
          const isCard   = account.kind === 'credit_card';
          const isCrypto = isLivePricedCrypto(account);   // live-priced only; manual crypto uses BalanceCell
          const { label: kindLabel, color } = KIND_DISPLAY[account.kind];

          // Urgency accent — computed at render, only when there's a balance owed.
          // A paid-off card (balance 0) displays with the muted accent regardless
          // of due date; a card with no due date never registers as due.
          const dueDays = isCard && account.dueDate != null ? daysUntil(account.dueDate) : null;
          const hasDebt = isCard && (account.balance ?? 0) > 0;
          const accent = !isCard ? null
            : hasDebt && dueDays != null && dueDays <= 5  ? RED
            : hasDebt && dueDays != null && dueDays <= 14 ? AMBER
            : MUTED_ACCENT;

          return (
            <div
              key={account.id}
              style={{
                borderBottom: '1px solid var(--border)',
                // inset shadow instead of border-left so non-card rows keep
                // their exact layout — no 3px content shift
                ...(accent ? { boxShadow: `inset 3px 0 0 ${accent}` } : {}),
              }}
            >
              <div style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: isCard ? '12px 18px 6px' : '12px 18px',
              }}>
                {/* Kind badge */}
                <span style={{
                  fontSize: 9, fontFamily: 'Space Mono, monospace', letterSpacing: '0.08em',
                  color, background: `${color}14`, border: `1px solid ${color}40`,
                  borderRadius: 4, padding: '3px 7px', flexShrink: 0, width: 86, textAlign: 'center',
                  boxSizing: 'border-box', whiteSpace: 'nowrap',
                }}>
                  {kindLabel}
                </span>

                {/* Label */}
                <span
                  style={{ flex: 1, fontSize: 13, color: 'var(--text-primary)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {account.label}
                  {isLinked && (
                    <Link
                      to="/portfolio"
                      style={{ marginLeft: 10, fontSize: 11, color: '#00c8ff', textDecoration: 'none' }}
                    >
                      view portfolio →
                    </Link>
                  )}
                </span>

                {/* Value */}
                {isLinked ? (
                  <span style={{ fontSize: 14, fontFamily: 'Space Mono, monospace', color: linked.value == null && linked.hasPositions ? 'var(--text-secondary)' : 'var(--text-primary)' }}>
                    {linked.loading ? '…' : linked.value != null ? fmtUSD(linked.value) : '—'}
                  </span>
                ) : isCrypto ? (
                  <CryptoValueCell
                    account={account}
                    price={cryptoPrices[account.cryptoSymbol!.toUpperCase()]?.price}
                    loading={cryptoLoading}
                    onCommitQuantity={qty => updateCryptoHolding(account.id, account.cryptoSymbol!, qty)}
                  />
                ) : (
                  <BalanceCell
                    account={account}
                    color={hasDebt ? RED : undefined}
                    onCommit={v => isCard ? updateCreditCard(account.id, { balance: v }) : updateAccountBalance(account.id, v)}
                  />
                )}

                {/* Updated */}
                <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'Space Mono, monospace', width: 82, textAlign: 'right', flexShrink: 0 }}>
                  {isReadOnly ? 'auto-synced' : fmtUpdated(account.balanceUpdatedAt)}
                </span>

                {/* Remove */}
                {isReadOnly ? (
                  <span style={{ width: 22, flexShrink: 0 }} />
                ) : (
                  <button
                    onClick={() => removeAccount(account.id)}
                    title="Remove account"
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--text-muted)', fontSize: 15, lineHeight: 1, padding: 4, width: 22, flexShrink: 0,
                    }}
                  >
                    ×
                  </button>
                )}
              </div>

              {/* Credit card detail row — each field independently editable */}
              {isCard && (
                <div style={{
                  display: 'flex', alignItems: 'baseline', gap: 20, flexWrap: 'wrap',
                  padding: '0 18px 10px 118px',
                }}>
                  <MiniNumberCell
                    label="APR"
                    value={account.apr ?? null}
                    suffix="%"
                    onCommit={v => updateCreditCard(account.id, { apr: v })}
                  />
                  <MiniDateCell
                    label="DUE"
                    value={account.dueDate ?? null}
                    hint={dueDays != null ? dueDaysLabel(dueDays) : undefined}
                    valueColor={hasDebt && dueDays != null ? dueDaysColor(dueDays) : undefined}
                    onCommit={v => updateCreditCard(account.id, { dueDate: v })}
                  />
                  <MiniNumberCell
                    label="MIN PAY"
                    value={account.minPayment ?? null}
                    prefix="$"
                    onCommit={v => updateCreditCard(account.id, { minPayment: v })}
                  />
                  <MiniNumberCell
                    label="STMT"
                    value={account.statementBalance ?? null}
                    prefix="$"
                    onCommit={v => updateCreditCard(account.id, { statementBalance: v })}
                  />
                </div>
              )}
            </div>
          );
        })}

        {/* Empty state — only the auto-created linked row exists */}
        {manualAccounts.length === 0 && (
          <div style={{ padding: '22px 18px', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Your portfolio is linked automatically. Add your other accounts — cash,
            401k or other balances, crypto, credit cards — to see your full net worth
            in one place.
          </div>
        )}
      </div>

      {/* ── 30-day cash flow — upcoming credit card due dates ─────────────── */}
      {cashFlow.items.length > 0 && (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginTop: 16 }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
            <span style={{
              fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em',
              fontFamily: 'Space Mono, monospace',
            }}>
              30-day cash flow
            </span>
          </div>

          {cashFlow.minDueSoonSum > 0 && (
            <div style={{
              padding: '10px 18px', borderBottom: '1px solid var(--border)',
              background: `${RED}0d`, color: RED, fontSize: 12,
            }}>
              ⚠ <span style={{ fontFamily: 'Space Mono, monospace' }}>{fmtUSD(cashFlow.minDueSoonSum)}</span>
              {' '}in minimum payments due within {cashFlow.maxDueSoonDays}d
            </div>
          )}

          {cashFlow.items.map(({ account, days }) => (
            <div
              key={account.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '10px 18px', borderBottom: '1px solid var(--border)',
              }}
            >
              <span style={{ flex: 1, fontSize: 13, color: 'var(--text-primary)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {account.label}
              </span>
              <span style={{ fontSize: 12, fontFamily: 'Space Mono, monospace', color: RED }}>
                {fmtUSD(account.balance ?? 0)}
              </span>
              {account.minPayment != null && (
                <span style={{ fontSize: 11, fontFamily: 'Space Mono, monospace', color: 'var(--text-secondary)' }}>
                  min {fmtUSD(account.minPayment)}
                </span>
              )}
              <span style={{
                fontSize: 11, fontFamily: 'Space Mono, monospace',
                color: dueDaysColor(days), width: 92, textAlign: 'right', flexShrink: 0,
              }}>
                {dueDaysLabel(days)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── Financial profile (optional) — unlocks Tier 2 analysis ────────── */}
      <div
        ref={profileRef}
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginTop: 16 }}
      >
        <button
          onClick={() => setProfileOpen(o => !o)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
            padding: '14px 18px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
          }}
        >
          <span style={{
            fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em',
            fontFamily: 'Space Mono, monospace',
          }}>
            Financial profile <span style={{ color: 'var(--text-muted)', textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            {profileFieldsSet > 0 && (
              <span style={{
                fontSize: 9, fontFamily: 'Space Mono, monospace', color: CYAN,
                background: `${CYAN}14`, border: `1px solid ${CYAN}40`, borderRadius: 4, padding: '2px 7px',
              }}>
                {profileFieldsSet}/5 SET
              </span>
            )}
            <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{profileOpen ? '▾' : '▸'}</span>
          </span>
        </button>

        {profileOpen && (
          <div style={{ padding: '4px 18px 16px', borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, margin: '12px 0 14px' }}>
              Adding your income and savings target unlocks a deeper planning analysis —
              payoff timelines, savings rate, runway.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <MiniNumberCell
                label="MONTHLY INCOME"
                value={profile?.monthlyIncome ?? null}
                prefix="$"
                onCommit={v => updateProfile({ monthlyIncome: v })}
              />
              <MiniNumberCell
                label="MONTHLY SAVINGS TARGET"
                value={profile?.monthlySavingsTarget ?? null}
                prefix="$"
                onCommit={v => updateProfile({ monthlySavingsTarget: v })}
              />
              <MiniTextCell
                label="GOAL (OPTIONAL)"
                value={profile?.goalLabel ?? null}
                placeholder="e.g. Retire at 55"
                onCommit={v => updateProfile({ goalLabel: v })}
              />
              <MiniDateCell
                label="TARGET DATE (OPTIONAL)"
                value={profile?.goalTargetDate ?? null}
                withYear
                onCommit={v => updateProfile({ goalTargetDate: v })}
              />
              <MiniNumberCell
                label="TARGET AMOUNT (OPTIONAL)"
                value={profile?.goalTargetAmount ?? null}
                prefix="$"
                onCommit={v => updateProfile({ goalTargetAmount: v })}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── AI analysis card — needs at least one manual account ──────────── */}
      {manualAccounts.length > 0 && (
        <div style={{ marginTop: 16 }}>
          {!analysis && !analysisLoading && (
            <button
              onClick={runAnalysis}
              style={{
                background: 'none', border: '1px solid var(--border)', borderRadius: 8,
                color: 'var(--text-primary)', fontSize: 12, padding: '8px 16px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'DM Sans, sans-serif',
              }}
            >
              ✦ Run {tier2Available ? 'financial plan' : 'balance sheet'} analysis
            </button>
          )}
          {analysisLoading && (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '12px 0' }}>Analyzing balance sheet…</div>
          )}
          {analysisError && (
            <div style={{ fontSize: 12, color: RED, padding: '8px 0' }}>{analysisError}</div>
          )}
          {analysis && (
            <>
              <div style={{
                borderLeft: `3px solid ${CYAN}`, padding: '16px 18px', background: `${CYAN}0d`,
                marginBottom: 8, borderRadius: '0 8px 8px 0',
              }}>
                <div style={{
                  fontSize: 10, fontWeight: 500, color: CYAN, letterSpacing: '0.08em',
                  textTransform: 'uppercase', marginBottom: 12,
                  display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                }}>
                  {analysisRanTier2 ? 'Financial Plan' : 'Balance Sheet Analysis'}
                  {!analysisRanTier2 && !tier2Available && (
                    <button
                      onClick={() => {
                        setProfileOpen(true);
                        profileRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }}
                      style={{
                        background: 'none', border: `1px solid ${CYAN}33`, borderRadius: 4,
                        color: CYAN, fontSize: 9, padding: '2px 7px', cursor: 'pointer',
                        fontFamily: 'Space Mono, monospace', textTransform: 'none', letterSpacing: 0,
                      }}
                    >
                      Add income info above for a deeper plan →
                    </button>
                  )}
                </div>
                <MarkdownCard>{analysis}</MarkdownCard>
              </div>
              <button
                onClick={runAnalysis}
                disabled={analysisLoading}
                style={{
                  background: 'none', border: '1px solid var(--border)', borderRadius: 6,
                  color: 'var(--text-secondary)', fontSize: 11, padding: '4px 10px', cursor: 'pointer',
                }}
              >
                ↺ Re-run
              </button>
            </>
          )}
        </div>
      )}

      <AddAccountPanel
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdd={addAccount}
      />
    </div>
  );
}