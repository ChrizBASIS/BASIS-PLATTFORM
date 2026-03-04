'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Sidebar } from '@/components/Sidebar';
import { useDashboardData, AGENT_META } from '@/hooks/useDashboardData';
import {
  streamChat, sendDirectChat, AGENT_TYPE_MAP,
  fetchWidgets, fetchLatestConversation,
  type Widget,
} from '@/lib/api-client';

// ─── Agent definitions ───────────────────────────────────────────────────────
const AGENTS: Record<string, { name: string; type: string; description: string; contextLabel: string }> = {
  lena:  { name: 'Lena',  type: 'orchestrator', description: 'Orchestratorin — koordiniert alle Agenten', contextLabel: 'TEAM-ÜBERSICHT' },
  marie: { name: 'Marie', type: 'sekretariat',  description: 'E-Mails, Termine, Korrespondenz', contextLabel: 'KORRESPONDENZ' },
  tom:   { name: 'Tom',   type: 'backoffice',   description: 'Dokumente, Personal, Organisation', contextLabel: 'DOKUMENTE' },
  clara: { name: 'Clara', type: 'finance',      description: 'Rechnungen, Buchhaltung, Finanzen', contextLabel: 'FINANZEN' },
  marco: { name: 'Marco', type: 'marketing',    description: 'Social Media, Newsletter, Kampagnen', contextLabel: 'MARKETING' },
  alex:  { name: 'Alex',  type: 'support',      description: 'Kundenanfragen, Bewertungen, Tickets', contextLabel: 'SUPPORT' },
  nico:  { name: 'Nico',  type: 'builder',      description: 'Widgets, Dashboards, Automatisierungen', contextLabel: 'BUILD MODE' },
};

interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  content: string;
  agentName?: string;
  streaming?: boolean;
}

interface Job {
  id: string;
  status: 'pending' | 'working' | 'done' | 'error';
  request: string;
  result?: string;
  category: 'crm' | 'marketing' | 'support' | 'finance' | 'widget' | 'general';
  startedAt: Date;
  completedAt?: Date;
}

export default function AgentDetailPage() {
  const { tenant } = useDashboardData();
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;
  const agent = AGENTS[slug];
  const meta = AGENT_META[slug];

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [convId, setConvId] = useState<string | undefined>();
  const [loadingHistory, setLoadingHistory] = useState(true);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Job tracker state
  const [jobs, setJobs] = useState<Job[]>([]);
  const [widgets, setWidgets] = useState<Widget[]>([]);

  // Load last conversation or show greeting
  useEffect(() => {
    if (!agent) return;
    setLoadingHistory(true);

    fetchLatestConversation(agent.type).then((conv) => {
      if (conv && Array.isArray(conv.messages) && conv.messages.length > 0) {
        // Restore chat history
        const restored: ChatMessage[] = conv.messages.map((m, i) => ({
          id: `hist-${i}`,
          role: m.role === 'user' ? 'user' : 'agent',
          content: m.content,
          agentName: m.agentName ?? agent.name,
        }));
        setMessages(restored);
        setConvId(conv.id);
      } else {
        // No history — show greeting
        const greeting = slug === 'lena'
          ? 'Hallo! Ich bin Lena, deine Orchestratorin. Ich koordiniere das gesamte Team. Was kann ich für dich tun?'
          : `Hallo! Ich bin ${agent.name}. ${agent.description}. Wie kann ich dir helfen?`;
        setMessages([{ id: '0', role: 'agent', content: greeting, agentName: agent.name }]);
      }
    }).catch(() => {
      const greeting = `Hallo! Ich bin ${agent.name}. Wie kann ich dir helfen?`;
      setMessages([{ id: '0', role: 'agent', content: greeting, agentName: agent.name }]);
    }).finally(() => setLoadingHistory(false));
  }, [slug, agent]);

  // Load widgets for context (for Nico)
  useEffect(() => {
    if (slug === 'nico') {
      fetchWidgets().then(setWidgets).catch(() => {});
    }
  }, [slug]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Categorize a reply into a job category
  const categorizeReply = useCallback((reply: string): Job['category'] => {
    if (/rechnung|invoice|FATT|buchhaltung|umsatz/i.test(reply)) return 'finance';
    if (/kontakt|contact|kunde|deal|angebot|pipeline/i.test(reply)) return 'crm';
    if (/widget|veröffentlicht|menü|dashboard/i.test(reply)) return 'widget';
    if (/social.?media|instagram|facebook|post|newsletter|kampagne/i.test(reply)) return 'marketing';
    if (/ticket|bewertung|kundenanfrage|support/i.test(reply)) return 'support';
    return 'general';
  }, []);

  // Complete a job with result
  const completeJob = useCallback((jobId: string, reply: string) => {
    const cat = categorizeReply(reply);
    setJobs((prev) => prev.map((j) =>
      j.id === jobId
        ? { ...j, status: 'done', result: reply, category: cat, completedAt: new Date() }
        : j,
    ));
    // Refresh widgets if Nico published something
    if (slug === 'nico' && /veröffentlicht|published|menü/i.test(reply)) {
      fetchWidgets().then(setWidgets).catch(() => {});
    }
  }, [slug, categorizeReply]);

  // Mark a job as error
  const failJob = useCallback((jobId: string) => {
    setJobs((prev) => prev.map((j) =>
      j.id === jobId
        ? { ...j, status: 'error', result: 'Verbindungsfehler', completedAt: new Date() }
        : j,
    ));
  }, []);

  // Map tool names to job categories
  const toolToCategory = (tool: string): Job['category'] => {
    if (/crm_contacts|crm_deals/i.test(tool)) return 'crm';
    if (/crm_invoices|crm_summary/i.test(tool)) return 'finance';
    if (/widget|publish/i.test(tool)) return 'widget';
    return 'general';
  };

  const TOOL_LABELS: Record<string, string> = {
    search_crm_contacts: 'CRM-Kontakte durchsuchen',
    get_crm_deals: 'Deals abrufen',
    get_crm_invoices: 'Rechnungen abrufen',
    get_crm_summary: 'CRM-Zusammenfassung',
    publish_widget_to_menu: 'Widget veröffentlichen',
    list_widgets: 'Widgets auflisten',
    ask_agent: 'Agent-Anfrage',
    check_agent_status: 'Agent-Status',
  };

  const AGENT_NAMES: Record<string, string> = {
    sekretariat: 'Marie', backoffice: 'Tom', finance: 'Clara',
    marketing: 'Marco', support: 'Alex', builder: 'Nico',
  };

  // Add a sub-job for a tool call
  const addToolJob = useCallback((tool: string, args: Record<string, unknown>) => {
    const isDelegation = tool === 'ask_agent';
    const agentTarget = isDelegation ? (args.agent as string) : undefined;
    const label = isDelegation && agentTarget
      ? `Delegation → ${AGENT_NAMES[agentTarget] ?? agentTarget}`
      : TOOL_LABELS[tool] ?? tool;
    const cat = isDelegation && agentTarget
      ? toolToCategory(`crm_${agentTarget}`) // rough category from agent type
      : toolToCategory(tool);

    setJobs((prev) => [{
      id: crypto.randomUUID(),
      status: 'done',
      request: label,
      category: isDelegation ? 'general' : cat,
      startedAt: new Date(),
      completedAt: new Date(),
      result: isDelegation && args.task ? String(args.task) : (
        Object.keys(args).length > 0 ? JSON.stringify(args) : undefined
      ),
    }, ...prev]);
  }, []);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    setSending(true);

    const userMsgId = crypto.randomUUID();
    const replyId = crypto.randomUUID();
    setMessages((prev) => [...prev, { id: userMsgId, role: 'user', content: text }]);

    // Create job
    const jobId = crypto.randomUUID();
    setJobs((prev) => [{
      id: jobId,
      status: 'working',
      request: text,
      category: 'general',
      startedAt: new Date(),
    }, ...prev]);

    const agentType = agent?.type ?? 'orchestrator';
    const isOrchestrator = agentType === 'orchestrator';

    if (isOrchestrator) {
      // SSE Streaming
      setMessages((prev) => [...prev, {
        id: replyId, role: 'agent', agentName: 'Lena', content: '', streaming: true,
      }]);

      try {
        let fullContent = '';
        let finalAgentName = 'Lena';
        for await (const event of streamChat(text, convId)) {
          if (event.type === 'agent') {
            finalAgentName = event.agentName;
            setMessages((prev) => prev.map((m) =>
              m.id === replyId ? { ...m, agentName: event.agentName } : m,
            ));
          } else if (event.type === 'tool_call') {
            addToolJob(event.tool, event.args);
          } else if (event.type === 'delta') {
            fullContent += event.content;
            setMessages((prev) => prev.map((m) =>
              m.id === replyId ? { ...m, content: m.content + event.content } : m,
            ));
          } else if (event.type === 'done') {
            setConvId(event.conversationId);
            setMessages((prev) => prev.map((m) =>
              m.id === replyId ? { ...m, streaming: false } : m,
            ));
          } else if (event.type === 'error') {
            setMessages((prev) => prev.map((m) =>
              m.id === replyId ? { ...m, content: `Fehler: ${event.message}`, streaming: false } : m,
            ));
          }
        }
        // Complete job
        if (fullContent) completeJob(jobId, fullContent);
      } catch {
        setMessages((prev) => prev.map((m) =>
          m.id === replyId ? { ...m, content: 'Verbindungsfehler — Backend prüfen.', streaming: false } : m,
        ));
        failJob(jobId);
      }
    } else {
      // Direct chat (non-streaming)
      setMessages((prev) => [...prev, {
        id: replyId, role: 'agent', agentName: agent?.name, content: '', streaming: true,
      }]);

      try {
        const res = await sendDirectChat(agentType, text, convId);
        if (res.conversationId) setConvId(res.conversationId);
        setMessages((prev) => prev.map((m) =>
          m.id === replyId ? { ...m, agentName: res.agentName, content: res.reply, streaming: false } : m,
        ));
        // Show tool calls as sub-jobs
        if (res.metadata?.toolCalls) {
          for (const tc of res.metadata.toolCalls) {
            addToolJob(tc.name, tc.args);
          }
        }
        completeJob(jobId, res.reply);
      } catch {
        setMessages((prev) => prev.map((m) =>
          m.id === replyId ? { ...m, content: 'Verbindungsfehler — Backend prüfen.', streaming: false } : m,
        ));
        failJob(jobId);
      }
    }

    setSending(false);
  };

  // 404 for invalid slugs
  if (!agent || !meta) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh' }}>
        <Sidebar tenantName={tenant?.meta?.name} plan={tenant?.meta?.plan} />
        <main style={{ marginLeft: 260, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 40, marginBottom: 16 }}>🤷</p>
            <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>Agent nicht gefunden</p>
            <button onClick={() => router.push('/agents')} style={{
              padding: '8px 16px', background: 'var(--accent)', border: 'none', color: '#080808',
              fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 800, cursor: 'pointer',
            }}>← ZURÜCK</button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
      <Sidebar tenantName={tenant?.meta?.name} plan={tenant?.meta?.plan} />

      <main style={{
        marginLeft: 260, flex: 1, display: 'flex', flexDirection: 'column',
        height: '100vh', overflow: 'hidden',
      }}>
        {/* Header bar */}
        <div style={{
          height: 56, borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', padding: '0 24px', gap: 14,
          flexShrink: 0,
        }}>
          <button onClick={() => router.push('/agents')} style={{
            padding: '5px 12px', background: 'transparent',
            border: '1px solid var(--border)', color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700,
            cursor: 'pointer', letterSpacing: '0.08em',
          }}>← ALLE</button>

          <div style={{
            width: 32, height: 32, background: meta.color, color: '#080808',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 900,
          }}>{meta.initial}</div>

          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>{agent.name}</span>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700,
                letterSpacing: '0.12em', textTransform: 'uppercase', color: meta.color,
              }}>{meta.role}</span>
            </div>
          </div>

          {convId && (
            <button
              onClick={() => {
                setConvId(undefined);
                setMessages([{
                  id: '0', role: 'agent', content: `Hallo! Ich bin ${agent.name}. ${agent.description}. Wie kann ich dir helfen?`,
                  agentName: agent.name,
                }]);
                setJobs([]);
              }}
              style={{
                padding: '5px 12px', background: 'transparent',
                border: '1px solid var(--border)', color: 'var(--text-muted)',
                fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700,
                cursor: 'pointer', letterSpacing: '0.08em',
              }}
            >+ NEUER CHAT</button>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 6, height: 6, background: 'var(--positive)' }} />
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700,
              letterSpacing: '0.12em', color: 'var(--positive)',
            }}>ONLINE</span>
          </div>
        </div>

        {/* Main content: Chat left + Context right */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

          {/* ─── Chat Panel (left, 50%) ───────────────────────────────── */}
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            borderRight: '1px solid var(--border)', minWidth: 0,
          }}>
            {/* Messages */}
            <div style={{
              flex: 1, overflowY: 'auto', padding: '20px 24px',
              display: 'flex', flexDirection: 'column', gap: 12,
            }}>
              {messages.map((msg) => {
                const isUser = msg.role === 'user';
                const mColor = meta.color;
                return (
                  <div key={msg.id} style={{
                    display: 'flex', gap: 10,
                    flexDirection: isUser ? 'row-reverse' : 'row',
                  }}>
                    <div style={{
                      width: 28, height: 28, flexShrink: 0,
                      background: isUser ? 'var(--surface-2)' : mColor,
                      color: isUser ? 'var(--text)' : '#080808',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 9, fontWeight: 900,
                    }}>{isUser ? 'DU' : meta.initial}</div>
                    <div style={{
                      maxWidth: '80%', padding: '10px 14px',
                      background: isUser ? 'var(--accent)' : 'var(--surface)',
                      color: isUser ? '#080808' : 'var(--text)',
                      border: isUser ? 'none' : '1px solid var(--border)',
                      fontSize: 13, lineHeight: 1.65,
                    }}>
                      {msg.agentName && !isUser && (
                        <p style={{
                          fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700,
                          letterSpacing: '0.15em', textTransform: 'uppercase',
                          color: mColor, marginBottom: 5,
                        }}>{msg.agentName.toUpperCase()}</p>
                      )}
                      {msg.streaming && !msg.content ? (
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center', height: 20 }}>
                          {[0, 1, 2].map((i) => (
                            <span key={i} style={{
                              width: 5, height: 5, background: mColor,
                              animation: `agentDot 1.2s ${i * 0.2}s infinite ease-in-out`,
                            }} />
                          ))}
                        </div>
                      ) : (
                        <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
                          {msg.content}
                          {msg.streaming && <span style={{ opacity: 0.4 }}>▋</span>}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={chatEndRef} />
            </div>

            {/* Input */}
            <div style={{ borderTop: '1px solid var(--border)', padding: '12px 20px', flexShrink: 0 }}>
              <div style={{ display: 'flex', gap: 2 }}>
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  placeholder={`Schreib ${agent.name} eine Nachricht…`}
                  rows={2}
                  disabled={sending}
                  style={{
                    flex: 1, padding: '10px 14px', fontSize: 13, resize: 'none',
                    background: 'var(--surface)', border: '1px solid var(--border)',
                    color: 'var(--text)', lineHeight: 1.5, boxSizing: 'border-box',
                    opacity: sending ? 0.6 : 1,
                  }}
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || sending}
                  style={{
                    padding: '10px 20px', background: meta.color, border: 'none',
                    color: '#080808', fontFamily: 'var(--font-mono)', fontSize: 10,
                    fontWeight: 800, letterSpacing: '0.08em', cursor: 'pointer',
                    opacity: !input.trim() || sending ? 0.4 : 1,
                    transition: 'opacity 0.15s', alignSelf: 'stretch',
                  }}
                >{sending ? '…' : 'SENDEN →'}</button>
              </div>
              <p style={{
                fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-muted)',
                marginTop: 4,
              }}>Enter senden · Shift+Enter neue Zeile</p>
            </div>
          </div>

          {/* ─── Job Panel (right, 50%) ────────────────────────────────── */}
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            overflow: 'hidden', minWidth: 0,
          }}>
            {/* Panel header */}
            <div style={{
              padding: '14px 20px', borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <div style={{ width: 6, height: 6, background: meta.color }} />
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
                letterSpacing: '0.15em', color: 'var(--text)', flex: 1,
              }}>{agent.contextLabel}</span>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 600,
                color: 'var(--text-muted)',
              }}>{jobs.filter((j) => j.status === 'working').length > 0
                ? `${jobs.filter((j) => j.status === 'working').length} AKTIV`
                : `${jobs.length} AUFGABEN`
              }</span>
            </div>

            {/* Job feed */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
              {/* Nico: widget list */}
              {slug === 'nico' && widgets.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <p style={{
                    fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700,
                    letterSpacing: '0.15em', color: 'var(--text-muted)', marginBottom: 8,
                  }}>WIDGETS</p>
                  {widgets.map((w) => (
                    <div key={w.id} style={{
                      padding: '8px 12px', background: 'var(--surface)',
                      border: '1px solid var(--border)', marginBottom: 2,
                      display: 'flex', alignItems: 'center', gap: 8,
                    }}>
                      <div style={{
                        width: 6, height: 6,
                        background: w.status === 'published' ? 'var(--positive)' : 'var(--warning)',
                      }} />
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', flex: 1 }}>{w.title}</span>
                      <span style={{
                        fontFamily: 'var(--font-mono)', fontSize: 7, fontWeight: 700,
                        letterSpacing: '0.1em', textTransform: 'uppercase',
                        color: w.status === 'published' ? 'var(--positive)' : 'var(--text-muted)',
                      }}>{w.status}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Empty state */}
              {jobs.length === 0 && (slug !== 'nico' || widgets.length === 0) ? (
                <div style={{ textAlign: 'center', paddingTop: 80 }}>
                  <div style={{
                    width: 48, height: 48, background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto 16px', fontSize: 20,
                  }}>{meta.initial}</div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
                    {agent.name} wartet auf deine Anfrage
                  </p>
                  <p style={{
                    fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6,
                    maxWidth: 260, margin: '0 auto',
                  }}>
                    Hier erscheinen delegierte Aufgaben und Ergebnisse in Echtzeit.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {jobs.map((job) => {
                    const CAT_ICONS: Record<Job['category'], string> = {
                      crm: '👤', finance: '📄', marketing: '📢', support: '🎧', widget: '🔨', general: '💬',
                    };
                    const CAT_LABELS: Record<Job['category'], string> = {
                      crm: 'CRM', finance: 'FINANZEN', marketing: 'MARKETING', support: 'SUPPORT', widget: 'WIDGET', general: 'AUFGABE',
                    };
                    const statusColor = job.status === 'working' ? 'var(--accent)'
                      : job.status === 'done' ? 'var(--positive)'
                      : job.status === 'error' ? 'var(--negative)' : 'var(--text-muted)';
                    const isWorking = job.status === 'working';

                    return (
                      <div key={job.id} style={{
                        background: 'var(--surface)',
                        border: `1px solid ${isWorking ? 'var(--accent)' : 'var(--border)'}`,
                        overflow: 'hidden',
                      }}>
                        {/* Yellow accent bar for active jobs */}
                        <div style={{
                          height: 3,
                          background: isWorking ? 'var(--accent)' : statusColor,
                          transition: 'background 0.3s',
                        }} />

                        {/* Job header */}
                        <div style={{
                          padding: '10px 14px',
                          display: 'flex', alignItems: 'center', gap: 8,
                        }}>
                          <span style={{ fontSize: 12, flexShrink: 0 }}>{CAT_ICONS[job.category]}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                              <span style={{
                                fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700,
                                letterSpacing: '0.12em', color: statusColor,
                              }}>{CAT_LABELS[job.category]}</span>
                              <span style={{
                                fontFamily: 'var(--font-mono)', fontSize: 7, color: 'var(--text-muted)',
                              }}>{job.startedAt.toLocaleTimeString('de', { hour: '2-digit', minute: '2-digit' })}</span>
                              {isWorking && (
                                <span style={{
                                  fontFamily: 'var(--font-mono)', fontSize: 7, fontWeight: 700,
                                  color: 'var(--accent)', letterSpacing: '0.1em',
                                  animation: 'jobPulse 1.5s infinite',
                                }}>ARBEITET…</span>
                              )}
                              {job.status === 'done' && (
                                <span style={{
                                  fontFamily: 'var(--font-mono)', fontSize: 7, fontWeight: 700,
                                  color: 'var(--positive)', letterSpacing: '0.1em',
                                }}>ERLEDIGT</span>
                              )}
                              {job.status === 'error' && (
                                <span style={{
                                  fontFamily: 'var(--font-mono)', fontSize: 7, fontWeight: 700,
                                  color: 'var(--negative)', letterSpacing: '0.1em',
                                }}>FEHLER</span>
                              )}
                            </div>
                            <p style={{
                              fontSize: 11, color: 'var(--text)', fontWeight: 600,
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>{job.request}</p>
                          </div>
                        </div>

                        {/* Job result (collapsed by default for done jobs) */}
                        {job.result && job.status === 'done' && (
                          <div style={{
                            padding: '0 14px 10px', borderTop: '1px solid var(--border)',
                            marginTop: 0,
                          }}>
                            <p style={{
                              fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6,
                              whiteSpace: 'pre-wrap', maxHeight: 160, overflowY: 'auto',
                              paddingTop: 8,
                            }}>{job.result.length > 400 ? job.result.slice(0, 400) + '…' : job.result}</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      <style>{`
        @keyframes agentDot {
          0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1); }
        }
        @keyframes jobPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
