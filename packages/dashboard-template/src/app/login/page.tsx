'use client';

import { useState, useEffect } from 'react';
import { redirectToLogin, getAccessToken, getRedirectUri } from '@/lib/auth';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [hov, setHov] = useState(false);

  useEffect(() => {
    // Already logged in → go to dashboard
    const token = getAccessToken();
    if (token) {
      router.replace('/');
    } else {
      setChecking(false);
    }
  }, [router]);

  const handleLogin = async () => {
    setLoading(true);
    await redirectToLogin(getRedirectUri());
  };

  if (checking) {
    return (
      <div style={{
        minHeight: '100vh', background: 'var(--bg)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{
          width: 8, height: 8, background: 'var(--accent)',
          animation: 'pulse 1.5s infinite',
        }} />
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--font-sans)',
    }}>

      {/* Logo */}
      <div style={{ marginBottom: 48, textAlign: 'center' }}>
        <div style={{
          width: 56, height: 56, background: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 26, fontWeight: 900, color: '#080808',
          margin: '0 auto 20px',
        }}>B</div>
        <h1 style={{
          fontSize: 28, fontWeight: 900, letterSpacing: '-0.03em',
          color: 'var(--text)', lineHeight: 1,
        }}>BASIS PLATTFORM</h1>
        <p style={{
          fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
          letterSpacing: '0.2em', textTransform: 'uppercase',
          color: 'var(--text-muted)', marginTop: 10,
        }}>DEIN KI-BÜRO FÜR DEN BETRIEB</p>
      </div>

      {/* Login Card */}
      <div style={{
        width: '100%', maxWidth: 400, padding: '40px',
        background: 'var(--surface)', border: '1px solid var(--border)',
      }}>
        <p style={{
          fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600,
          letterSpacing: '0.2em', textTransform: 'uppercase',
          color: 'var(--accent)', marginBottom: 8,
        }}>ANMELDEN</p>
        <h2 style={{
          fontSize: 22, fontWeight: 900, letterSpacing: '-0.02em',
          color: 'var(--text)', marginBottom: 6,
        }}>Willkommen zurück</h2>
        <p style={{
          fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 32,
        }}>
          Melde dich mit deinem BASIS-Konto an. Du wirst zu unserem sicheren Login weitergeleitet.
        </p>

        <button
          onClick={handleLogin}
          disabled={loading}
          onMouseEnter={() => setHov(true)}
          onMouseLeave={() => setHov(false)}
          style={{
            width: '100%', padding: '14px 24px',
            background: loading ? 'var(--surface-2)' : hov ? 'var(--text)' : 'var(--accent)',
            color: loading ? 'var(--text-muted)' : '#080808',
            border: 'none', fontWeight: 900, fontSize: 13,
            letterSpacing: '0.08em', textTransform: 'uppercase',
            cursor: loading ? 'default' : 'pointer',
            transition: 'all 0.15s',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          }}
        >
          {loading ? (
            <>
              <span style={{ width: 6, height: 6, background: 'var(--accent)', animation: 'pulse 1.5s infinite' }} />
              WEITERLEITUNG…
            </>
          ) : (
            <>MIT KEYCLOAK ANMELDEN →</>
          )}
        </button>

        <div style={{
          marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <div style={{ width: 6, height: 6, background: 'var(--positive)' }} />
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
            SSL-VERSCHLÜSSELT · DSGVO-KONFORM · EU-RECHENZENTRUM
          </p>
        </div>
      </div>

      {/* Footer */}
      <p style={{
        marginTop: 32, fontFamily: 'var(--font-mono)', fontSize: 10,
        color: 'var(--text-muted)', letterSpacing: '0.08em',
      }}>
        © {new Date().getFullYear()} BASIS · VINSCHGAU VENOSTA
      </p>

    </div>
  );
}
