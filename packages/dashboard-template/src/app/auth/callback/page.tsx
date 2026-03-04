'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { exchangeCode, getRedirectUri } from '@/lib/auth';
import { Suspense } from 'react';

function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get('code');
    const err  = searchParams.get('error');

    if (err) {
      setError(searchParams.get('error_description') ?? 'Login fehlgeschlagen');
      return;
    }

    if (!code) {
      setError('Kein Authorisierungs-Code erhalten');
      return;
    }

    exchangeCode(code, getRedirectUri())
      .then(() => router.replace('/'))
      .catch((e: Error) => setError(e.message));
  }, [searchParams, router]);

  if (error) {
    return (
      <div style={{
        minHeight: '100vh', background: 'var(--bg)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 20,
      }}>
        <div style={{
          padding: '24px 32px', background: 'var(--surface)',
          border: '1px solid var(--negative)', maxWidth: 420, width: '100%',
        }}>
          <p style={{
            fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
            letterSpacing: '0.15em', color: 'var(--negative)', marginBottom: 8,
          }}>LOGIN FEHLER</p>
          <p style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.6 }}>{error}</p>
          <button
            onClick={() => router.replace('/login')}
            style={{
              marginTop: 20, width: '100%', padding: '12px',
              background: 'var(--accent)', color: '#080808',
              border: 'none', fontWeight: 800, fontSize: 12,
              letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer',
            }}
          >ERNEUT VERSUCHEN</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 16,
    }}>
      <div style={{
        width: 10, height: 10, background: 'var(--accent)',
        animation: 'pulse 1.5s infinite',
      }} />
      <p style={{
        fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600,
        letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--text-muted)',
      }}>ANMELDUNG WIRD ABGESCHLOSSEN…</p>
    </div>
  );
}

export default function CallbackPage() {
  return (
    <Suspense fallback={
      <div style={{
        minHeight: '100vh', background: 'var(--bg)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ width: 8, height: 8, background: 'var(--accent)', animation: 'pulse 1.5s infinite' }} />
      </div>
    }>
      <CallbackHandler />
    </Suspense>
  );
}
