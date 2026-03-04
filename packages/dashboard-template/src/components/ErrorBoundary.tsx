'use client';

import { Component, type ReactNode, type ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div style={{
          minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--bg)', padding: '40px',
        }}>
          <div style={{
            maxWidth: 480, background: 'var(--surface)',
            borderLeft: '3px solid var(--negative)', padding: '32px',
          }}>
            <p style={{
              fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 800,
              letterSpacing: '0.2em', textTransform: 'uppercase',
              color: 'var(--negative)', marginBottom: 12,
            }}>FEHLER</p>
            <h2 style={{ fontSize: 20, fontWeight: 900, color: 'var(--text)', marginBottom: 12 }}>
              Etwas ist schiefgelaufen
            </h2>
            <p style={{
              fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)',
              lineHeight: 1.6, marginBottom: 24,
              background: 'var(--bg)', padding: '12px', wordBreak: 'break-word',
            }}>
              {this.state.error?.message ?? 'Unbekannter Fehler'}
            </p>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              style={{
                padding: '10px 24px', background: 'var(--accent)', border: 'none',
                color: '#080808', fontFamily: 'var(--font-mono)', fontSize: 10,
                fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase',
                cursor: 'pointer',
              }}
            >NEU LADEN →</button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
