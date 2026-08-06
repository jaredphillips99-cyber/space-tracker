import { useState } from 'react';
import { useRetirementProfile, type RetirementProfile, type OtherRetirementAccount, type OtherInvestmentGoal } from '../../hooks/useRetirementProfile';
import { useNetWorthSync, type NetWorthAccount, type AccountKind } from '../../hooks/useNetWorthSync';
import { useCryptoPrices, type CryptoPrice } from '../../hooks/useCryptoPrices';
import { useFinancialProfile } from '../../hooks/useFinancialProfile';
import { MarkdownCard } from '../common/MarkdownCard';

const ACCENT = '#06b6d4'; // teal — distinct from Portfolio (purple/amber) + Net Worth cards

// ─── Static option lists ────────────────────────────────────────────────────────

const EMPLOYMENT_OPTIONS = [
  ['private', 'Private sector'],
  ['state_government', 'State government'],
  ['municipal_government', 'Municipal government'],
  ['federal_government', 'Federal government'],
  ['self_employed', 'Self-employed'],
  ['other', 'Other'],
] as const;

const PLAN_OPTIONS = [
  ['401k', '401(k)'],
  ['403b', '403(b)'],
  ['457b', '457(b)'],
  ['pension_plus_457b', 'Pension + 457(b)'],
  ['none', 'No employer plan'],
] as const;

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS',
  'KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY',
  'NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC',
];

// ─── Live crypto helpers (mirror NetWorthTab) ────────────────────────────────────

function isLivePricedCrypto(a: NetWorthAccount): boolean {
  return a.kind === 'crypto' && !!a.cryptoSymbol && a.cryptoQuantity != null;
}
function cryptoValue(a: NetWorthAccount, prices: Record<string, CryptoPrice | undefined>): number {
  if (isLivePricedCrypto(a)) {
    const p = prices[a.cryptoSymbol!.toUpperCase()];
    if (p && p.price > 0) return a.cryptoQuantity! * p.price;
  }
  return a.balance ?? 0;
}

// ─── Small styled field primitives ───────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  fontFamily: 'Space Mono, monospace', fontSize: 10, letterSpacing: '0.08em',
  textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: 4, display: 'block',
};
const inputStyle: React.CSSProperties = {
  background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 6,
  padding: '8px 10px', color: 'var(--text-primary)', fontSize: 13, outline: 'none',
  fontFamily: 'DM Sans, sans-serif', width: '100%', boxSizing: 'border-box',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

function NumberInput({ value, onChange, placeholder, step }: {
  value: number | null; onChange: (v: number | null) => void; placeholder?: string; step?: string;
}) {
  return (
    <input
      type="number"
      step={step}
      value={value == null ? '' : value}
      placeholder={placeholder}
      onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
      style={inputStyle}
    />
  );
}

function SelectInput({ value, onChange, options, placeholder }: {
  value: string | null; onChange: (v: string | null) => void;
  options: readonly (readonly [string, string])[]; placeholder: string;
}) {
  return (
    <select
      value={value ?? ''}
      onChange={e => onChange(e.target.value === '' ? null : e.target.value)}
      style={{ ...inputStyle, cursor: 'pointer' }}
    >
      <option value="">{placeholder}</option>
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}

// ─── Dynamic list editors ────────────────────────────────────────────────────────

function OtherAccountsEditor({ items, onChange }: {
  items: OtherRetirementAccount[]; onChange: (next: OtherRetirementAccount[]) => void;
}) {
  const update = (i: number, patch: Partial<OtherRetirementAccount>) =>
    onChange(items.map((it, idx) => idx === i ? { ...it, ...patch } : it));
  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i));
  const add = () => onChange([...items, { label: '', kind: 'roth_ira', balance: null, monthlyContribution: null }]);

  return (
    <div style={{ marginBottom: 14 }}>
      <label style={labelStyle}>Other retirement accounts</label>
      {items.map((it, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr 24px', gap: 6, marginBottom: 6, alignItems: 'center' }}>
          <input style={inputStyle} placeholder="Label (e.g. Roth IRA)" value={it.label} onChange={e => update(i, { label: e.target.value })} />
          <input style={inputStyle} placeholder="Kind" value={it.kind} onChange={e => update(i, { kind: e.target.value })} />
          <input style={inputStyle} type="number" placeholder="Balance $" value={it.balance ?? ''} onChange={e => update(i, { balance: e.target.value === '' ? null : Number(e.target.value) })} />
          <input style={inputStyle} type="number" placeholder="$/mo" value={it.monthlyContribution ?? ''} onChange={e => update(i, { monthlyContribution: e.target.value === '' ? null : Number(e.target.value) })} />
          <button onClick={() => remove(i)} style={removeBtnStyle} title="Remove">×</button>
        </div>
      ))}
      <button onClick={add} style={addBtnStyle}>+ Add account</button>
    </div>
  );
}

function GoalsEditor({ items, onChange }: {
  items: OtherInvestmentGoal[]; onChange: (next: OtherInvestmentGoal[]) => void;
}) {
  const update = (i: number, patch: Partial<OtherInvestmentGoal>) =>
    onChange(items.map((it, idx) => idx === i ? { ...it, ...patch } : it));
  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i));
  const add = () => onChange([...items, { label: '', monthlyAmount: null, accountType: 'taxable' }]);

  return (
    <div style={{ marginBottom: 14 }}>
      <label style={labelStyle}>Other investment goals</label>
      {items.map((it, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr 24px', gap: 6, marginBottom: 6, alignItems: 'center' }}>
          <input style={inputStyle} placeholder="Goal (e.g. DCA into Bitcoin)" value={it.label} onChange={e => update(i, { label: e.target.value })} />
          <input style={inputStyle} type="number" placeholder="$/mo" value={it.monthlyAmount ?? ''} onChange={e => update(i, { monthlyAmount: e.target.value === '' ? null : Number(e.target.value) })} />
          <input style={inputStyle} placeholder="Account type" value={it.accountType} onChange={e => update(i, { accountType: e.target.value })} />
          <button onClick={() => remove(i)} style={removeBtnStyle} title="Remove">×</button>
        </div>
      ))}
      <button onClick={add} style={addBtnStyle}>+ Add goal</button>
    </div>
  );
}

const removeBtnStyle: React.CSSProperties = {
  background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-secondary)',
  cursor: 'pointer', fontSize: 16, lineHeight: 1, height: 34, width: 24, padding: 0,
};
const addBtnStyle: React.CSSProperties = {
  background: 'transparent', border: '1px dashed var(--border)', borderRadius: 6, color: 'var(--text-secondary)',
  cursor: 'pointer', fontSize: 12, padding: '6px 12px', fontFamily: 'DM Sans, sans-serif',
};

// ─── Payload building ────────────────────────────────────────────────────────────

// Net Worth accounts relevant to contribution sequencing: cash, balance,
// credit cards, and crypto. The live-priced equity portfolio (holdings_link) is
// intentionally excluded — its live value isn't wired into this tab and it's
// tangential to the debt-vs-contribution waterfall.
function buildNetWorthPayload(accounts: NetWorthAccount[], cryptoPrices: Record<string, CryptoPrice | undefined>) {
  const relevant: AccountKind[] = ['cash', 'balance', 'credit_card', 'crypto'];
  return accounts
    .filter(a => relevant.includes(a.kind))
    .map(a => ({
      kind: a.kind,
      label: a.label,
      balance: a.kind === 'crypto' ? cryptoValue(a, cryptoPrices) : (a.balance ?? 0),
      ...(a.kind === 'credit_card' ? {
        apr:              a.apr ?? null,
        dueDate:          a.dueDate ?? null,
        minPayment:       a.minPayment ?? null,
        statementBalance: a.statementBalance ?? null,
      } : {}),
      ...(isLivePricedCrypto(a) ? {
        cryptoSymbol:   a.cryptoSymbol,
        cryptoQuantity: a.cryptoQuantity,
      } : {}),
    }));
}

// ─── Main component ──────────────────────────────────────────────────────────────

export default function RetirementTab() {
  const { profile, loading, isAuthenticated, syncError, hasCoreInputs, updateProfile } = useRetirementProfile();
  const { accounts } = useNetWorthSync();
  const { profile: finProfile } = useFinancialProfile();

  const cryptoSymbols = (accounts ?? []).filter(isLivePricedCrypto).map(a => a.cryptoSymbol!);
  const { prices: cryptoPrices } = useCryptoPrices(cryptoSymbols);

  const [analysis, setAnalysis]           = useState<string | null>(null);
  const [analysisLoading, setLoading]     = useState(false);
  const [analysisError, setAnalysisError] = useState('');

  const p = profile;
  const set = (patch: Partial<RetirementProfile>) => updateProfile(patch);

  async function runAnalysis() {
    if (!p) return;
    setLoading(true);
    setAnalysisError('');
    try {
      const netWorthAccounts = buildNetWorthPayload(accounts ?? [], cryptoPrices);
      const res = await fetch('/api/retirement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          retirementProfile: {
            employmentType:         p.employmentType,
            state:                  p.state,
            annualSalary:           p.annualSalary,
            primaryPlanType:        p.primaryPlanType,
            primaryContributionPct: p.primaryContributionPct,
            employerMatchPct:       p.employerMatchPct,
            employerMatchUpToPct:   p.employerMatchUpToPct,
            hasPension:             p.hasPension,
            birthYear:              p.birthYear,
            otherRetirementAccounts: p.otherRetirementAccounts,
            otherInvestmentGoals:    p.otherInvestmentGoals,
          },
          ...(netWorthAccounts.length > 0 ? { netWorthAccounts } : {}),
          ...(finProfile && (finProfile.monthlyIncome != null || finProfile.monthlySavingsTarget != null) ? {
            financialProfile: {
              monthlyIncome:        finProfile.monthlyIncome,
              monthlySavingsTarget: finProfile.monthlySavingsTarget,
            },
          } : {}),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'API error');
      }
      const { result } = await res.json();
      setAnalysis(result);
    } catch (e: unknown) {
      setAnalysisError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading || p == null) {
    return (
      <div style={{
        minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--text-muted)', fontFamily: "'Space Mono', monospace", fontSize: 12, letterSpacing: '0.08em',
      }}>
        LOADING…
      </div>
    );
  }

  const connectedAccounts = (accounts ?? []).filter(a =>
    a.kind === 'cash' || a.kind === 'balance' || a.kind === 'credit_card' || a.kind === 'crypto').length;

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '28px 8px 48px', fontFamily: 'DM Sans, sans-serif' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontFamily: 'Space Mono, monospace', fontSize: 11, letterSpacing: '0.12em', color: ACCENT, textTransform: 'uppercase', marginBottom: 6 }}>
          Retirement
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
          Contribution advisor
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginTop: 8, maxWidth: 620 }}>
          Enter your salary, plan, and contribution details. The advisor applies a fixed prioritization
          waterfall — employer match first, then high-APR debt, then remaining tax-advantaged room, then
          your other goals — sequencing contributions against any near-term debt from your Net Worth data.
        </p>
      </div>

      {/* Sync error */}
      {syncError && (
        <div style={{ background: '#ff4b6e14', border: '1px solid #ff4b6e40', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: '#ff4b6e', fontSize: 12, lineHeight: 1.5 }}>
          ⚠ Sync issue: {syncError}
        </div>
      )}
      {!isAuthenticated && (
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: 'var(--text-secondary)', fontSize: 12, lineHeight: 1.5 }}>
          You're not signed in — inputs live in memory only and are lost when you close the tab.
        </div>
      )}

      {/* Net Worth connection status */}
      <div style={{ background: connectedAccounts > 0 ? '#06b6d414' : 'var(--bg-elevated)', border: `1px solid ${connectedAccounts > 0 ? '#06b6d440' : 'var(--border)'}`, borderRadius: 8, padding: '10px 14px', marginBottom: 20, color: 'var(--text-secondary)', fontSize: 12, lineHeight: 1.5 }}>
        {connectedAccounts > 0
          ? <>✓ {connectedAccounts} Net Worth account{connectedAccounts === 1 ? '' : 's'} connected — debt (APR/balance/due dates) and cash will sharpen the waterfall's debt-priority step.</>
          : <>No Net Worth accounts connected. The waterfall still runs on match/plan/goals; adding cards & cash in the Net Worth tab sharpens the debt-priority step.</>}
      </div>

      {/* ── Input form ─────────────────────────────────────────────────────── */}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '20px 22px', marginBottom: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 18px' }}>
          <Field label="Employment type">
            <SelectInput value={p.employmentType} onChange={v => set({ employmentType: v })} options={EMPLOYMENT_OPTIONS} placeholder="Select…" />
          </Field>
          <Field label="State">
            <SelectInput value={p.state} onChange={v => set({ state: v })} options={US_STATES.map(s => [s, s] as const)} placeholder="Select…" />
          </Field>
          <Field label="Annual salary ($)">
            <NumberInput value={p.annualSalary} onChange={v => set({ annualSalary: v })} placeholder="e.g. 95000" />
          </Field>
          <Field label="Primary plan type">
            <SelectInput value={p.primaryPlanType} onChange={v => set({ primaryPlanType: v })} options={PLAN_OPTIONS} placeholder="Select…" />
          </Field>
          <Field label="Your contribution (% of salary)">
            <NumberInput value={p.primaryContributionPct} onChange={v => set({ primaryContributionPct: v })} placeholder="e.g. 6" step="0.5" />
          </Field>
          <Field label="Birth year">
            <NumberInput value={p.birthYear} onChange={v => set({ birthYear: v })} placeholder="e.g. 1990" />
          </Field>
          <Field label="Employer match (% of your contribution)">
            <NumberInput value={p.employerMatchPct} onChange={v => set({ employerMatchPct: v })} placeholder="e.g. 100" />
          </Field>
          <Field label="Match up to (% of salary)">
            <NumberInput value={p.employerMatchUpToPct} onChange={v => set({ employerMatchUpToPct: v })} placeholder="e.g. 5" step="0.5" />
          </Field>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, cursor: 'pointer' }}>
          <input type="checkbox" checked={p.hasPension === true} onChange={e => set({ hasPension: e.target.checked })} style={{ accentColor: ACCENT, width: 16, height: 16 }} />
          <span style={{ fontSize: 13, color: 'var(--text-body)' }}>I have a pension</span>
        </label>

        <OtherAccountsEditor items={p.otherRetirementAccounts} onChange={next => set({ otherRetirementAccounts: next })} />
        <GoalsEditor items={p.otherInvestmentGoals} onChange={next => set({ otherInvestmentGoals: next })} />
      </div>

      {/* ── Analyze / result ───────────────────────────────────────────────── */}
      {!hasCoreInputs ? (
        <div style={{ textAlign: 'center', padding: '24px 16px', color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.7 }}>
          Enter at least your <strong style={{ color: 'var(--text-secondary)' }}>annual salary</strong> and
          {' '}<strong style={{ color: 'var(--text-secondary)' }}>contribution %</strong> above to run the advisor.
        </div>
      ) : (
        <>
          {!analysis && (
            <button onClick={runAnalysis} disabled={analysisLoading} style={primaryBtnStyle(analysisLoading)}>
              {analysisLoading ? 'ANALYZING…' : '✦ Analyze my contributions'}
            </button>
          )}

          {analysisError && (
            <div style={{ background: '#ff4b6e14', border: '1px solid #ff4b6e40', borderRadius: 8, padding: '10px 14px', marginTop: 12, color: '#ff4b6e', fontSize: 12 }}>
              {analysisError}
            </div>
          )}

          {analysis && (
            <div style={{ marginTop: 8 }}>
              <div style={{
                background: '#06b6d40d', borderLeft: `3px solid ${ACCENT}`, borderRadius: '0 8px 8px 0',
                padding: '16px 18px',
              }}>
                <div style={{ fontFamily: 'Space Mono, monospace', fontSize: 10, letterSpacing: '0.12em', color: ACCENT, textTransform: 'uppercase', marginBottom: 10 }}>
                  Contribution Recommendation
                </div>
                <MarkdownCard>{analysis}</MarkdownCard>
              </div>
              <button onClick={runAnalysis} disabled={analysisLoading} style={{ ...reRunBtnStyle, marginTop: 12 }}>
                {analysisLoading ? 'ANALYZING…' : '⟳ Re-run analysis'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function primaryBtnStyle(loading: boolean): React.CSSProperties {
  return {
    background: loading ? 'var(--border)' : ACCENT,
    color: loading ? 'var(--text-secondary)' : '#08090d',
    border: 'none', borderRadius: 8, padding: '12px 20px', fontSize: 13, fontWeight: 600,
    cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'Space Mono, monospace',
    letterSpacing: '0.06em', width: '100%',
  };
}
const reRunBtnStyle: React.CSSProperties = {
  background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-secondary)',
  cursor: 'pointer', fontSize: 12, padding: '8px 16px', fontFamily: 'Space Mono, monospace', letterSpacing: '0.06em',
};
