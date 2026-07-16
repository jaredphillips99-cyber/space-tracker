import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useNetWorthSync, type NetWorthAccount } from '../../hooks/useNetWorthSync';
import { usePortfolioSync } from '../../hooks/usePortfolioSync';
import { readSessionPositions, type PortfolioPosition } from '../compare/PortfolioTab';
import AddAccountPanel from './AddAccountPanel';
import { KIND_DISPLAY } from './kindDisplay';

// ─── Formatting helpers ─────────────────────────────────────────────────────────

function fmtUSD(n: number): string {
  return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function fmtUpdated(iso: string | null): string {
  if (!iso) return '—';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return '1d ago';
  return `${days}d ago`;
}

// ─── Linked Portfolio value ─────────────────────────────────────────────────────
// The holdings_link row's displayed value is always derived live: positions come
// from Supabase (authenticated, via usePortfolioSync) or the anonymous session
// cache, and prices from one batched /api/prices call — the same source
// PortfolioTab uses for its own total. Returns null while loading or when no
// price could be resolved, so the row degrades to "—" instead of breaking.

function useLinkedPortfolioValue(): { value: number | null; loading: boolean; hasPositions: boolean } {
  const { savedPositions, loading: syncLoading, isAuthenticated } = usePortfolioSync();
  const [value, setValue]     = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [positions, setPositions] = useState<PortfolioPosition[]>([]);

  useEffect(() => {
    if (syncLoading) return;
    setPositions(isAuthenticated ? (savedPositions ?? []) : readSessionPositions());
  }, [syncLoading, isAuthenticated, savedPositions]);

  useEffect(() => {
    if (syncLoading) return;

    if (positions.length === 0) {
      setValue(0);
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
        for (const p of positions) {
          const price = priceMap.get(p.ticker.toUpperCase());
          if (price != null) {
            total += price * p.shares;
            anyPriced = true;
          }
        }
        setValue(anyPriced ? total : null);
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

  return { value, loading, hasPositions: positions.length > 0 };
}

// ─── Inline balance editor ──────────────────────────────────────────────────────

function BalanceCell({ account, onCommit }: { account: NetWorthAccount; onCommit: (v: number) => void }) {
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
          background: '#161922',
          border: '1px solid #2e3548',
          borderRadius: 6,
          color: '#e2e6f0',
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
        color: '#e2e6f0',
        cursor: 'pointer',
        borderBottom: '1px dashed #2e3548',
      }}
    >
      {fmtUSD(account.balance ?? 0)}
    </span>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────────

export default function NetWorthTab() {
  const {
    accounts, loading, isAuthenticated, syncError,
    addAccount, updateAccountBalance, removeAccount,
  } = useNetWorthSync();

  const linked = useLinkedPortfolioValue();
  const [addOpen, setAddOpen] = useState(false);

  // ── Totals — null/undefined balances count as 0, never crash ──────────────
  const { total, segments } = useMemo(() => {
    const accs = accounts ?? [];
    const segs = accs.map(a => ({
      account: a,
      value: a.kind === 'holdings_link' ? (linked.value ?? 0) : (a.balance ?? 0),
    }));
    return {
      total: segs.reduce((s, x) => s + x.value, 0),
      segments: segs.filter(x => x.value > 0),
    };
  }, [accounts, linked.value]);

  const manualAccounts = (accounts ?? []).filter(a => a.kind !== 'holdings_link');

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading || accounts === null) {
    return (
      <div style={{
        minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#4a4f63', fontFamily: "'Space Mono', monospace", fontSize: 12, letterSpacing: '0.08em',
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

      {/* ── Anonymous notice ──────────────────────────────────────────────── */}
      {!isAuthenticated && (
        <div style={{
          background: '#161922', border: '1px solid #1e2230', borderRadius: 8,
          padding: '10px 14px', marginBottom: 16, color: '#8b93a8', fontSize: 12, lineHeight: 1.5,
        }}>
          You're not signed in — balances you enter here are held in memory only and
          will be lost when you close this tab.
        </div>
      )}

      {/* ── Total ─────────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{
          fontSize: 11, color: '#8b93a8', textTransform: 'uppercase', letterSpacing: '0.1em',
          fontFamily: 'Space Mono, monospace', marginBottom: 8,
        }}>
          Total net worth
        </div>
        <div style={{ fontSize: 40, fontWeight: 700, fontFamily: 'Space Mono, monospace', color: '#e2e6f0', lineHeight: 1.1 }}>
          {fmtUSD(total)}
        </div>
        {linked.value === null && linked.hasPositions && (
          <div style={{ fontSize: 11, color: '#8b93a8', marginTop: 6 }}>
            Portfolio holdings value unavailable (price fetch failed) — excluded from total.
          </div>
        )}
      </div>

      {/* ── Composition bar ───────────────────────────────────────────────── */}
      {total > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', height: 14, borderRadius: 7, overflow: 'hidden', border: '1px solid #1e2230' }}>
            {segments.map(({ account, value }) => (
              <div
                key={account.id}
                title={`${account.label} — ${fmtUSD(value)} (${((value / total) * 100).toFixed(1)}%)`}
                style={{
                  width: `${(value / total) * 100}%`,
                  background: KIND_DISPLAY[account.kind].color,
                  opacity: 0.85,
                }}
              />
            ))}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', marginTop: 10 }}>
            {segments.map(({ account, value }) => (
              <span key={account.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#8b93a8' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: KIND_DISPLAY[account.kind].color, display: 'inline-block' }} />
                {account.label}
                <span style={{ fontFamily: 'Space Mono, monospace' }}>{((value / total) * 100).toFixed(1)}%</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Accounts list ─────────────────────────────────────────────────── */}
      <div style={{ background: '#0f1117', border: '1px solid #1e2230', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px', borderBottom: '1px solid #1e2230',
        }}>
          <span style={{
            fontSize: 11, color: '#8b93a8', textTransform: 'uppercase', letterSpacing: '0.1em',
            fontFamily: 'Space Mono, monospace',
          }}>
            Accounts
          </span>
          <button
            onClick={() => setAddOpen(true)}
            style={{
              background: 'none', border: '1px solid #1e2230', borderRadius: 6,
              color: '#e2e6f0', fontSize: 12, padding: '5px 12px', cursor: 'pointer',
              fontFamily: 'DM Sans, sans-serif',
            }}
          >
            + Add account
          </button>
        </div>

        {(accounts ?? []).map(account => {
          const isLinked = account.kind === 'holdings_link';
          const { label: kindLabel, color } = KIND_DISPLAY[account.kind];

          return (
            <div
              key={account.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '12px 18px', borderBottom: '1px solid #1e2230',
              }}
            >
              {/* Kind badge */}
              <span style={{
                fontSize: 9, fontFamily: 'Space Mono, monospace', letterSpacing: '0.08em',
                color, background: `${color}14`, border: `1px solid ${color}40`,
                borderRadius: 4, padding: '3px 7px', flexShrink: 0, width: 72, textAlign: 'center',
              }}>
                {kindLabel}
              </span>

              {/* Label */}
              <span style={{ flex: 1, fontSize: 13, color: '#e2e6f0', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
                <span style={{ fontSize: 14, fontFamily: 'Space Mono, monospace', color: linked.value == null && linked.hasPositions ? '#8b93a8' : '#e2e6f0' }}>
                  {linked.loading ? '…' : linked.value != null ? fmtUSD(linked.value) : '—'}
                </span>
              ) : (
                <BalanceCell account={account} onCommit={v => updateAccountBalance(account.id, v)} />
              )}

              {/* Updated */}
              <span style={{ fontSize: 10, color: '#4a4f63', fontFamily: 'Space Mono, monospace', width: 82, textAlign: 'right', flexShrink: 0 }}>
                {isLinked ? 'auto-synced' : fmtUpdated(account.balanceUpdatedAt)}
              </span>

              {/* Remove */}
              {isLinked ? (
                <span style={{ width: 22, flexShrink: 0 }} />
              ) : (
                <button
                  onClick={() => removeAccount(account.id)}
                  title="Remove account"
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: '#4a4f63', fontSize: 15, lineHeight: 1, padding: 4, width: 22, flexShrink: 0,
                  }}
                >
                  ×
                </button>
              )}
            </div>
          );
        })}

        {/* Empty state — only the auto-created linked row exists */}
        {manualAccounts.length === 0 && (
          <div style={{ padding: '22px 18px', fontSize: 12, color: '#8b93a8', lineHeight: 1.6 }}>
            Your portfolio is linked automatically. Add your other accounts — cash,
            401k or other balances, crypto — to see your full net worth in one place.
          </div>
        )}
      </div>

      <AddAccountPanel
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdd={addAccount}
      />
    </div>
  );
}
