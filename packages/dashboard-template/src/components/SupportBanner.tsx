'use client';

import { useState, useEffect } from 'react';

interface SupportSession {
  reason: string;
  expiresAt: string;
  startedAt: string;
}

export function SupportBanner() {
  const [session, setSession] = useState<SupportSession | null>(null);
  const [timeLeft, setTimeLeft] = useState('');
  const [hov, setHov] = useState(false);

  // Poll for active support session
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch('/api/v1/support/active', { credentials: 'include' });
        const data = await res.json();
        if (data.active) {
          setSession(data.session);
        } else {
          setSession(null);
        }
      } catch {
        // API not running in dev — show demo
      }
    };
    check();
    const interval = setInterval(check, 30_000);
    return () => clearInterval(interval);
  }, []);

  // Countdown timer
  useEffect(() => {
    if (!session) return;
    const tick = () => {
      const diff = new Date(session.expiresAt).getTime() - Date.now();
      if (diff <= 0) { setSession(null); return; }
      const mins = Math.floor(diff / 60_000);
      const secs = Math.floor((diff % 60_000) / 1000);
      setTimeLeft(`${mins}:${secs.toString().padStart(2, '0')}`);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [session]);

  if (!session) return null;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 260, right: 0, zIndex: 50,
      background: 'var(--accent)', color: 'var(--on-accent)',
      padding: '10px 40px',
      display: 'flex', alignItems: 'center', gap: 16,
    }}>
      <div style={{
        width: 8, height: 8, background: 'var(--on-accent)',
        animation: 'pulse 1.5s infinite', flexShrink: 0,
      }} />
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
        letterSpacing: '0.15em', textTransform: 'uppercase',
      }}>BASIS-SUPPORT AKTIV</span>
      <span style={{ fontSize: 13, opacity: 0.7, flex: 1 }}>
        {session.reason}
      </span>
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700,
        letterSpacing: '0.1em',
      }}>{timeLeft}</span>
      <button
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        onClick={async () => {
          // Kunde kann Support-Session beenden
          try {
            await fetch('/api/v1/support/sessions/revoke-active', {
              method: 'POST', credentials: 'include',
            });
            setSession(null);
          } catch { /* */ }
        }}
        style={{
          background: hov ? '#ff4444' : 'var(--on-accent)',
          color: hov ? '#fff' : 'var(--accent)',
          border: 'none', padding: '6px 16px',
          fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 800,
          letterSpacing: '0.15em', textTransform: 'uppercase',
          cursor: 'pointer', transition: 'all 0.15s',
        }}
      >BEENDEN</button>
    </div>
  );
}

/**
 * Demo-Version für Entwicklung — zeigt immer das Banner an
 */
export function SupportBannerDemo() {
  const [timeLeft, setTimeLeft] = useState('47:23');
  const [hov, setHov] = useState(false);

  useEffect(() => {
    let secs = 47 * 60 + 23;
    const interval = setInterval(() => {
      secs--;
      if (secs <= 0) secs = 0;
      const m = Math.floor(secs / 60);
      const s = secs % 60;
      setTimeLeft(`${m}:${s.toString().padStart(2, '0')}`);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{
      position: 'fixed', top: 0, left: 260, right: 0, zIndex: 50,
      background: 'var(--accent)', color: 'var(--on-accent)',
      padding: '10px 40px',
      display: 'flex', alignItems: 'center', gap: 16,
    }}>
      <div style={{
        width: 8, height: 8, background: 'var(--on-accent)',
        animation: 'pulse 1.5s infinite', flexShrink: 0,
      }} />
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
        letterSpacing: '0.15em', textTransform: 'uppercase',
      }}>BASIS-SUPPORT AKTIV</span>
      <span style={{ fontSize: 13, opacity: 0.7, flex: 1 }}>
        Widget-Konfiguration für Reservierungssystem
      </span>
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700,
        letterSpacing: '0.1em',
      }}>{timeLeft}</span>
      <button
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        style={{
          background: hov ? '#ff4444' : 'var(--on-accent)',
          color: hov ? '#fff' : 'var(--accent)',
          border: 'none', padding: '6px 16px',
          fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 800,
          letterSpacing: '0.15em', textTransform: 'uppercase',
          cursor: 'pointer', transition: 'all 0.15s',
        }}
      >BEENDEN</button>
    </div>
  );
}
