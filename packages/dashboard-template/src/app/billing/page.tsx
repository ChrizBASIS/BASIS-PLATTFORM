'use client';

import { useState } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { useDashboardData } from '@/hooks/useDashboardData';

const PLANS = [
  {
    id: 'starter',
    label: 'Starter',
    price: '49',
    tokens: '10.000',
    agents: '3',
    projects: '1',
    features: ['3 Agenten (Lena, Marie, Tom)', '10.000 Tokens/Monat', '1 Projekt', 'E-Mail Support'],
  },
  {
    id: 'pro',
    label: 'Pro',
    price: '149',
    tokens: '50.000',
    agents: '7',
    projects: '5',
    features: ['Alle 7 Agenten', '50.000 Tokens/Monat', '5 Projekte', 'Build Mode + Sandbox', 'Priority Support'],
    highlight: true,
  },
  {
    id: 'enterprise',
    label: 'Enterprise',
    price: '399',
    tokens: '200.000',
    agents: '7',
    projects: 'unbegrenzt',
    features: ['Alle 7 Agenten', '200.000 Tokens/Monat', 'Unbegrenzte Projekte', 'Custom Integrationen', 'Dedicated Support', 'SLA 99.9%'],
  },
];

export default function BillingPage() {
  const { tenant, tokens } = useDashboardData();
  const currentPlan = tenant?.meta?.plan ?? 'starter';
  const [hovPlan, setHovPlan] = useState<string | null>(null);
  const [upgradeHov, setUpgradeHov] = useState<string | null>(null);

  const pct = tokens ? Math.min((tokens.total_tokens / tokens.limit) * 100, 100) : 0;
  const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar tenantName={tenant?.meta?.name} plan={tenant?.meta?.plan} />

      <main style={{ marginLeft: 260, flex: 1, padding: '40px' }}>
        <p style={{
          fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
          letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 6,
        }}>ABRECHNUNG</p>
        <h1 style={{
          fontSize: 28, fontWeight: 900, letterSpacing: '-0.03em',
          color: 'var(--text)', marginBottom: 32,
        }}>Plan & Nutzung</h1>

        {/* Current usage */}
        <div style={{ maxWidth: 680, marginBottom: 40 }}>
          <p style={{
            fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
            letterSpacing: '0.15em', textTransform: 'uppercase',
            color: 'var(--text-muted)', marginBottom: 14,
          }}>AKTUELLER VERBRAUCH</p>

          <div style={{
            background: 'var(--surface)', padding: '24px',
            borderLeft: `3px solid ${pct > 90 ? 'var(--negative)' : pct > 75 ? 'var(--warning)' : 'var(--positive)'}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 32, fontWeight: 900, letterSpacing: '-0.03em', color: 'var(--text)' }}>
                {tokens ? fmt(tokens.total_tokens) : '—'}
              </span>
              <span style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 4 }}>
                / {tokens ? fmt(tokens.limit) : '—'} Tokens
              </span>
              <span style={{
                marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 800,
                color: pct > 90 ? 'var(--negative)' : pct > 75 ? 'var(--warning)' : 'var(--positive)',
              }}>{pct.toFixed(1)}%</span>
            </div>
            <div style={{ background: 'var(--bg)', height: 8, position: 'relative' }}>
              <div style={{
                height: '100%',
                width: `${pct}%`,
                background: pct > 90 ? 'var(--negative)' : pct > 75 ? 'var(--warning)' : 'var(--accent)',
                transition: 'width 0.6s ease',
              }} />
            </div>
            <p style={{
              fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)',
              marginTop: 8, letterSpacing: '0.08em',
            }}>
              ZEITRAUM: {tokens?.period?.label ?? '—'}
            </p>
          </div>
        </div>

        {/* Plan cards */}
        <p style={{
          fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
          letterSpacing: '0.15em', textTransform: 'uppercase',
          color: 'var(--text-muted)', marginBottom: 16,
        }}>VERFÜGBARE PLÄNE</p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2, maxWidth: 900, marginBottom: 40 }}>
          {PLANS.map((plan) => {
            const isCurrent = currentPlan === plan.id;
            const isHov = hovPlan === plan.id;
            return (
              <div
                key={plan.id}
                onMouseEnter={() => setHovPlan(plan.id)}
                onMouseLeave={() => setHovPlan(null)}
                style={{
                  background: 'var(--surface)',
                  border: `1px solid ${isCurrent ? 'var(--accent)' : isHov ? 'var(--border)' : 'var(--border)'}`,
                  outline: isCurrent ? '1px solid var(--accent)' : 'none',
                  padding: '28px 24px',
                  position: 'relative',
                  transition: 'border-color 0.15s',
                }}
              >
                {isCurrent && (
                  <div style={{
                    position: 'absolute', top: -1, left: 0, right: 0,
                    background: 'var(--accent)', color: '#080808',
                    fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 800,
                    letterSpacing: '0.15em', textAlign: 'center', padding: '4px',
                  }}>DEIN AKTUELLER PLAN</div>
                )}
                {plan.highlight && !isCurrent && (
                  <div style={{
                    position: 'absolute', top: -1, left: 0, right: 0,
                    background: 'var(--surface-2)', color: 'var(--accent)',
                    fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 800,
                    letterSpacing: '0.15em', textAlign: 'center', padding: '4px',
                    border: '1px solid var(--accent)',
                  }}>EMPFOHLEN</div>
                )}

                <div style={{ marginTop: (isCurrent || plan.highlight) ? 20 : 0 }}>
                  <p style={{
                    fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
                    letterSpacing: '0.2em', textTransform: 'uppercase',
                    color: isCurrent ? 'var(--accent)' : 'var(--text-muted)', marginBottom: 12,
                  }}>{plan.label}</p>

                  <div style={{ marginBottom: 20 }}>
                    <span style={{ fontSize: 36, fontWeight: 900, letterSpacing: '-0.04em', color: 'var(--text)' }}>
                      €{plan.price}
                    </span>
                    <span style={{ fontSize: 13, color: 'var(--text-muted)', marginLeft: 4 }}>/Monat</span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 24 }}>
                    {plan.features.map((f) => (
                      <div key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                        <span style={{ color: 'var(--positive)', fontSize: 11, marginTop: 1, flexShrink: 0 }}>✓</span>
                        <span style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.5 }}>{f}</span>
                      </div>
                    ))}
                  </div>

                  {!isCurrent ? (
                    <button
                      onMouseEnter={() => setUpgradeHov(plan.id)}
                      onMouseLeave={() => setUpgradeHov(null)}
                      style={{
                        width: '100%', padding: '12px',
                        background: upgradeHov === plan.id ? 'var(--text)' : plan.highlight ? 'var(--accent)' : 'var(--surface-2)',
                        border: plan.highlight ? 'none' : '1px solid var(--border)',
                        color: plan.highlight ? '#080808' : 'var(--text)',
                        fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 800,
                        letterSpacing: '0.1em', textTransform: 'uppercase',
                        cursor: 'pointer', transition: 'all 0.15s',
                      }}
                    >
                      {currentPlan === 'enterprise' || (plan.id === 'starter' && currentPlan !== 'starter')
                        ? 'DOWNGRADE'
                        : 'UPGRADE →'}
                    </button>
                  ) : (
                    <div style={{
                      width: '100%', padding: '12px', textAlign: 'center',
                      background: 'transparent', border: '1px solid var(--accent)',
                      fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 800,
                      letterSpacing: '0.1em', color: 'var(--accent)',
                    }}>AKTIV ●</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Invoice note */}
        <div style={{ maxWidth: 680 }}>
          <div style={{ padding: '20px 24px', background: 'var(--surface)', borderLeft: '3px solid var(--text-muted)' }}>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              Für Rechnungen, Zahlungsmethoden und individuelle Enterprise-Angebote —{' '}
              <span style={{ color: 'var(--accent)', fontWeight: 700 }}>support@basis.app</span>
              {' '}oder wende dich an Lena im Dashboard-Chat.
            </p>
          </div>
        </div>

      </main>
    </div>
  );
}
