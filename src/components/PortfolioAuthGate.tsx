import { useState } from 'react';
import { sendMagicLink } from '../lib/supabase';

interface PortfolioAuthGateProps {
  onContinueAnonymously: () => void;
}

type Stage = 'idle' | 'sending' | 'sent' | 'error';

export function PortfolioAuthGate({ onContinueAnonymously }: PortfolioAuthGateProps) {
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
        background: '#0f1117',
        border: '1px solid #1e2230',
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
            color: '#a259ff',
            marginBottom: 8,
            textTransform: 'uppercase',
          }}>
            Portfolio
          </div>
          <div style={{ color: '#e2e6f0', fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
            Save your portfolio
          </div>
          <div style={{ color: '#8b93a8', fontSize: 13, lineHeight: 1.6 }}>
            Sign in with a magic link to persist your positions, account type,
            and sector targets across sessions. No password required.
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
                background: '#161922',
                border: '1px solid #1e2230',
                borderRadius: 6,
                padding: '10px 14px',
                color: '#e2e6f0',
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
                background: stage === 'sending' ? '#1e2230' : '#a259ff',
                color: stage === 'sending' ? '#8b93a8' : '#fff',
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
        <div style={{ borderTop: '1px solid #1e2230' }} />

        {/* Continue without saving */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            onClick={onContinueAnonymously}
            style={{
              background: 'transparent',
              border: '1px solid #1e2230',
              borderRadius: 6,
              padding: '10px 0',
              fontSize: 13,
              color: '#8b93a8',
              cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif",
              width: '100%',
              transition: 'border-color 0.15s, color 0.15s',
            }}
            onMouseEnter={e => {
              (e.target as HTMLButtonElement).style.borderColor = '#2e3548';
              (e.target as HTMLButtonElement).style.color = '#c5cad8';
            }}
            onMouseLeave={e => {
              (e.target as HTMLButtonElement).style.borderColor = '#1e2230';
              (e.target as HTMLButtonElement).style.color = '#8b93a8';
            }}
          >
            Continue without saving →
          </button>
          <div style={{ color: '#4a4f63', fontSize: 11, textAlign: 'center', lineHeight: 1.5 }}>
            Session data clears when you close the tab.
          </div>
        </div>
      </div>
    </div>
  );
}
