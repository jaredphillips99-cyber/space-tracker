import { useState } from 'react';
import { sendMagicLink } from '../lib/supabase';

type AuthStage = 'idle' | 'sending' | 'sent' | 'error';

export function AuthGate() {
  const [email, setEmail] = useState('');
  const [stage, setStage] = useState<AuthStage>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  async function handleSendLink() {
    if (!email.trim()) return;
    setStage('sending');
    setErrorMsg('');
    const { error } = await sendMagicLink(email.trim());
    if (error) {
      setErrorMsg(error);
      setStage('error');
    } else {
      setStage('sent');
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-base)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'DM Sans', sans-serif",
    }}>
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '40px 48px',
        width: 380,
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
      }}>
        {/* Brand */}
        <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 20, letterSpacing: 2 }}>
          <span style={{ color: '#00c8ff' }}>INVEST</span>
          <span style={{ color: 'var(--text-primary)' }}>AI</span>
        </div>

        <div>
          <div style={{ color: 'var(--text-primary)', fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
            Sign in
          </div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.55 }}>
            Enter your email to receive a magic link. Signing in does not grant
            operator access — Run Analysis is limited to allowlisted operators.
            Readers can use the dashboard without logging in.
          </div>
        </div>

        {stage === 'sent' ? (
          <div style={{
            background: '#00e67614',
            border: '1px solid #00e67640',
            borderRadius: 8,
            padding: '16px',
            color: '#00e676',
            fontSize: 14,
            lineHeight: 1.5,
          }}>
            ✓ Magic link sent to <strong>{email}</strong>. Check your inbox and click the link to log in.
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSendLink()}
                style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  padding: '10px 14px',
                  color: 'var(--text-primary)',
                  fontSize: 14,
                  outline: 'none',
                  fontFamily: "'DM Sans', sans-serif",
                }}
              />
              <button
                onClick={handleSendLink}
                disabled={stage === 'sending' || !email.trim()}
                style={{
                  background: stage === 'sending' ? 'var(--border)' : '#00c8ff',
                  color: stage === 'sending' ? 'var(--text-secondary)' : '#08090d',
                  border: 'none',
                  borderRadius: 6,
                  padding: '10px 0',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: stage === 'sending' ? 'not-allowed' : 'pointer',
                  fontFamily: "'Space Mono', monospace",
                  letterSpacing: 1,
                }}
              >
                {stage === 'sending' ? 'SENDING...' : 'SEND MAGIC LINK'}
              </button>
            </div>

            {stage === 'error' && (
              <div style={{ color: '#ff4b6e', fontSize: 13 }}>
                {errorMsg}
              </div>
            )}
          </>
        )}

        <div style={{ color: 'var(--text-secondary)', fontSize: 12, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
          Not signing in? <a
            href="/"
            style={{ color: '#00c8ff', textDecoration: 'none' }}
          >
            Continue as reader →
          </a>
        </div>
      </div>
    </div>
  );
}
