import { useState } from 'react';
import { sendMagicLink } from '../../lib/supabase';

interface NetWorthAuthGateProps {
  onContinueAnonymously: () => void;
}

type Stage = 'idle' | 'sending' | 'sent' | 'error';

// Same soft sign-in pattern as PortfolioAuthGate, with net-worth-specific copy:
// manual balances have no anonymous fallback store, so the limitation of
// continuing without signing in is spelled out explicitly.
export function NetWorthAuthGate({ onContinueAnonymously }: NetWorthAuthGateProps) {
  const [email,  setEmail]  = useState('');
  const [stage,  setStage]  = useState<Stage>('idle');
  const [errMsg, setErrMsg] = useState('');

  async function handleSend() {
    if (!email.trim()) return;
    setStage('sending');
    setErrMsg('');
    const { error } = await sendMagicLink(email.trim());
    if (error) { setErrMsg(error); setStage('error'); }
    else setStage('sent');
  }

  return (
    <div style={{
      minHeight: '80vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'DM Sans', sans-serif",
    }}>
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '36px 44px',
        width: 380,
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
      }}>
        {/* Icon + title */}
        <div>
          <div style={{
            fontFamily: "'Space Mono', monospace",
            fontSize: 11,
            letterSpacing: '0.12em',
            color: '#00c8ff',
            marginBottom: 8,
            textTransform: 'uppercase',
          }}>
            Net Worth
          </div>
          <div style={{ color: 'var(--text-primary)', fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
            Save your accounts
          </div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.6 }}>
            Sign in with a magic link to keep your cash, retirement, and crypto
            balances across sessions. No password required.
          </div>
        </div>

        {stage === 'sent' ? (
          <div style={{
            background: '#00e67614',
            border: '1px solid #00e67640',
            borderRadius: 8,
            padding: '14px 16px',
            color: '#00e676',
            fontSize: 13,
            lineHeight: 1.6,
          }}>
            ✓ Magic link sent to <strong>{email}</strong>. Click the link in your inbox — you'll be brought right back here.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: '10px 14px',
                color: 'var(--text-primary)',
                fontSize: 14,
                outline: 'none',
                fontFamily: "'DM Sans', sans-serif",
                width: '100%',
                boxSizing: 'border-box',
              }}
            />
            <button
              onClick={handleSend}
              disabled={stage === 'sending' || !email.trim()}
              style={{
                background: stage === 'sending' ? 'var(--border)' : '#00c8ff',
                color: stage === 'sending' ? 'var(--text-secondary)' : '#08090d',
                border: 'none',
                borderRadius: 6,
                padding: '10px 0',
                fontSize: 13,
                fontWeight: 600,
                cursor: stage === 'sending' ? 'not-allowed' : 'pointer',
                fontFamily: "'Space Mono', monospace",
                letterSpacing: '0.06em',
                width: '100%',
              }}
            >
              {stage === 'sending' ? 'SENDING…' : 'SEND MAGIC LINK'}
            </button>
            {stage === 'error' && (
              <div style={{ color: '#ff4b6e', fontSize: 12 }}>{errMsg}</div>
            )}
          </div>
        )}

        {/* Divider */}
        <div style={{ borderTop: '1px solid var(--border)' }} />

        {/* Continue without saving */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            onClick={onContinueAnonymously}
            style={{
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: '10px 0',
              fontSize: 13,
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif",
              width: '100%',
              transition: 'border-color 0.15s, color 0.15s',
            }}
            onMouseEnter={e => {
              (e.target as HTMLButtonElement).style.borderColor = 'var(--border-strong)';
              (e.target as HTMLButtonElement).style.color = 'var(--text-body)';
            }}
            onMouseLeave={e => {
              (e.target as HTMLButtonElement).style.borderColor = 'var(--border)';
              (e.target as HTMLButtonElement).style.color = 'var(--text-secondary)';
            }}
          >
            Continue without saving →
          </button>
          <div style={{ color: 'var(--text-muted)', fontSize: 11, textAlign: 'center', lineHeight: 1.5 }}>
            Without signing in, manually entered balances live in memory only and
            are lost when you close the tab.
          </div>
        </div>
      </div>
    </div>
  );
}
