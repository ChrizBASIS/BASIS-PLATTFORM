'use client';

import { useState } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { KPICard } from '@/components/KPICard';
import { AgentChat } from '@/components/AgentChat';
import { TokenMeter } from '@/components/TokenMeter';
import { useTheme } from '@/components/ThemeProvider';
import { SupportBannerDemo } from '@/components/SupportBanner';

const KPI_DATA = [
  { label: 'UMSATZ MÄRZ', value: '€12.450', change: '+8.3%', positive: true },
  { label: 'GÄSTE HEUTE', value: '47', change: '+12%', positive: true },
  { label: 'RESERVIERUNGEN', value: '23', change: '−3%', positive: false },
  { label: 'AUSLASTUNG', value: '78%', change: '+5%', positive: true },
];

const ACTIVITIES = [
  { agent: 'Clara', action: 'Rechnung #2026-0032 erstellt', time: 'VOR 5 MIN' },
  { agent: 'Marie', action: 'E-Mail-Entwurf an Gast Müller', time: 'VOR 12 MIN' },
  { agent: 'Tom', action: 'Monatsbericht Februar exportiert', time: 'VOR 1 STD' },
  { agent: 'Marco', action: 'Social-Media-Post Wochenmenü', time: 'VOR 2 STD' },
  { agent: 'Nico', action: 'Widget „Tagesreservierungen" gebaut', time: 'VOR 3 STD' },
  { agent: 'Alex', action: 'Support-Anfrage #47 beantwortet', time: 'VOR 4 STD' },
];

const TOKEN_AGENTS = [
  { name: 'Lena', tokens: 4200 },
  { name: 'Clara', tokens: 3100 },
  { name: 'Marie', tokens: 2800 },
  { name: 'Marco', tokens: 1900 },
  { name: 'Tom', tokens: 1400 },
  { name: 'Alex', tokens: 800 },
  { name: 'Nico', tokens: 600 },
];

export default function DashboardPage() {
  const { theme, toggle } = useTheme();
  const [buildHov, setBuildHov] = useState(false);
  const [themeHov, setThemeHov] = useState(false);

  return (
    <div style={{ display: 'flex', minHeight: '100vh', position: 'relative', zIndex: 1 }}>
      <SupportBannerDemo />
      <Sidebar />

      <main style={{ marginLeft: 260, flex: 1, padding: '40px 40px 80px' }}>
        {/* Header */}
        <header style={{
          padding: '32px 0 40px',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
          borderBottom: '1px solid var(--border)', marginBottom: 2,
        }}>
          <div>
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600,
              letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--accent)',
              display: 'block', marginBottom: 12,
            }}>DASHBOARD</span>
            <h1 style={{
              fontSize: 'clamp(28px, 4vw, 48px)', fontWeight: 900,
              lineHeight: 0.95, letterSpacing: '-0.03em', color: 'var(--text)',
            }}>Willkommen zurück.</h1>
            <p style={{ fontSize: 14, color: 'var(--text-dim)', marginTop: 8 }}>
              Gasthof Sonnenhof — Dienstag, 4. März 2026
            </p>
          </div>
          <div style={{ display: 'flex', gap: 2 }}>
            {/* Theme Toggle */}
            <button
              onClick={toggle}
              onMouseEnter={() => setThemeHov(true)}
              onMouseLeave={() => setThemeHov(false)}
              style={{
                background: themeHov ? 'var(--surface-2)' : 'var(--surface)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
                padding: '12px 20px',
                fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
                letterSpacing: '0.1em', textTransform: 'uppercase',
                cursor: 'pointer', transition: 'all 0.15s',
              }}
            >{theme === 'dark' ? '☀ LIGHT' : '● DARK'}</button>
            {/* Build Mode */}
            <button
              onMouseEnter={() => setBuildHov(true)}
              onMouseLeave={() => setBuildHov(false)}
              style={{
                background: buildHov ? 'var(--text)' : 'var(--accent)',
                color: 'var(--on-accent)',
                border: 'none', padding: '12px 28px',
                fontWeight: 800, fontSize: 13,
                letterSpacing: '0.08em', textTransform: 'uppercase',
                cursor: 'pointer', transition: 'all 0.15s',
                display: 'flex', alignItems: 'center', gap: 10,
              }}
            >
              <span style={{ width: 6, height: 6, background: 'var(--on-accent)', animation: 'pulse 1.5s infinite' }} />
              BUILD MODE
            </button>
          </div>
        </header>

        {/* KPI Grid — 2px gaps */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 2, marginBottom: 2 }}>
          {KPI_DATA.map((kpi) => (
            <KPICard key={kpi.label} {...kpi} />
          ))}
        </div>

        {/* Main Grid: Chat + Activity + Token */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 2 }}>
          {/* Left: Chat */}
          <AgentChat />

          {/* Right: Activity + Token stacked */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* Activity Feed */}
            <div style={{ background: 'var(--surface)', flex: 1 }}>
              <div style={{
                padding: '16px 24px', borderBottom: '1px solid var(--border)',
              }}>
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600,
                  letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--accent)',
                }}>LETZTE AKTIVITÄTEN</span>
              </div>
              <div>
                {ACTIVITIES.map((a, i) => (
                  <ActivityRow key={i} {...a} />
                ))}
              </div>
            </div>

            {/* Token Meter */}
            <TokenMeter
              used={14800}
              limit={20000}
              agents={TOKEN_AGENTS}
              period="MÄRZ 2026"
            />
          </div>
        </div>
      </main>
    </div>
  );
}

function ActivityRow({ agent, action, time }: { agent: string; action: string; time: string }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 24px',
        borderBottom: '1px solid var(--border)',
        background: hov ? 'var(--surface-2)' : 'transparent',
        transition: 'background 0.15s',
      }}
    >
      <div style={{
        width: 24, height: 24, flexShrink: 0,
        background: hov ? 'var(--accent)' : 'var(--surface-2)',
        color: hov ? 'var(--on-accent)' : 'var(--accent)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 10, fontWeight: 800, transition: 'all 0.15s',
      }}>{agent[0]}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <span style={{ fontWeight: 700, color: hov ? 'var(--accent)' : 'var(--text)' }}>{agent}</span>
          {' '}{action}
        </p>
      </div>
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600,
        letterSpacing: '0.1em', color: 'var(--text-muted)', whiteSpace: 'nowrap',
      }}>{time}</span>
    </div>
  );
}
