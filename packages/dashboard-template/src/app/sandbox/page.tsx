'use client';

import { useState, useEffect, useRef } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { useDashboardData, AGENT_META } from '@/hooks/useDashboardData';
import {
  fetchProjects, createProject, fetchDeployments, deployProject,
  createSandboxSession, publishSandboxSession, revertSandboxSession,
  sendWidgetRequest, fetchTenantYaml, syncTenantYaml, sendDirectChat,
  type Project, type SandboxSession, type Deployment,
} from '@/lib/api-client';

// ─── Nico color + meta ────────────────────────────────────────────────────────
const NICO = AGENT_META['nico'] ?? { color: '#38BDF8', initial: 'N', role: 'Builder' };

const TEMPLATES = [
  { id: 'gastro',          label: 'Gastronomie' },
  { id: 'handwerk',        label: 'Handwerk' },
  { id: 'handel',          label: 'Handel' },
  { id: 'dienstleistung',  label: 'Dienstleistung' },
  { id: 'landwirtschaft',  label: 'Landwirtschaft' },
  { id: 'gesundheit',      label: 'Gesundheit' },
  { id: 'custom',          label: 'Individuell' },
];

const STATUS_COLOR: Record<string, string> = {
  active:    'var(--positive)',
  live:      'var(--positive)',
  building:  'var(--warning)',
  pending:   'var(--warning)',
  draft:     'var(--text-muted)',
  error:     'var(--negative)',
  published: 'var(--positive)',
  reverted:  'var(--text-muted)',
  success:   'var(--positive)',
  failed:    'var(--negative)',
  running:   'var(--warning)',
};

interface NicoMessage {
  role: 'user' | 'assistant';
  content: string;
}

export default function SandboxPage() {
  const { tenant } = useDashboardData();

  // Projects
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  // Create project form
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSubdomain, setNewSubdomain] = useState('');
  const [newTemplate, setNewTemplate] = useState('custom');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  // Sandbox session
  const [session, setSession] = useState<SandboxSession | null>(null);
  const [startingSession, setStartingSession] = useState(false);

  // Deployments
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [deploying, setDeploying] = useState(false);

  // YAML
  const [yaml, setYaml] = useState('');
  const [loadingYaml, setLoadingYaml] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [yamlTab, setYamlTab] = useState<'yaml' | 'projects'>('yaml');

  // Nico Chat
  const [nicoMessages, setNicoMessages] = useState<NicoMessage[]>([
    {
      role: 'assistant',
      content: `Hallo! Ich bin Nico, dein KI-Baumeister. 🔨\n\nIch kann dir helfen:\n• Neue Projekte planen\n• Widgets und Automationen beschreiben\n• Dein YAML-Profil analysieren\n• Deployment-Probleme lösen\n\nWas möchtest du bauen?`,
    },
  ]);
  const [nicoInput, setNicoInput] = useState('');
  const [nicoTyping, setNicoTyping] = useState(false);
  const [convId, setConvId] = useState<string | undefined>(undefined);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // ─── Load initial data ──────────────────────────────────────────────────────
  useEffect(() => {
    fetchProjects().then(setProjects).finally(() => setLoadingProjects(false));
    fetchTenantYaml().then(setYaml).finally(() => setLoadingYaml(false));
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [nicoMessages, nicoTyping]);

  // ─── Load deployments when project selected ─────────────────────────────────
  useEffect(() => {
    if (selectedProject) {
      fetchDeployments(selectedProject.id).then(setDeployments);
    }
  }, [selectedProject]);

  // ─── Subdomain auto-fill ────────────────────────────────────────────────────
  const handleNameChange = (v: string) => {
    setNewName(v);
    const slug = v.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
    setNewSubdomain(slug);
  };

  // ─── Create project ─────────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!newName.trim() || !newSubdomain.trim()) return;
    setCreating(true);
    setCreateError('');
    try {
      const p = await createProject({ name: newName.trim(), subdomain: newSubdomain.trim(), template: newTemplate });
      setProjects((prev) => [p, ...prev]);
      setSelectedProject(p);
      setShowCreate(false);
      setNewName(''); setNewSubdomain(''); setNewTemplate('custom');
    } catch (e: unknown) {
      setCreateError(e instanceof Error ? e.message : 'Fehler beim Erstellen');
    } finally {
      setCreating(false);
    }
  };

  // ─── Start sandbox session ──────────────────────────────────────────────────
  const handleStartSession = async () => {
    if (!selectedProject) return;
    setStartingSession(true);
    try {
      const s = await createSandboxSession(selectedProject.id);
      setSession(s);
      addNicoMessage(`Sandbox für **${selectedProject.name}** gestartet. Branch: \`${s.branchName}\`\n\nIch bin bereit! Beschreibe was ich bauen soll.`);
    } catch (e: unknown) {
      addNicoMessage(`Fehler beim Starten der Sandbox: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setStartingSession(false);
    }
  };

  // ─── Deploy ─────────────────────────────────────────────────────────────────
  const handleDeploy = async () => {
    if (!selectedProject) return;
    setDeploying(true);
    try {
      const d = await deployProject(selectedProject.id);
      setDeployments((prev) => [d, ...prev]);
      addNicoMessage(`Deployment gestartet! Status: **${d.status}**\n\nDein Projekt wird unter \`${selectedProject.subdomain}.basis.app\` erreichbar sein.`);
    } catch (e: unknown) {
      addNicoMessage(`Deploy-Fehler: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setDeploying(false);
    }
  };

  // ─── Publish / Revert session ───────────────────────────────────────────────
  const handlePublish = async () => {
    if (!session) return;
    await publishSandboxSession(session.id);
    setSession((s) => s ? { ...s, status: 'published' } : s);
    addNicoMessage('Änderungen wurden ins Live-Dashboard übernommen. ✓');
  };

  const handleRevert = async () => {
    if (!session) return;
    await revertSandboxSession(session.id);
    setSession(null);
    addNicoMessage('Sandbox verworfen — keine Änderungen am Live-Dashboard.');
  };

  // ─── Sync YAML ──────────────────────────────────────────────────────────────
  const handleSyncYaml = async () => {
    setSyncing(true);
    try {
      await syncTenantYaml();
      const fresh = await fetchTenantYaml();
      setYaml(fresh);
    } finally {
      setSyncing(false);
    }
  };

  // ─── Nico Chat ──────────────────────────────────────────────────────────────
  const addNicoMessage = (content: string) => {
    setNicoMessages((prev) => [...prev, { role: 'assistant', content }]);
  };

  const handleNicoSend = async () => {
    const msg = nicoInput.trim();
    if (!msg || nicoTyping) return;
    setNicoInput('');
    setNicoMessages((prev) => [...prev, { role: 'user', content: msg }]);
    setNicoTyping(true);

    try {
      // If we have an active sandbox session → try widget request first
      if (session?.status === 'active') {
        const keywords = ['widget', 'baue', 'erstelle', 'füge', 'automatisierung', 'button', 'formular', 'chart', 'tabelle'];
        const isWidgetRequest = keywords.some((k) => msg.toLowerCase().includes(k));
        if (isWidgetRequest) {
          const res = await sendWidgetRequest(session.id, msg);
          setNicoMessages((prev) => [...prev, { role: 'assistant', content: res.message }]);
          setNicoTyping(false);
          return;
        }
      }
      // Otherwise → direct chat with Nico agent
      const res = await sendDirectChat('nico', msg, convId);
      if (res.conversationId) setConvId(res.conversationId);
      setNicoMessages((prev) => [...prev, { role: 'assistant', content: res.reply }]);
    } catch {
      setNicoMessages((prev) => [...prev, { role: 'assistant', content: 'Verbindungsfehler — bitte Backend prüfen.' }]);
    } finally {
      setNicoTyping(false);
    }
  };

  const handleYamlToNico = () => {
    if (!yaml) return;
    const snippet = yaml.slice(0, 800);
    setNicoInput(`Analysiere dieses YAML-Profil und schlage vor, was ich als nächstes bauen sollte:\n\n${snippet}${yaml.length > 800 ? '\n[…]' : ''}`);
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar tenantName={tenant?.meta?.name} plan={tenant?.meta?.plan} />

      {/* ─── Main Layout ─────────────────────────────────────────────────── */}
      <div style={{ marginLeft: 260, flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>

        {/* Header */}
        <div style={{
          padding: '20px 32px', borderBottom: '2px solid var(--accent)',
          display: 'flex', alignItems: 'center', gap: 16,
          background: 'var(--bg)',
        }}>
          <div style={{ width: 8, height: 8, background: 'var(--accent)', animation: 'pulse 1.5s infinite' }} />
          <p style={{
            fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 800,
            letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--accent)',
          }}>BUILD MODE</p>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600,
            letterSpacing: '0.15em', color: 'var(--text-muted)', textTransform: 'uppercase',
          }}>— BAUE MIT NICO</span>
          {session?.status === 'active' && (
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 2 }}>
              <Btn color="var(--positive)" onClick={handlePublish}>✓ VERÖFFENTLICHEN</Btn>
              <Btn color="var(--negative)" onClick={handleRevert} outline>✕ VERWERFEN</Btn>
            </div>
          )}
        </div>

        {/* Three-column body */}
        <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr 380px', flex: 1, overflow: 'hidden' }}>

          {/* ── Col 1: Projects ────────────────────────────────────────── */}
          <div style={{
            borderRight: '1px solid var(--border)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            <div style={{
              padding: '16px 16px 8px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700,
                letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--text-muted)',
              }}>PROJEKTE</span>
              <button
                onClick={() => setShowCreate(true)}
                style={{
                  padding: '4px 10px', background: 'var(--accent)', border: 'none',
                  color: '#080808', fontFamily: 'var(--font-mono)', fontSize: 9,
                  fontWeight: 800, cursor: 'pointer', letterSpacing: '0.08em',
                }}>+ NEU</button>
            </div>

            {/* Project list */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {loadingProjects && (
                <p style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-muted)' }}>Lade…</p>
              )}
              {!loadingProjects && projects.length === 0 && (
                <div style={{ padding: '16px' }}>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    Noch kein Projekt — erstelle dein erstes!
                  </p>
                </div>
              )}
              {projects.map((p) => {
                const isSelected = selectedProject?.id === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => { setSelectedProject(p); setSession(null); }}
                    style={{
                      width: '100%', textAlign: 'left', padding: '12px 16px',
                      border: 'none', cursor: 'pointer',
                      background: isSelected ? 'var(--surface)' : 'transparent',
                      borderLeft: isSelected ? '3px solid var(--accent)' : '3px solid transparent',
                      transition: 'all 0.1s',
                    }}
                  >
                    <p style={{ fontSize: 13, fontWeight: isSelected ? 700 : 500, color: 'var(--text)', marginBottom: 4 }}>
                      {p.name}
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 5, height: 5, background: STATUS_COLOR[p.status] ?? 'var(--text-muted)' }} />
                      <span style={{
                        fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700,
                        letterSpacing: '0.1em', color: 'var(--text-muted)', textTransform: 'uppercase',
                      }}>{p.status}</span>
                    </div>
                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>
                      {p.subdomain}.basis.app
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Col 2: YAML / Project Details ──────────────────────────── */}
          <div style={{
            borderRight: '1px solid var(--border)', display: 'flex',
            flexDirection: 'column', overflow: 'hidden',
          }}>

            {/* Tab bar */}
            <div style={{
              display: 'flex', gap: 0, borderBottom: '1px solid var(--border)',
              padding: '0 0', flexShrink: 0,
            }}>
              {[
                { id: 'yaml',     label: '📄 YAML-PROFIL' },
                { id: 'projects', label: '⚙ PROJEKT' },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setYamlTab(t.id as typeof yamlTab)}
                  style={{
                    padding: '12px 20px', border: 'none', cursor: 'pointer',
                    background: yamlTab === t.id ? 'var(--surface)' : 'transparent',
                    borderBottom: yamlTab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
                    fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
                    letterSpacing: '0.1em', color: yamlTab === t.id ? 'var(--accent)' : 'var(--text-muted)',
                    transition: 'all 0.15s',
                  }}
                >{t.label}</button>
              ))}
            </div>

            {/* ── YAML tab ─────────────────────────────────────────── */}
            {yamlTab === 'yaml' && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {/* YAML toolbar */}
                <div style={{
                  padding: '10px 20px', borderBottom: '1px solid var(--border)',
                  display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
                }}>
                  <p style={{
                    fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600,
                    letterSpacing: '0.1em', color: 'var(--text-muted)', flex: 1,
                  }}>
                    tenant-profile.yaml · {yaml ? `${yaml.split('\n').length} Zeilen` : '—'}
                  </p>
                  <button
                    onClick={handleYamlToNico}
                    style={{
                      padding: '5px 12px', background: 'transparent',
                      border: '1px solid var(--border)', color: 'var(--text-muted)',
                      fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700,
                      cursor: 'pointer', letterSpacing: '0.08em',
                    }}>→ AN NICO</button>
                  <button
                    onClick={handleSyncYaml}
                    disabled={syncing}
                    style={{
                      padding: '5px 12px', background: syncing ? 'var(--surface)' : 'var(--accent)',
                      border: 'none', color: syncing ? 'var(--text-muted)' : '#080808',
                      fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 800,
                      cursor: syncing ? 'default' : 'pointer', letterSpacing: '0.08em',
                    }}>{syncing ? '…SYNC' : '↻ SYNC'}</button>
                </div>
                {/* YAML content */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
                  {loadingYaml ? (
                    <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Lade YAML-Profil…</p>
                  ) : !yaml ? (
                    <div>
                      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
                        Kein YAML-Profil vorhanden. Onboarding abschließen oder manuell synchronisieren.
                      </p>
                      <button
                        onClick={handleSyncYaml}
                        style={{
                          padding: '10px 20px', background: 'var(--accent)', border: 'none',
                          color: '#080808', fontWeight: 800, fontSize: 11,
                          letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer',
                        }}>PROFIL GENERIEREN</button>
                    </div>
                  ) : (
                    <pre style={{
                      fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 1.7,
                      color: 'var(--text)', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                      background: 'transparent', margin: 0,
                    }}>{yaml.split('\n').map((line, i) => {
                      const isKey = /^\s*[a-z_]+:/.test(line) && !line.trim().startsWith('#');
                      const isComment = line.trim().startsWith('#');
                      const isSection = /^[a-z_]+:$/.test(line.trim());
                      return (
                        <span key={i} style={{
                          display: 'block',
                          color: isComment ? 'var(--text-muted)'
                            : isSection ? 'var(--accent)'
                            : isKey ? '#60A5FA'
                            : 'var(--text)',
                        }}>{line}</span>
                      );
                    })}</pre>
                  )}
                </div>
              </div>
            )}

            {/* ── Project tab ───────────────────────────────────────── */}
            {yamlTab === 'projects' && (
              <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>

                {/* Create project form */}
                {showCreate && (
                  <div style={{
                    background: 'var(--surface)', border: '1px solid var(--accent)',
                    padding: '24px', marginBottom: 24,
                  }}>
                    <p style={{
                      fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
                      letterSpacing: '0.15em', color: 'var(--accent)', marginBottom: 20,
                    }}>NEUES PROJEKT</p>

                    <Field label="PROJEKTNAME">
                      <input
                        value={newName}
                        onChange={(e) => handleNameChange(e.target.value)}
                        placeholder="Mein Dashboard"
                        style={inputStyle}
                      />
                    </Field>
                    <Field label="SUBDOMAIN">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input
                          value={newSubdomain}
                          onChange={(e) => setNewSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                          style={{ ...inputStyle, flex: 1 }}
                        />
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                          .basis.app
                        </span>
                      </div>
                    </Field>
                    <Field label="BRANCHEN-TEMPLATE">
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 2 }}>
                        {TEMPLATES.map((t) => (
                          <button
                            key={t.id}
                            onClick={() => setNewTemplate(t.id)}
                            style={{
                              padding: '8px 4px', border: 'none', cursor: 'pointer',
                              background: newTemplate === t.id ? 'var(--accent)' : 'var(--surface-2)',
                              color: newTemplate === t.id ? '#080808' : 'var(--text-muted)',
                              fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700,
                              letterSpacing: '0.05em', textTransform: 'uppercase',
                              transition: 'all 0.15s',
                            }}
                          >{t.label}</button>
                        ))}
                      </div>
                    </Field>

                    {createError && (
                      <p style={{ fontSize: 12, color: 'var(--negative)', marginBottom: 12 }}>{createError}</p>
                    )}

                    <div style={{ display: 'flex', gap: 2, marginTop: 4 }}>
                      <Btn color="var(--accent)" onClick={handleCreate} disabled={creating}>
                        {creating ? 'ERSTELLE…' : 'PROJEKT ERSTELLEN'}
                      </Btn>
                      <Btn color="var(--text-muted)" outline onClick={() => { setShowCreate(false); setCreateError(''); }}>
                        ABBRECHEN
                      </Btn>
                    </div>
                  </div>
                )}

                {/* Selected project details */}
                {selectedProject ? (
                  <div>
                    <div style={{ marginBottom: 24, paddingBottom: 20, borderBottom: '1px solid var(--border)' }}>
                      <p style={{
                        fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700,
                        letterSpacing: '0.15em', color: 'var(--text-muted)', marginBottom: 8,
                      }}>AUSGEWÄHLTES PROJEKT</p>
                      <h2 style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.02em', color: 'var(--text)', marginBottom: 4 }}>
                        {selectedProject.name}
                      </h2>
                      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}>
                        {selectedProject.subdomain}.basis.app · Template: {selectedProject.template}
                      </p>
                    </div>

                    {/* Sandbox controls */}
                    <div style={{ marginBottom: 24 }}>
                      <p style={{
                        fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700,
                        letterSpacing: '0.15em', color: 'var(--text-muted)', marginBottom: 12,
                      }}>SANDBOX</p>
                      {!session ? (
                        <button
                          onClick={handleStartSession}
                          disabled={startingSession}
                          style={{
                            width: '100%', padding: '14px',
                            background: startingSession ? 'var(--surface)' : NICO.color,
                            border: 'none', color: '#080808', cursor: startingSession ? 'default' : 'pointer',
                            fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 800,
                            letterSpacing: '0.1em', textTransform: 'uppercase',
                          }}
                        >{startingSession ? '… SESSION STARTET' : '▶ SANDBOX STARTEN'}</button>
                      ) : (
                        <div style={{ background: 'var(--surface)', padding: '14px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                            <div style={{ width: 8, height: 8, background: STATUS_COLOR[session.status] }} />
                            <span style={{
                              fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700,
                              letterSpacing: '0.1em', color: STATUS_COLOR[session.status],
                            }}>SESSION {session.status.toUpperCase()}</span>
                          </div>
                          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)' }}>
                            Branch: {session.branchName}
                          </p>
                          {session.status === 'active' && (
                            <div style={{ display: 'flex', gap: 2, marginTop: 12 }}>
                              <Btn color="var(--positive)" onClick={handlePublish}>✓ PUBLISH</Btn>
                              <Btn color="var(--negative)" outline onClick={handleRevert}>✕ REVERT</Btn>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Deploy */}
                    <div style={{ marginBottom: 24 }}>
                      <p style={{
                        fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700,
                        letterSpacing: '0.15em', color: 'var(--text-muted)', marginBottom: 12,
                      }}>DEPLOYMENT</p>
                      <button
                        onClick={handleDeploy}
                        disabled={deploying}
                        style={{
                          width: '100%', padding: '14px', border: 'none',
                          background: deploying ? 'var(--surface)' : 'var(--accent)',
                          color: deploying ? 'var(--text-muted)' : '#080808',
                          cursor: deploying ? 'default' : 'pointer',
                          fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 800,
                          letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8,
                        }}
                      >{deploying ? '… DEPLOYING' : '🚀 DEPLOY → LIVE'}</button>

                      {deployments.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {deployments.slice(0, 5).map((d) => (
                            <div key={d.id} style={{
                              display: 'flex', alignItems: 'center', gap: 10,
                              padding: '8px 12px', background: 'var(--surface)',
                            }}>
                              <div style={{ width: 6, height: 6, background: STATUS_COLOR[d.status] ?? 'var(--text-muted)', flexShrink: 0 }} />
                              <span style={{
                                fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)',
                                flex: 1,
                              }}>{new Date(d.startedAt).toLocaleString('de-AT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                              <span style={{
                                fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700,
                                color: STATUS_COLOR[d.status] ?? 'var(--text-muted)', textTransform: 'uppercase',
                              }}>{d.status}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div style={{ paddingTop: 20 }}>
                    <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                      Wähle links ein Projekt aus oder erstelle ein neues.
                    </p>
                    {!showCreate && (
                      <button
                        onClick={() => setShowCreate(true)}
                        style={{
                          marginTop: 16, padding: '12px 24px', background: 'var(--accent)',
                          border: 'none', color: '#080808', fontWeight: 800, fontSize: 11,
                          letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer',
                        }}>+ ERSTES PROJEKT ERSTELLEN</button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Col 3: Nico Chat ────────────────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Nico header */}
            <div style={{
              padding: '14px 20px', borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
            }}>
              <div style={{
                width: 28, height: 28, background: NICO.color, color: '#080808',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 900,
              }}>N</div>
              <div>
                <span style={{ fontWeight: 800, fontSize: 13, color: 'var(--text)' }}>Nico</span>
                <span style={{
                  marginLeft: 8, fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700,
                  letterSpacing: '0.12em', textTransform: 'uppercase', color: NICO.color,
                }}>BUILDER</span>
              </div>
              {session?.status === 'active' && (
                <span style={{
                  marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700,
                  letterSpacing: '0.1em', color: 'var(--positive)',
                }}>● SANDBOX AKTIV</span>
              )}
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
              {nicoMessages.map((msg, i) => {
                const isUser = msg.role === 'user';
                return (
                  <div key={i} style={{
                    display: 'flex', gap: 8, marginBottom: 12,
                    flexDirection: isUser ? 'row-reverse' : 'row',
                  }}>
                    <div style={{
                      width: 22, height: 22, flexShrink: 0,
                      background: isUser ? 'var(--surface-2)' : NICO.color,
                      color: isUser ? 'var(--text)' : '#080808',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 7, fontWeight: 900,
                    }}>{isUser ? 'DU' : 'N'}</div>
                    <div style={{
                      maxWidth: '82%', padding: '9px 13px',
                      background: isUser ? 'var(--accent)' : 'var(--surface)',
                      color: isUser ? '#080808' : 'var(--text)',
                      border: isUser ? 'none' : '1px solid var(--border)',
                      fontSize: 12, lineHeight: 1.6,
                    }}>
                      <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{msg.content}</p>
                    </div>
                  </div>
                );
              })}
              {nicoTyping && (
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <div style={{
                    width: 22, height: 22, background: NICO.color, color: '#080808',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 7, fontWeight: 900,
                  }}>N</div>
                  <div style={{ padding: '9px 13px', background: 'var(--surface)', border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      {[0, 1, 2].map((n) => (
                        <div key={n} style={{
                          width: 5, height: 5, background: NICO.color,
                          animation: `pulse 1.2s infinite ${n * 0.2}s`,
                        }} />
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input */}
            <div style={{ borderTop: '1px solid var(--border)', padding: '12px', flexShrink: 0 }}>
              <textarea
                value={nicoInput}
                onChange={(e) => setNicoInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleNicoSend(); } }}
                placeholder={session?.status === 'active' ? 'Beschreibe ein Widget oder frag Nico…' : 'Frag Nico was zu bauen…'}
                rows={3}
                style={{
                  width: '100%', resize: 'none', padding: '10px 12px',
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  color: 'var(--text)', fontSize: 12, lineHeight: 1.5,
                  boxSizing: 'border-box',
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-muted)' }}>
                  Enter senden · Shift+Enter neue Zeile
                </span>
                <button
                  onClick={handleNicoSend}
                  disabled={!nicoInput.trim() || nicoTyping}
                  style={{
                    padding: '7px 16px', background: NICO.color, border: 'none',
                    color: '#080808', fontFamily: 'var(--font-mono)', fontSize: 9,
                    fontWeight: 800, cursor: 'pointer', letterSpacing: '0.08em',
                    opacity: !nicoInput.trim() || nicoTyping ? 0.4 : 1,
                    transition: 'opacity 0.15s',
                  }}
                >SENDEN →</button>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

// ─── Helper components ────────────────────────────────────────────────────────
function Btn({ children, color, onClick, outline, disabled }: {
  children: React.ReactNode; color: string;
  onClick?: () => void; outline?: boolean; disabled?: boolean;
}) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: '8px 16px', border: outline ? `1px solid ${color}` : 'none',
        background: outline ? (hov ? color : 'transparent') : (hov ? 'var(--text)' : color),
        color: outline ? (hov ? '#080808' : color) : '#080808',
        fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 800,
        letterSpacing: '0.08em', textTransform: 'uppercase',
        cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1,
        transition: 'all 0.15s',
      }}
    >{children}</button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <p style={{
        fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700,
        letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6,
      }}>{label}</p>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 14px', fontSize: 13,
  background: 'var(--surface)', border: '1px solid var(--border)',
  color: 'var(--text)', boxSizing: 'border-box',
};
