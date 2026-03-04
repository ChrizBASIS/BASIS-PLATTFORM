'use client';

import { useState, useEffect } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { AgentDesk } from '@/components/AgentDesk';
import { AgentChat } from '@/components/AgentChat';
import { OnboardingWizard } from '@/components/OnboardingWizard';
import { TokenMeter } from '@/components/TokenMeter';
import { useTheme } from '@/components/ThemeProvider';
import { useDashboardData, AGENT_META } from '@/hooks/useDashboardData';

// ─── Derive desk data from real API tasks ────────────────────────────────────
type Priority = 'high' | 'medium' | 'low';
type DeskStatus = 'working' | 'idle' | 'waiting';

const PRIORITY_MAP: Record<string, Priority> = {
  high: 'high', urgent: 'high', medium: 'medium', normal: 'medium', low: 'low',
};

function taskToPriority(p: string): Priority {
  return PRIORITY_MAP[p?.toLowerCase()] ?? 'medium';
}

// Map agent display name → type key
function agentNameToKey(name: string): string {
  return name.toLowerCase().replace(/\s.*/, '');
}

export default function DashboardPage() {
  const { theme, toggle } = useTheme();
  const { tenant, agents, tokens, loading, error, refetch } = useDashboardData();
  const [chatOpen, setChatOpen] = useState(false);
  const [chatAgent, setChatAgent] = useState<string | null>(null);
  const [themeHov, setThemeHov] = useState(false);
  const [buildHov, setBuildHov] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [onboardingHov, setOnboardingHov] = useState(false);

  // Auto-open wizard on first visit when no tasks exist
  useEffect(() => {
    if (!loading && !error && tenant && (tenant.tasks?.length ?? 0) === 0) {
      setOnboardingOpen(true);
    }
  }, [loading, error, tenant]);

  const openChat = (agentName: string) => {
    setChatAgent(agentName);
    setChatOpen(true);
  };

  // ─── Build agent desks from real API tasks ──────────────────────────────
  const enabledAgentTypes = tenant?.agents?.enabled ?? [];
  const tasks = tenant?.tasks ?? [];

  const DESK_ORDER = ['marie', 'tom', 'clara', 'marco', 'alex', 'nico'];

  const agentDesks = DESK_ORDER
    .filter((key) => {
      const meta = AGENT_META[key];
      return enabledAgentTypes.length === 0 ||
        enabledAgentTypes.some((n) => n.toLowerCase().includes(meta?.role?.toLowerCase() ?? key) || n.toLowerCase().includes(key));
    })
    .map((key) => {
      const meta = AGENT_META[key];
      const agentTasks = tasks.filter((t) => agentNameToKey(t.assigned_agent) === key);
      const pendingTasks = agentTasks.filter((t) => t.status === 'pending' || t.status === 'in_progress');
      const hasPending = pendingTasks.length > 0;
      const status: DeskStatus = hasPending ? 'working' : 'idle';
      const postIts = agentTasks.slice(0, 3).map((t) => ({
        text: t.title.length > 22 ? t.title.slice(0, 22) + '…' : t.title,
        priority: taskToPriority(t.priority),
      }));
      // Matching agent info from API list
      const agentInfo = agents.find((a) => a.type === key);
      return {
        name: agentInfo?.name ?? meta?.role ?? key,
        role: meta?.role ?? key,
        initial: meta?.initial ?? key[0].toUpperCase(),
        color: meta?.color ?? '#888',
        status,
        postIts,
        lastAction: agentTasks[0] ? agentTasks[0].title : undefined,
      };
    });

  // ─── Lena's briefing from real tasks ───────────────────────────────────
  const agentSummaries = Object.entries(tenant?.agents?.task_summary ?? {}).slice(0, 4);

  // ─── Status bar ────────────────────────────────────────────────────────
  const totalTasks = tasks.length;
  const doneTasks = tasks.filter((t) => t.status === 'done' || t.status === 'completed').length;
  const enabledCount = enabledAgentTypes.length || agents.filter((a) => a.enabled).length;
  const totalTokensFmt = tokens
    ? tokens.total_tokens >= 1000
      ? `${(tokens.total_tokens / 1000).toFixed(1)}k`
      : String(tokens.total_tokens)
    : '—';

  const today = new Date().toLocaleDateString('de-AT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar tenantName={tenant?.meta?.name} plan={tenant?.meta?.plan} />

      <main style={{ marginLeft: 260, flex: 1, padding: '28px 40px 120px' }}>

        {/* ═══ Top Bar: Tenant + Buttons ═══ */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 24,
          paddingBottom: 20,
          borderBottom: '1px solid var(--border)',
        }}>
          <div>
            <p style={{
              fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
              letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--accent)',
              marginBottom: 4,
            }}>DEIN BÜRO</p>
            <h1 style={{
              fontSize: 28, fontWeight: 900, letterSpacing: '-0.03em',
              color: 'var(--text)', lineHeight: 1,
            }}>{tenant?.meta?.name ?? 'Lädt…'}</h1>
            <p style={{
              fontFamily: 'var(--font-mono)', fontSize: 10,
              color: 'var(--text-muted)', marginTop: 6, letterSpacing: '0.05em',
            }}>{today}</p>
          </div>
          <div style={{ display: 'flex', gap: 2 }}>
            <button
              onClick={toggle}
              onMouseEnter={() => setThemeHov(true)}
              onMouseLeave={() => setThemeHov(false)}
              style={{
                background: themeHov ? 'var(--surface-2)' : 'var(--surface)',
                border: '1px solid var(--border)', color: 'var(--text)',
                padding: '10px 18px', fontFamily: 'var(--font-mono)',
                fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
                textTransform: 'uppercase', cursor: 'pointer', transition: 'all 0.15s',
              }}
            >{theme === 'dark' ? '☀ LIGHT' : '● DARK'}</button>
            <button
              onClick={() => setOnboardingOpen(true)}
              onMouseEnter={() => setOnboardingHov(true)}
              onMouseLeave={() => setOnboardingHov(false)}
              style={{
                background: onboardingHov ? 'var(--surface-2)' : 'var(--surface)',
                border: '1px solid var(--border)', color: 'var(--text)',
                padding: '10px 18px', fontFamily: 'var(--font-mono)',
                fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
                textTransform: 'uppercase', cursor: 'pointer', transition: 'all 0.15s',
              }}
            >⚙ ONBOARDING</button>
            <button
              onMouseEnter={() => setBuildHov(true)}
              onMouseLeave={() => setBuildHov(false)}
              style={{
                background: buildHov ? 'var(--text)' : 'var(--accent)',
                color: 'var(--on-accent)', border: 'none',
                padding: '10px 22px', fontWeight: 800, fontSize: 11,
                letterSpacing: '0.08em', textTransform: 'uppercase',
                cursor: 'pointer', transition: 'all 0.15s',
                display: 'flex', alignItems: 'center', gap: 8,
              }}
            >
              <span style={{ width: 5, height: 5, background: 'var(--on-accent)', animation: 'pulse 1.5s infinite' }} />
              BUILD MODE
            </button>
          </div>
        </div>

        {/* ═══ Lena's Briefing ═══ */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 20 }}>
          <div style={{
            width: 44, height: 44, background: 'var(--accent)', color: 'var(--on-accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, fontWeight: 900, flexShrink: 0,
          }}>L</div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--text)' }}>Lena</span>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600,
                letterSpacing: '0.15em', color: 'var(--accent)',
              }}>ORCHESTRATORIN</span>
            </div>
            <div style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              padding: '14px 18px', fontSize: 13, lineHeight: 1.65, color: 'var(--text)',
            }}>
              {loading && <p style={{ color: 'var(--text-muted)' }}>Lade Daten…</p>}
              {error && <p style={{ color: 'var(--negative)' }}>API nicht erreichbar — bitte Backend starten.</p>}
              {!loading && !error && (
                <>
                  <p style={{ marginBottom: 10 }}>Guten Morgen! Hier ist dein Tages-Update:</p>
                  {agentSummaries.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {agentSummaries.map(([agentName, info]) => {
                        const key = agentNameToKey(agentName);
                        const meta = AGENT_META[key] ?? { color: '#888' };
                        return (
                          <BriefingItem
                            key={agentName}
                            agent={agentName}
                            color={meta.color}
                            text={`${info.count} Aufgabe${info.count !== 1 ? 'n' : ''}: ${info.tasks.slice(0, 2).join(', ')}${info.tasks.length > 2 ? ' …' : ''}`}
                          />
                        );
                      })}
                    </div>
                  ) : (
                    <p style={{ color: 'var(--text-muted)' }}>
                    Noch keine Aufgaben zugewiesen —{' '}
                    <span
                      onClick={() => setOnboardingOpen(true)}
                      style={{ color: 'var(--accent)', cursor: 'pointer', fontWeight: 700 }}
                    >Onboarding starten →</span>
                  </p>
                  )}
                  <p
                    onClick={() => openChat('Lena')}
                    style={{ marginTop: 10, fontWeight: 700, color: 'var(--accent)', cursor: 'pointer' }}
                  >→ Schreib mir wenn du etwas brauchst</p>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ═══ Status Bar ═══ */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 2, marginBottom: 20 }}>
          {[
            { label: 'AGENTEN ONLINE', value: enabledCount ? `${enabledCount}/7` : '—' },
            { label: 'AUFGABEN GESAMT', value: String(totalTasks || '—') },
            { label: 'ERLEDIGT', value: String(doneTasks || '—') },
            { label: 'TOKENS MONAT', value: totalTokensFmt },
          ].map((s) => (
            <div key={s.label} style={{
              background: 'var(--surface)', padding: '10px 16px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600,
                letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)',
              }}>{s.label}</span>
              <span style={{ fontSize: 18, fontWeight: 900, letterSpacing: '-0.03em', color: 'var(--text)' }}>
                {s.value}
              </span>
            </div>
          ))}
        </div>

        {/* ═══ Agent Desks ═══ */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
        }}>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
            letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--accent)',
          }}>DEIN TEAM</span>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)',
            letterSpacing: '0.08em',
          }}>— KLICK ZUM CHATTEN</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2, marginBottom: 2 }}>
          {agentDesks.map((desk) => (
            <AgentDesk key={desk.name} {...desk} onClick={() => openChat(desk.name)} />
          ))}
          {loading && Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              height: 160, opacity: 0.4,
            }} />
          ))}
        </div>

        {/* ═══ Token Meter ═══ */}
        {tokens && (
          <div style={{ marginTop: 20 }}>
            <TokenMeter
              used={tokens.total_tokens}
              limit={tokens.limit}
              agents={tokens.agents.map((a) => ({ name: a.agent, tokens: a.tokens }))}
              period={tokens.period.label}
            />
          </div>
        )}

        {/* ═══ Chat Panel ═══ */}
        {chatOpen && (
          <div style={{
            position: 'fixed', bottom: 0, left: 260, right: 0,
            height: '50vh', background: 'var(--bg)',
            borderTop: '2px solid var(--accent)', zIndex: 50,
            display: 'flex', flexDirection: 'column',
          }}>
            <div style={{
              padding: '10px 24px', borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <div style={{ width: 6, height: 6, background: 'var(--positive)', animation: 'pulse 1.5s infinite' }} />
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600,
                letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--accent)',
              }}>{chatAgent ? `CHAT MIT ${chatAgent.toUpperCase()}` : 'DEIN TEAM'}</span>
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
            <div style={{ flex: 1 }}><AgentChat agentName={chatAgent ?? undefined} /></div>
          </div>
        )}

      </main>

      {/* ═══ Onboarding Wizard ═══ */}
      {onboardingOpen && (
        <OnboardingWizard
          onComplete={() => {
            setOnboardingOpen(false);
            refetch();
          }}
          onClose={() => setOnboardingOpen(false)}
        />
      )}

    </div>
  );
}

function BriefingItem({ agent, color, text }: { agent: string; color: string; text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{
        width: 20, height: 20, flexShrink: 0, background: color, color: '#080808',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 9, fontWeight: 800,
      }}>{agent[0]}</div>
      <span style={{ fontSize: 12 }}>
        <strong style={{ color }}>{agent}</strong> {text}
      </span>
    </div>
  );
}
