export const ONBOARDED_KEY = 'investai_onboarded_v1';

export function hasOnboarded(): boolean {
  try { return localStorage.getItem(ONBOARDED_KEY) != null; } catch { return true; }
}

export function markOnboarded() {
  try { localStorage.setItem(ONBOARDED_KEY, '1'); } catch {}
}

const TAB_CARDS: { label: string; accent: string; body: string }[] = [
  {
    label: 'Dashboard',
    accent: '#00c8ff',
    body: 'A live price table of all 31 tracked stocks across space, AI infrastructure, defense, and clean energy. Click any row for a deep dive with on-demand Claude analysis grounded in SEC filings — the sidebar flags which names need attention around earnings.',
  },
  {
    label: 'Portfolio',
    accent: '#a259ff',
    body: 'Track your positions with live values, gains, and sector concentration vs. targets, then simulate adds and trims and get AI memos on macro risk, rebalancing, and cash deployment. Position data stays in your browser — only percentages are sent for analysis.',
  },
  {
    label: 'Net Worth',
    accent: '#00e676',
    body: 'Your whole picture in one place: linked portfolio value plus cash, crypto, other balances, and credit card liabilities, with an AI read on balance sheet health. Admin sign-in required.',
  },
];

interface OnboardingModalProps {
  onClose: () => void;
}

export default function OnboardingModal({ onClose }: OnboardingModalProps) {
  function dismiss() {
    markOnboarded();
    onClose();
  }

  return (
    <>
      <div onClick={dismiss} style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'var(--overlay)', backdropFilter: 'blur(2px)' }} />
      <div
        role="dialog"
        aria-label="Welcome to InvestAI"
        style={{
          position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          zIndex: 100, width: 'min(520px, calc(100vw - 32px))',
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          borderRadius: 14, overflow: 'hidden',
          boxShadow: '0 24px 64px rgba(0,0,0,0.35)',
        }}
      >
        {/* Header */}
        <div style={{ padding: '20px 24px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontFamily: 'Space Mono, monospace', fontSize: 16, fontWeight: 700, letterSpacing: '0.02em', marginBottom: 4 }}>
              <span style={{ color: '#00c8ff' }}>INVEST</span>
              <span style={{ color: 'var(--text-primary)' }}>AI</span>
            </div>
            <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              A quick tour of the three tabs. Reopen this anytime with the <span style={{ fontFamily: 'Space Mono, monospace' }}>?</span> button in the top nav.
            </div>
          </div>
          <button
            onClick={dismiss}
            aria-label="Close"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 20, lineHeight: 1, padding: 4, marginLeft: 12 }}
          >×</button>
        </div>

        {/* Tab cards */}
        <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {TAB_CARDS.map(card => (
            <div
              key={card.label}
              style={{
                borderLeft: `3px solid ${card.accent}`,
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderLeftWidth: 3, borderLeftColor: card.accent,
                borderRadius: '0 10px 10px 0',
                padding: '12px 16px',
              }}
            >
              <div style={{ fontFamily: 'Space Mono, monospace', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: card.accent, marginBottom: 6 }}>
                {card.label}
              </div>
              <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, lineHeight: 1.6, color: 'var(--text-body)', margin: 0 }}>
                {card.body}
              </p>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px 20px' }}>
          <button
            onClick={dismiss}
            style={{
              width: '100%', background: 'var(--text-primary)', border: 'none', borderRadius: 8,
              color: 'var(--bg-surface)', fontFamily: 'DM Sans, sans-serif', fontSize: 13, fontWeight: 600,
              padding: '10px 0', cursor: 'pointer',
            }}
          >
            Got it
          </button>
        </div>
      </div>
    </>
  );
}
