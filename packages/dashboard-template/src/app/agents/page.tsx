'use client';

import { useState } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { AgentChat } from '@/components/AgentChat';
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
  const [selected, setSelected] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);

  const openChat = (key: string) => {
    setSelected(key);
    setChatOpen(true);
  };

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
          gridTemplateColumns: chatOpen ? '1fr' : 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: 2,
          transition: 'all 0.3s',
        }}>
          {ALL_AGENTS.map(({ key, name, type }) => {
            const meta = AGENT_META[key]!;
            const isEnabled = type === 'orchestrator' || enabledTypes.has(type) || enabledTypes.size === 0;
            const tasks = (tenant?.agents?.task_summary?.[name] ?? tenant?.agents?.task_summary?.[type]) ?? null;
            const isSelected = selected === key;

            return (
              <div
                key={key}
                style={{
                  background: 'var(--surface)',
                  border: `1px solid ${isSelected ? meta.color : 'var(--border)'}`,
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

                {/* Chat button */}
                <div style={{ padding: '12px 24px' }}>
                  <button
                    onClick={() => isSelected && chatOpen ? setChatOpen(false) : openChat(key)}
                    style={{
                      width: '100%', padding: '10px',
                      background: isSelected && chatOpen ? 'var(--surface-2)' : meta.color,
                      color: isSelected && chatOpen ? 'var(--text-muted)' : '#080808',
                      border: 'none', cursor: 'pointer',
                      fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 800,
                      letterSpacing: '0.1em', textTransform: 'uppercase',
                      transition: 'all 0.15s',
                    }}
                  >
                    {isSelected && chatOpen ? '● CHAT OFFEN' : `MIT ${name.toUpperCase()} CHATTEN →`}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* ─── Inline Chat Panel ─────────────────────────────────────── */}
        {chatOpen && selected && (
          <div style={{
            position: 'fixed', bottom: 0, left: 260, right: 0,
            height: '50vh', background: 'var(--bg)',
            borderTop: `2px solid ${AGENT_META[selected]?.color ?? 'var(--accent)'}`,
            zIndex: 50, display: 'flex', flexDirection: 'column',
          }}>
            <div style={{
              padding: '10px 24px', borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <div style={{
                width: 8, height: 8,
                background: AGENT_META[selected]?.color ?? 'var(--accent)',
                animation: 'pulse 1.5s infinite',
              }} />
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600,
                letterSpacing: '0.2em', textTransform: 'uppercase',
                color: AGENT_META[selected]?.color ?? 'var(--accent)',
              }}>
                CHAT MIT {ALL_AGENTS.find((a) => a.key === selected)?.name.toUpperCase()}
              </span>
              <button
                onClick={() => setChatOpen(false)}
                style={{
                  marginLeft: 'auto', background: 'transparent',
                  border: '1px solid var(--border)', color: 'var(--text-muted)',
                  padding: '4px 12px', fontFamily: 'var(--font-mono)',
                  fontSize: 10, fontWeight: 700, cursor: 'pointer',
                }}
              >SCHLIESSEN ✕</button>
            </div>
            <div style={{ flex: 1 }}>
              <AgentChat
                agentName={ALL_AGENTS.find((a) => a.key === selected)?.name}
              />
            </div>
          </div>
        )}

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
