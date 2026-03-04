'use client';

import { useState, useEffect } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { useDashboardData, AGENT_META } from '@/hooks/useDashboardData';
import {
  updateTenantName, toggleAgent, fetchMembers,
  type TenantMember,
} from '@/lib/api-client';

export default function SettingsPage() {
  const { tenant, agents, refetch } = useDashboardData();
  const [section, setSection] = useState<'general' | 'agents' | 'team' | 'gdpr'>('general');

  // General
  const [name, setName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);

  // Team
  const [members, setMembers] = useState<TenantMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  // Agent toggles (local optimistic state)
  const [agentToggles, setAgentToggles] = useState<Record<string, boolean>>({});
  const [togglingAgent, setTogglingAgent] = useState<string | null>(null);

  useEffect(() => {
    if (tenant?.meta?.name) setName(tenant.meta.name);
  }, [tenant]);

  useEffect(() => {
    const defaults: Record<string, boolean> = {};
    agents.forEach((a) => { defaults[a.type] = a.enabled; });
    setAgentToggles(defaults);
  }, [agents]);

  useEffect(() => {
    if (section === 'team' && tenant?.id) {
      setLoadingMembers(true);
      fetchMembers(tenant.id)
        .then(setMembers)
        .catch(() => setMembers([]))
        .finally(() => setLoadingMembers(false));
    }
  }, [section, tenant?.id]);

  const handleSaveName = async () => {
    if (!tenant?.id || !name.trim()) return;
    setSavingName(true);
    try {
      await updateTenantName(tenant.id, name.trim());
      refetch();
      setNameSaved(true);
      setTimeout(() => setNameSaved(false), 2000);
    } finally {
      setSavingName(false);
    }
  };

  const handleToggleAgent = async (agentType: string, enabled: boolean) => {
    setTogglingAgent(agentType);
    setAgentToggles((prev) => ({ ...prev, [agentType]: enabled }));
    try {
      await toggleAgent(agentType, enabled);
      refetch();
    } catch {
      setAgentToggles((prev) => ({ ...prev, [agentType]: !enabled }));
    } finally {
      setTogglingAgent(null);
    }
  };

  const SECTIONS = [
    { id: 'general', label: 'Allgemein' },
    { id: 'agents',  label: 'Agenten' },
    { id: 'team',    label: 'Team' },
    { id: 'gdpr',    label: 'DSGVO & Datenschutz' },
  ] as const;

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar tenantName={tenant?.meta?.name} plan={tenant?.meta?.plan} />

      <main style={{ marginLeft: 260, flex: 1, padding: '40px' }}>
        <p style={{
          fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
          letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 6,
        }}>EINSTELLUNGEN</p>
        <h1 style={{
          fontSize: 28, fontWeight: 900, letterSpacing: '-0.03em',
          color: 'var(--text)', marginBottom: 32,
        }}>Konto & Konfiguration</h1>

        <div style={{ display: 'flex', gap: 2, marginBottom: 32 }}>
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              style={{
                padding: '9px 20px', border: 'none', cursor: 'pointer',
                background: section === s.id ? 'var(--accent)' : 'var(--surface)',
                color: section === s.id ? '#080808' : 'var(--text-muted)',
                fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
                letterSpacing: '0.1em', textTransform: 'uppercase',
                transition: 'all 0.15s',
              }}
            >{s.label}</button>
          ))}
        </div>

        {/* ─── General ──────────────────────────────────────────────── */}
        {section === 'general' && (
          <div style={{ maxWidth: 560 }}>
            <SectionTitle>Betriebsname</SectionTitle>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
              Dieser Name erscheint im Dashboard und in Agenten-Berichten.
            </p>
            <div style={{ display: 'flex', gap: 2, marginBottom: 32 }}>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
                style={{
                  flex: 1, padding: '12px 16px', fontSize: 14,
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  color: 'var(--text)',
                }}
              />
              <button
                onClick={handleSaveName}
                disabled={savingName || !name.trim()}
                style={{
                  padding: '12px 24px', border: 'none', cursor: 'pointer',
                  background: nameSaved ? 'var(--positive)' : 'var(--accent)',
                  color: '#080808', fontWeight: 800, fontSize: 11,
                  letterSpacing: '0.08em', textTransform: 'uppercase',
                  opacity: savingName ? 0.6 : 1, transition: 'all 0.15s',
                }}
              >{nameSaved ? '✓ GESPEICHERT' : savingName ? '…' : 'SPEICHERN'}</button>
            </div>

            <SectionTitle>Plan</SectionTitle>
            <div style={{
              padding: '16px 20px', background: 'var(--surface)', border: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', gap: 16,
            }}>
              <div style={{
                width: 10, height: 10,
                background: tenant?.meta?.plan === 'enterprise' ? '#E8FF3A' : tenant?.meta?.plan === 'pro' ? '#A78BFA' : '#60A5FA',
              }} />
              <div>
                <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase' }}>
                  {tenant?.meta?.plan ?? 'Free'}
                </p>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                  {tenant?.meta?.plan === 'starter' ? '10.000 Tokens/Monat' :
                   tenant?.meta?.plan === 'pro'     ? '50.000 Tokens/Monat' :
                   tenant?.meta?.plan === 'enterprise' ? '200.000 Tokens/Monat' : '—'}
                </p>
              </div>
              <button style={{
                marginLeft: 'auto', padding: '8px 18px',
                background: 'var(--surface-2)', border: '1px solid var(--border)',
                color: 'var(--text-muted)', fontFamily: 'var(--font-mono)',
                fontSize: 10, fontWeight: 700, cursor: 'pointer',
              }}>UPGRADE →</button>
            </div>
          </div>
        )}

        {/* ─── Agents ───────────────────────────────────────────────── */}
        {section === 'agents' && (
          <div style={{ maxWidth: 640 }}>
            <SectionTitle>Agenten aktivieren / deaktivieren</SectionTitle>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
              Deaktivierte Agenten nehmen keine Anfragen entgegen und erscheinen nicht im Dashboard.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {agents.filter((a) => a.type !== 'orchestrator').map((agent) => {
                const key = agent.type;
                const meta = AGENT_META[key] ?? { color: '#888', role: key, initial: key[0].toUpperCase() };
                const enabled = agentToggles[key] ?? agent.enabled;
                const isToggling = togglingAgent === key;
                return (
                  <div key={key} style={{
                    display: 'flex', alignItems: 'center', gap: 16,
                    padding: '14px 20px', background: 'var(--surface)',
                    opacity: isToggling ? 0.6 : 1, transition: 'opacity 0.2s',
                  }}>
                    <div style={{
                      width: 32, height: 32, flexShrink: 0,
                      background: enabled ? meta.color : 'var(--surface-2)',
                      color: enabled ? '#080808' : 'var(--text-muted)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 900, transition: 'all 0.2s',
                    }}>{meta.initial}</div>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: enabled ? 'var(--text)' : 'var(--text-muted)' }}>
                        {agent.name}
                      </p>
                      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                        {meta.role.toUpperCase()}{agent.tools && agent.tools.length > 0 ? ` · ${agent.tools.length} TOOLS` : ''}
                      </p>
                    </div>
                    <button
                      onClick={() => handleToggleAgent(key, !enabled)}
                      disabled={isToggling}
                      style={{
                        padding: '7px 18px', border: 'none', cursor: isToggling ? 'default' : 'pointer',
                        background: enabled ? 'var(--positive)' : 'var(--surface-2)',
                        color: enabled ? '#080808' : 'var(--text-muted)',
                        fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 800,
                        letterSpacing: '0.1em', textTransform: 'uppercase',
                        transition: 'all 0.15s',
                      }}
                    >{isToggling ? '…' : enabled ? '● AKTIV' : '○ INAKTIV'}</button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ─── Team ─────────────────────────────────────────────────── */}
        {section === 'team' && (
          <div style={{ maxWidth: 640 }}>
            <SectionTitle>Team-Mitglieder</SectionTitle>
            {loadingMembers ? (
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Lade Mitglieder…</p>
            ) : members.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Noch keine Mitglieder.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {members.map((m) => (
                  <div key={m.id} style={{
                    display: 'flex', alignItems: 'center', gap: 16,
                    padding: '14px 20px', background: 'var(--surface)',
                  }}>
                    <div style={{
                      width: 32, height: 32, flexShrink: 0,
                      background: 'var(--accent)', color: '#080808',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 900,
                    }}>{(m.name ?? m.email)[0].toUpperCase()}</div>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                        {m.name ?? m.email}
                      </p>
                      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{m.email}</p>
                    </div>
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700,
                      letterSpacing: '0.1em', textTransform: 'uppercase',
                      padding: '4px 10px', border: '1px solid var(--border)',
                      color: 'var(--accent)',
                    }}>{m.role}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── GDPR ─────────────────────────────────────────────────── */}
        {section === 'gdpr' && (
          <div style={{ maxWidth: 560 }}>
            <SectionTitle>Datenschutz & DSGVO</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <GdprCard
                title="Daten exportieren"
                description="Vollständiger Export aller gespeicherten Daten (DSGVO Art. 20). Als JSON-Datei."
                action="EXPORT ANFORDERN"
                color="var(--accent)"
                onClick={() => window.open('/api/v1/gdpr/export', '_blank')}
              />
              <GdprCard
                title="Audit-Log anzeigen"
                description="Alle sicherheitsrelevanten Aktionen der letzten 90 Tage."
                action="LOG ÖFFNEN"
                color="var(--text-muted)"
                onClick={() => window.open('/api/v1/gdpr/audit-log', '_blank')}
              />
              <GdprCard
                title="Konto unwiderruflich löschen"
                description="Löscht alle Daten dauerhaft (DSGVO Art. 17). Dieser Vorgang kann nicht rückgängig gemacht werden."
                action="KONTO LÖSCHEN"
                color="var(--negative)"
                danger
              />
            </div>
          </div>
        )}

      </main>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
      letterSpacing: '0.15em', textTransform: 'uppercase',
      color: 'var(--text-muted)', marginBottom: 12,
    }}>{children}</p>
  );
}

function GdprCard({ title, description, action, color, onClick, danger }: {
  title: string; description: string; action: string;
  color: string; onClick?: () => void; danger?: boolean;
}) {
  const [hov, setHov] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const handleClick = () => {
    if (danger && !confirm) { setConfirm(true); return; }
    onClick?.();
    setConfirm(false);
  };

  return (
    <div style={{
      padding: '20px', background: 'var(--surface)',
      borderLeft: `3px solid ${color}`,
      display: 'flex', alignItems: 'center', gap: 20,
    }}>
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>{title}</p>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>{description}</p>
        {confirm && (
          <p style={{ fontSize: 12, color: 'var(--negative)', marginTop: 8, fontWeight: 700 }}>
            ⚠ Nochmal klicken zum Bestätigen
          </p>
        )}
      </div>
      <button
        onClick={handleClick}
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => { setHov(false); setConfirm(false); }}
        style={{
          padding: '9px 18px', border: `1px solid ${color}`,
          background: hov ? color : 'transparent',
          color: hov ? '#080808' : color,
          fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 800,
          letterSpacing: '0.1em', textTransform: 'uppercase',
          cursor: 'pointer', flexShrink: 0, transition: 'all 0.15s',
        }}
      >{confirm ? 'WIRKLICH? →' : action}</button>
    </div>
  );
}
