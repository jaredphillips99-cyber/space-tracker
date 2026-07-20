import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  // Optional label shown in the fallback UI so it's clear which section crashed
  label?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

// Catches render-time exceptions in its subtree. Without this, an uncaught
// error anywhere in the tree unmounts the entire React root, leaving nothing
// but the app's near-black background — which reads as "the site went black."
// This boundary contains the damage to a visible, recoverable error card and
// logs the real error to the console for debugging instead.
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[ErrorBoundary${this.props.label ? ` — ${this.props.label}` : ''}]`, error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <div style={{
          margin: '24px auto', maxWidth: 640, padding: '24px 28px',
          background: 'var(--bg-surface)', border: '1px solid #ff4b6e44', borderRadius: 12,
          color: 'var(--text-primary)', fontFamily: 'DM Sans, sans-serif',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 18, color: '#ff4b6e' }}>⚠</span>
            <span style={{ fontSize: 14, fontWeight: 600 }}>
              {this.props.label ? `${this.props.label} hit an error` : 'Something went wrong'}
            </span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.5 }}>
            {this.state.error.message || 'An unexpected error occurred while rendering this section.'}
            {' '}The rest of the app is unaffected — try again, or reload the page if it persists.
          </div>
          <button
            onClick={this.handleReset}
            style={{ background: '#a259ff', border: 'none', borderRadius: 6, color: '#08090d', fontSize: 12, fontWeight: 600, padding: '8px 16px', cursor: 'pointer' }}
          >
            ↺ Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
