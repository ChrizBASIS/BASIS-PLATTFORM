'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/Sidebar';
import { useDashboardData, AGENT_META } from '@/hooks/useDashboardData';

const ALL_AGENTS = [
  { key: 'lena',  name: 'Lena',  type: 'orchestrator' },
  { key: 'marie', name: 'Marie', type: 'sekretariat' },
  { key: 'tom',   name: 'Tom',   type: 'backoffice' },
  { key: 'clara', name: 'Clara', type: 'finance' },
  { key: 'marco', name: 'Marco', type: 'marketing' },
  { key: 'alex',  name: 'Alex',  type: 'support' },
  { key: 'nico',  name: 'Nico',  type: 'builder' },
];

const AGENT_DESCRIPTIONS: Record<string, string> = {
  lena:  'Orchestratorin — koordiniert alle anderen Agenten und beantwortet allgemeine Fragen.',
  marie: 'Zuständig für E-Mails, Terminplanung, Korrespondenz und administrative Aufgaben.',
  tom:   'Verwaltet Dokumente, Personalthemen, interne Organisation und Büroprozesse.',
  clara: 'Bearbeitet Rechnungen, Buchhaltung, Lohnabrechnung und steuerliche Fragen.',
  marco: 'Erstellt Social-Media-Inhalte, Newsletter und Marketingkampagnen.',
  alex:  'Beantwortet Kundenanfragen, verwaltet Bewertungen und Support-Tickets.',
  nico:  'Entwickelt Automatisierungen, Dashboards und technische Lösungen.',
};

export default function AgentsPage() {
  const { tenant, agents } = useDashboardData();
  const router = useRouter();
  const [hovered, setHovered] = useState<string | null>(null);

  const enabledTypes = new Set(
    agents.filter((a) => a.enabled).map((a) => a.type),
  );

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar tenantName={tenant?.meta?.name} plan={tenant?.meta?.plan} />

      <main style={{ marginLeft: 260, flex: 1, padding: '40px' }}>
        <p style={{
          fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
          letterSpacing: '0.2em', textTransform: 'uppercase',
          color: 'var(--accent)', marginBottom: 6,
        }}>DEIN TEAM</p>
        <h1 style={{
          fontSize: 28, fontWeight: 900, letterSpacing: '-0.03em',
          color: 'var(--text)', marginBottom: 4,
        }}>Agenten-Übersicht</h1>
        <p style={{
          fontSize: 13, color: 'var(--text-muted)', marginBottom: 32, lineHeight: 1.5,
        }}>
          7 spezialisierte KI-Mitarbeiter — klick auf einen um direkt zu chatten.
        </p>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: 2,
        }}>
          {ALL_AGENTS.map(({ key, name, type }) => {
            const meta = AGENT_META[key]!;
            const isEnabled = type === 'orchestrator' || enabledTypes.has(type) || enabledTypes.size === 0;
            const tasks = (tenant?.agents?.task_summary?.[name] ?? tenant?.agents?.task_summary?.[type]) ?? null;
            const isHov = hovered === key;

            return (
              <div
                key={key}
                onClick={() => router.push(`/agents/${key}`)}
                onMouseEnter={() => setHovered(key)}
                onMouseLeave={() => setHovered(null)}
                style={{
                  background: 'var(--surface)',
                  border: `1px solid ${isHov ? meta.color : 'var(--border)'}`,
                  cursor: 'pointer',
                  transition: 'border-color 0.15s',
                }}
              >
                {/* Agent Header */}
                <div style={{
                  padding: '20px 24px',
                  borderBottom: '1px solid var(--border)',
                  display: 'flex', alignItems: 'center', gap: 14,
                }}>
                  <div style={{
                    width: 40, height: 40, flexShrink: 0,
                    background: isEnabled ? meta.color : 'var(--surface-2)',
                    color: isEnabled ? '#080808' : 'var(--text-muted)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, fontWeight: 900,
                  }}>{meta.initial}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>{name}</span>
                      <span style={{
                        fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700,
                        letterSpacing: '0.12em', textTransform: 'uppercase', color: meta.color,
                      }}>{meta.role}</span>
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3, lineHeight: 1.4 }}>
                      {AGENT_DESCRIPTIONS[key]}
                    </p>
                  </div>
                </div>

                {/* Stats row */}
                <div style={{
                  padding: '12px 24px',
                  display: 'flex', alignItems: 'center', gap: 20,
                  borderBottom: '1px solid var(--border)',
                }}>
                  <Stat label="AUFGABEN" value={tasks ? String(tasks.count) : '—'} />
                  <Stat label="STATUS" value={isEnabled ? 'AKTIV' : 'INAKTIV'} accent={isEnabled} />
                  {tasks && tasks.tasks.length > 0 && (
                    <p style={{
                      flex: 1, fontSize: 11, color: 'var(--text-muted)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>↳ {tasks.tasks[0]}</p>
                  )}
                </div>

                {/* CTA */}
                <div style={{ padding: '12px 24px' }}>
                  <div style={{
                    width: '100%', padding: '10px', textAlign: 'center',
                    background: isHov ? meta.color : 'var(--surface-2)',
                    color: isHov ? '#080808' : 'var(--text-muted)',
                    fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 800,
                    letterSpacing: '0.1em', textTransform: 'uppercase',
                    transition: 'all 0.15s',
                  }}>
                    MIT {name.toUpperCase()} ARBEITEN →
                  </div>
                </div>
              </div>
            );
          })}
        </div>

      </main>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <p style={{
        fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700,
        letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)',
      }}>{label}</p>
      <p style={{
        fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 900,
        color: accent ? 'var(--positive)' : 'var(--text)', marginTop: 2,
      }}>{value}</p>
    </div>
  );
}
