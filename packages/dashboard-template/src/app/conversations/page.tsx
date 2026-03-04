'use client';

import { useState, useEffect } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { useDashboardData, AGENT_META } from '@/hooks/useDashboardData';
import { fetchConversations, fetchConversation, type Conversation } from '@/lib/api-client';

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('de-AT', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function fmtShort(s: string) {
  return new Date(s).toLocaleDateString('de-AT', { day: 'numeric', month: 'short' });
}

export default function ConversationsPage() {
  const { tenant } = useDashboardData();
  const [list, setList] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    fetchConversations()
      .then(setList)
      .finally(() => setLoading(false));
  }, []);

  const openConversation = async (id: string) => {
    setLoadingDetail(true);
    const conv = await fetchConversation(id);
    setSelected(conv);
    setLoadingDetail(false);
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar tenantName={tenant?.meta?.name} plan={tenant?.meta?.plan} />

      <main style={{ marginLeft: 260, flex: 1, display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div style={{ padding: '40px 40px 20px', borderBottom: '1px solid var(--border)' }}>
          <p style={{
            fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
            letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 6,
          }}>VERLAUF</p>
          <h1 style={{
            fontSize: 28, fontWeight: 900, letterSpacing: '-0.03em', color: 'var(--text)',
          }}>Gesprächsverlauf</h1>
        </div>

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* Conversation list */}
          <div style={{
            width: 320, flexShrink: 0, borderRight: '1px solid var(--border)',
            overflowY: 'auto',
          }}>
            {loading && (
              <p style={{ padding: '20px 24px', fontSize: 13, color: 'var(--text-muted)' }}>Lade…</p>
            )}
            {!loading && list.length === 0 && (
              <div style={{ padding: '32px 24px' }}>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  Noch keine Gespräche vorhanden. Öffne einen Agenten-Chat um zu starten.
                </p>
              </div>
            )}
            {list.map((conv) => {
              const key = conv.agentType?.toLowerCase() ?? 'lena';
              const meta = AGENT_META[key] ?? { color: '#888', initial: key[0].toUpperCase() };
              const lastMsg = conv.messages?.[conv.messages.length - 1];
              const preview = lastMsg?.content?.slice(0, 60) ?? '…';
              const isSelected = selected?.id === conv.id;
              return (
                <button
                  key={conv.id}
                  onClick={() => openConversation(conv.id)}
                  style={{
                    width: '100%', textAlign: 'left',
                    padding: '16px 20px', border: 'none',
                    borderBottom: '1px solid var(--border)',
                    background: isSelected ? 'var(--surface)' : 'transparent',
                    borderLeft: isSelected ? `3px solid ${meta.color}` : '3px solid transparent',
                    cursor: 'pointer', transition: 'all 0.1s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <div style={{
                      width: 22, height: 22, flexShrink: 0,
                      background: meta.color, color: '#080808',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 8, fontWeight: 900,
                    }}>{meta.initial}</div>
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700,
                      letterSpacing: '0.1em', textTransform: 'uppercase', color: meta.color,
                    }}>{conv.agentType}</span>
                    <span style={{
                      marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 9,
                      color: 'var(--text-muted)',
                    }}>{fmtShort(conv.updatedAt ?? conv.createdAt)}</span>
                  </div>
                  <p style={{
                    fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{preview}{preview.length >= 60 ? '…' : ''}</p>
                  <p style={{
                    fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)',
                    marginTop: 4,
                  }}>{conv.messages?.length ?? 0} NACHRICHTEN</p>
                </button>
              );
            })}
          </div>

          {/* Detail view */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
            {loadingDetail && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 6, height: 6, background: 'var(--accent)', animation: 'pulse 1.5s infinite' }} />
                <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Lade Gespräch…</p>
              </div>
            )}
            {!loadingDetail && !selected && (
              <div style={{ paddingTop: 40 }}>
                <p style={{
                  fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
                  letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--text-muted)',
                  marginBottom: 8,
                }}>WÄHLE EIN GESPRÄCH</p>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  Klicke links auf ein Gespräch um die Nachrichten anzuzeigen.
                </p>
              </div>
            )}
            {!loadingDetail && selected && (
              <div>
                {/* Conv header */}
                <div style={{ marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                    {(() => {
                      const key = selected.agentType?.toLowerCase() ?? 'lena';
                      const meta = AGENT_META[key] ?? { color: '#888', initial: key[0].toUpperCase() };
                      return (
                        <div style={{
                          width: 28, height: 28, background: meta.color, color: '#080808',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 10, fontWeight: 900,
                        }}>{meta.initial}</div>
                      );
                    })()}
                    <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--text)' }}>
                      {selected.agentType?.charAt(0).toUpperCase() + selected.agentType?.slice(1)}
                    </span>
                  </div>
                  <p style={{
                    fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)',
                    letterSpacing: '0.05em',
                  }}>
                    GESTARTET {fmtDate(selected.createdAt)} · {selected.messages?.length ?? 0} NACHRICHTEN
                  </p>
                </div>

                {/* Messages */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {(selected.messages ?? []).map((msg, i) => {
                    const isUser = msg.role === 'user';
                    const agentKey = msg.agent?.toLowerCase() ?? selected.agentType?.toLowerCase() ?? 'lena';
                    const meta = AGENT_META[agentKey] ?? { color: '#888', initial: agentKey[0].toUpperCase() };
                    return (
                      <div key={i} style={{
                        display: 'flex', gap: 10,
                        flexDirection: isUser ? 'row-reverse' : 'row',
                      }}>
                        <div style={{
                          width: 24, height: 24, flexShrink: 0,
                          background: isUser ? 'var(--surface-2)' : meta.color,
                          color: isUser ? 'var(--text)' : '#080808',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 8, fontWeight: 900,
                        }}>{isUser ? 'DU' : meta.initial}</div>
                        <div style={{
                          maxWidth: '78%', padding: '10px 14px', fontSize: 13, lineHeight: 1.65,
                          background: isUser ? 'var(--accent)' : 'var(--surface)',
                          color: isUser ? '#080808' : 'var(--text)',
                          border: isUser ? 'none' : '1px solid var(--border)',
                        }}>
                          {!isUser && msg.agentName && (
                            <p style={{
                              fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700,
                              letterSpacing: '0.12em', textTransform: 'uppercase',
                              color: meta.color, marginBottom: 4,
                            }}>{msg.agentName}</p>
                          )}
                          <p style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</p>
                          <p style={{
                            fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-muted)',
                            marginTop: 6, opacity: 0.6,
                          }}>{fmtDate(msg.timestamp)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
