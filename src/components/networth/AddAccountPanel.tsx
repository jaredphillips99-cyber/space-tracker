import { useState, useEffect } from 'react';
import type { AccountKind } from '../../hooks/useNetWorthSync';
import { KIND_DISPLAY } from './kindDisplay';

interface Props {
  open: boolean;
  onClose: () => void;
  onAdd: (kind: AccountKind, label: string, balance: number) => Promise<void>;
}

const ADDABLE_KINDS: AccountKind[] = ['cash', 'balance', 'crypto'];

export default function AddAccountPanel({ open, onClose, onAdd }: Props) {
  const [kind, setKind]       = useState<AccountKind>('cash');
  const [label, setLabel]     = useState('');
  const [balance, setBalance] = useState('');
  const [saving, setSaving]   = useState(false);

  useEffect(() => {
    if (open) {
      setKind('cash');
      setLabel('');
      setBalance('');
      setSaving(false);
    }
  }, [open]);

  if (!open) return null;

  const parsedBalance = parseFloat(balance);
  const balanceOk = balance.trim() !== '' && !isNaN(parsedBalance) && parsedBalance >= 0;
  const canSave = label.trim() !== '' && balanceOk && !saving;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    await onAdd(kind, label.trim(), parsedBalance);
    onClose();
  }

  const fieldLabelStyle: React.CSSProperties = {
    fontSize: 10,
    color: '#8b93a8',
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
    fontFamily: 'Space Mono, monospace',
    marginBottom: 6,
    display: 'block',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    boxSizing: 'border-box',
    background: '#161922',
    border: '1px solid #1e2230',
    borderRadius: 6,
    color: '#e2e6f0',
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
          background: '#0f1117', borderLeft: '1px solid #1e2230',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #1e2230', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 500, color: '#e2e6f0' }}>Add account</div>
            <div style={{ fontSize: 12, color: '#8b93a8', marginTop: 3 }}>
              Track cash, retirement balances, or crypto alongside your portfolio.
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8b93a8', fontSize: 20, lineHeight: 1, padding: 4 }} aria-label="Close">×</button>
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
                      color: active ? color : '#8b93a8',
                      border: `1px solid ${active ? `${color}40` : '#1e2230'}`,
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
              placeholder={kind === 'cash' ? 'e.g. Checking account' : kind === 'balance' ? 'e.g. 401k — Fidelity' : 'e.g. Coinbase'}
              style={inputStyle}
            />
          </div>

          {/* Starting balance */}
          <div>
            <span style={fieldLabelStyle}>Current balance</span>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <span style={{ position: 'absolute', left: 12, color: '#8b93a8', fontSize: 13, fontFamily: 'Space Mono, monospace' }}>$</span>
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
            {balance.trim() !== '' && !balanceOk && (
              <div style={{ fontSize: 11, color: '#ff4b6e', marginTop: 6 }}>
                Balance must be a number ≥ 0.
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div style={{ padding: '16px 24px 20px', borderTop: '1px solid #1e2230', display: 'flex', gap: 8 }}>
          <button
            onClick={onClose}
            style={{ flex: 1, background: 'none', border: '1px solid #1e2230', borderRadius: 8, color: '#e2e6f0', fontSize: 12, padding: '9px 0', cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            style={{
              flex: 2,
              background: canSave ? '#e2e6f0' : '#1e2230',
              border: 'none',
              borderRadius: 8,
              color: canSave ? '#08090d' : '#8b93a8',
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
