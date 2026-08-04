import { useState, useEffect } from 'react';
import type { AccountKind, CreditCardFields, CryptoFields } from '../../hooks/useNetWorthSync';
import { KIND_DISPLAY } from './kindDisplay';

interface Props {
  open: boolean;
  onClose: () => void;
  onAdd: (kind: AccountKind, label: string, balance: number, creditCard?: CreditCardFields, crypto?: CryptoFields) => Promise<void>;
}

const ADDABLE_KINDS: AccountKind[] = ['cash', 'balance', 'crypto', 'credit_card'];

// Optional numeric field: empty is fine (null), otherwise must parse ≥ 0
function parseOptional(s: string): { ok: boolean; value: number | null } {
  const t = s.trim();
  if (t === '') return { ok: true, value: null };
  const n = parseFloat(t);
  return { ok: !isNaN(n) && n >= 0, value: n };
}

export default function AddAccountPanel({ open, onClose, onAdd }: Props) {
  const [kind, setKind]       = useState<AccountKind>('cash');
  const [label, setLabel]     = useState('');
  const [balance, setBalance] = useState('');
  const [saving, setSaving]   = useState(false);
  // credit_card only
  const [apr, setApr]                   = useState('');
  const [dueDate, setDueDate]           = useState('');
  const [minPayment, setMinPayment]     = useState('');
  const [stmtBalance, setStmtBalance]   = useState('');

  useEffect(() => {
    if (open) {
      setKind('cash');
      setLabel('');
      setBalance('');
      setApr('');
      setDueDate('');
      setMinPayment('');
      setStmtBalance('');
      setSaving(false);
    }
  }, [open]);

  if (!open) return null;

  const isCard   = kind === 'credit_card';
  const isCrypto = kind === 'crypto';

  const parsedBalance = parseFloat(balance);
  const balanceOk = balance.trim() !== '' && !isNaN(parsedBalance) && parsedBalance >= 0;

  const aprParsed  = parseOptional(apr);
  const minParsed  = parseOptional(minPayment);
  const stmtParsed = parseOptional(stmtBalance);
  const cardFieldsOk = !isCard || (aprParsed.ok && minParsed.ok && stmtParsed.ok);

  // Every kind (crypto included, now that it's a plain dollar amount) validates
  // on the balance field.
  const canSave = label.trim() !== '' && !saving && balanceOk && cardFieldsOk;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    await onAdd(
      kind,
      label.trim(),
      parsedBalance,
      isCard
        ? {
            apr:              aprParsed.value,
            dueDate:          dueDate || null,
            minPayment:       minParsed.value,
            statementBalance: stmtParsed.value,
          }
        : undefined,
      // No crypto live-pricing fields — crypto is stored as a manual balance.
      undefined
    );
    onClose();
  }

  const fieldLabelStyle: React.CSSProperties = {
    fontSize: 10,
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
    fontFamily: 'Space Mono, monospace',
    marginBottom: 6,
    display: 'block',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    boxSizing: 'border-box',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    color: 'var(--text-primary)',
    fontSize: 13,
    padding: '9px 12px',
    outline: 'none',
    fontFamily: 'DM Sans, sans-serif',
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(0,0,0,0.55)' }}
      />

      {/* Panel */}
      <div
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 50,
          width: 460,
          background: 'var(--bg-surface)', borderLeft: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-primary)' }}>Add account</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3 }}>
              Track cash, retirement balances, crypto, or credit card debt alongside your portfolio.
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 20, lineHeight: 1, padding: 4 }} aria-label="Close">×</button>
        </div>

        {/* Form */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Kind selector */}
          <div>
            <span style={fieldLabelStyle}>Account type</span>
            <div style={{ display: 'flex', gap: 8 }}>
              {ADDABLE_KINDS.map(k => {
                const { label: kindLabel, color } = KIND_DISPLAY[k];
                const active = kind === k;
                return (
                  <button
                    key={k}
                    onClick={() => setKind(k)}
                    style={{
                      flex: 1,
                      padding: '10px 0',
                      borderRadius: 8,
                      fontSize: 12,
                      fontFamily: 'Space Mono, monospace',
                      cursor: 'pointer',
                      background: active ? `${color}18` : 'transparent',
                      color: active ? color : 'var(--text-secondary)',
                      border: `1px solid ${active ? `${color}40` : 'var(--border)'}`,
                      transition: 'all 0.15s',
                    }}
                  >
                    {kindLabel}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Label */}
          <div>
            <span style={fieldLabelStyle}>Label</span>
            <input
              type="text"
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder={
                kind === 'cash' ? 'e.g. Checking account'
                : kind === 'balance' ? 'e.g. 401k — Fidelity'
                : kind === 'credit_card' ? 'e.g. Chase Sapphire'
                : 'e.g. Coinbase'
              }
              style={inputStyle}
            />
          </div>

          {/* Dollar balance — used by cash, retirement/other balances, crypto,
              and credit cards alike. Crypto is entered as a plain dollar value
              of the holding (no live pricing). */}
          <div>
            <span style={fieldLabelStyle}>
              {isCard ? 'Current balance owed'
               : isCrypto ? 'Current value ($)'
               : 'Current balance'}
            </span>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <span style={{ position: 'absolute', left: 12, color: 'var(--text-secondary)', fontSize: 13, fontFamily: 'Space Mono, monospace' }}>$</span>
              <input
                type="number"
                min={0}
                step="any"
                value={balance}
                onChange={e => setBalance(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSave()}
                placeholder="0"
                style={{
                  ...inputStyle,
                  paddingLeft: 26,
                  fontFamily: 'Space Mono, monospace',
                  MozAppearance: 'textfield' as any,
                }}
              />
            </div>
            {isCrypto && (
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.5 }}>
                Enter the current dollar value of your holding. Update it manually
                whenever you want to reflect a new price.
              </div>
            )}
            {balance.trim() !== '' && !balanceOk && (
              <div style={{ fontSize: 11, color: '#ff4b6e', marginTop: 6 }}>
                Balance must be a number ≥ 0.
              </div>
            )}
          </div>

          {/* Credit card details — all optional */}
          {isCard && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <span style={fieldLabelStyle}>APR % (optional)</span>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={apr}
                    onChange={e => setApr(e.target.value)}
                    placeholder="e.g. 24.99"
                    style={{ ...inputStyle, fontFamily: 'Space Mono, monospace', MozAppearance: 'textfield' as any }}
                  />
                  {!aprParsed.ok && (
                    <div style={{ fontSize: 11, color: '#ff4b6e', marginTop: 6 }}>Must be a number ≥ 0.</div>
                  )}
                </div>
                <div>
                  <span style={fieldLabelStyle}>Payment due date</span>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={e => setDueDate(e.target.value)}
                    style={{ ...inputStyle, fontFamily: 'Space Mono, monospace', colorScheme: 'dark' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <span style={fieldLabelStyle}>Min payment (optional)</span>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <span style={{ position: 'absolute', left: 12, color: 'var(--text-secondary)', fontSize: 13, fontFamily: 'Space Mono, monospace' }}>$</span>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={minPayment}
                      onChange={e => setMinPayment(e.target.value)}
                      placeholder="0"
                      style={{ ...inputStyle, paddingLeft: 26, fontFamily: 'Space Mono, monospace', MozAppearance: 'textfield' as any }}
                    />
                  </div>
                  {!minParsed.ok && (
                    <div style={{ fontSize: 11, color: '#ff4b6e', marginTop: 6 }}>Must be a number ≥ 0.</div>
                  )}
                </div>
                <div>
                  <span style={fieldLabelStyle}>Statement balance (optional)</span>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <span style={{ position: 'absolute', left: 12, color: 'var(--text-secondary)', fontSize: 13, fontFamily: 'Space Mono, monospace' }}>$</span>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={stmtBalance}
                      onChange={e => setStmtBalance(e.target.value)}
                      placeholder="0"
                      style={{ ...inputStyle, paddingLeft: 26, fontFamily: 'Space Mono, monospace', MozAppearance: 'textfield' as any }}
                    />
                  </div>
                  {!stmtParsed.ok && (
                    <div style={{ fontSize: 11, color: '#ff4b6e', marginTop: 6 }}>Must be a number ≥ 0.</div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Actions */}
        <div style={{ padding: '16px 24px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
          <button
            onClick={onClose}
            style={{ flex: 1, background: 'none', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 12, padding: '9px 0', cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            style={{
              flex: 2,
              background: canSave ? 'var(--text-primary)' : 'var(--border)',
              border: 'none',
              borderRadius: 8,
              color: canSave ? 'var(--bg-surface)' : 'var(--text-secondary)',
              fontSize: 12,
              fontWeight: 500,
              padding: '9px 0',
              cursor: canSave ? 'pointer' : 'not-allowed',
              transition: 'background 0.15s',
            }}
          >
            {saving ? 'Saving…' : 'Add account'}
          </button>
        </div>
      </div>
    </>
  );
}
