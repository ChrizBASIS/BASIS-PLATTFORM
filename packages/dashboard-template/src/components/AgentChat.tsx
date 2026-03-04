'use client';

import { useState, useRef, useEffect } from 'react';
import { streamChat, sendDirectChat, AGENT_TYPE_MAP } from '@/lib/api-client';
import { AGENT_META } from '@/hooks/useDashboardData';

interface Message {
  id: string;
  role: 'user' | 'agent';
  agentKey?: string;
  agentName?: string;
  content: string;
  streaming?: boolean;
}

interface AgentChatProps {
  agentName?: string;
}

export function AgentChat({ agentName }: AgentChatProps = {}) {
  const agentKey = agentName ? agentName.toLowerCase() : 'lena';
  const agentType = AGENT_TYPE_MAP[agentKey] ?? 'orchestrator';
  const isOrchestrator = agentType === 'orchestrator';
  const agentColor = AGENT_META[agentKey]?.color ?? 'var(--accent)';
  const agentInitial = AGENT_META[agentKey]?.initial ?? agentName?.[0]?.toUpperCase() ?? 'L';

  const greeting = agentName && agentName.toLowerCase() !== 'lena'
    ? `Hallo! Ich bin ${agentName}. Wie kann ich dir helfen?`
    : 'Hallo! Ich bin Lena, deine Orchestratorin. Wie kann ich dir heute helfen? Ich kann Aufgaben an Marie, Tom, Clara, Marco, Alex oder Nico delegieren.';

  const [messages, setMessages] = useState<Message[]>([{
    id: '0', role: 'agent', agentKey, agentName: agentName ?? 'Lena', content: greeting,
  }]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [sendHov, setSendHov] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    setSending(true);

    const userMsgId = crypto.randomUUID();
    setMessages((prev) => [...prev, { id: userMsgId, role: 'user', content: text }]);

    const replyId = crypto.randomUUID();

    if (isOrchestrator) {
      // ── SSE Streaming via orchestrator ──────────────────────────────
      setMessages((prev) => [...prev, {
        id: replyId, role: 'agent', agentKey: 'lena', agentName: 'Lena',
        content: '', streaming: true,
      }]);

      try {
        for await (const event of streamChat(text, conversationId)) {
          if (event.type === 'agent') {
            setMessages((prev) => prev.map((m) =>
              m.id === replyId
                ? { ...m, agentKey: event.agent, agentName: event.agentName }
                : m,
            ));
          } else if (event.type === 'delta') {
            setMessages((prev) => prev.map((m) =>
              m.id === replyId
                ? { ...m, content: m.content + event.content }
                : m,
            ));
          } else if (event.type === 'done') {
            setConversationId(event.conversationId);
            setMessages((prev) => prev.map((m) =>
              m.id === replyId ? { ...m, streaming: false } : m,
            ));
          } else if (event.type === 'error') {
            setMessages((prev) => prev.map((m) =>
              m.id === replyId
                ? { ...m, content: `Fehler: ${event.message}`, streaming: false }
                : m,
            ));
          }
        }
      } catch (err: any) {
        setMessages((prev) => prev.map((m) =>
          m.id === replyId
            ? { ...m, content: 'API nicht erreichbar — bitte Backend starten.', streaming: false }
            : m,
        ));
      }
    } else {
      // ── Direct chat to specific agent (non-streaming) ──────────────
      setMessages((prev) => [...prev, {
        id: replyId, role: 'agent', agentKey, agentName: agentName ?? agentType,
        content: '…', streaming: true,
      }]);

      try {
        const res = await sendDirectChat(agentType, text, conversationId);
        setConversationId(res.conversationId);
        setMessages((prev) => prev.map((m) =>
          m.id === replyId
            ? { ...m, agentName: res.agentName, content: res.reply, streaming: false }
            : m,
        ));
      } catch {
        setMessages((prev) => prev.map((m) =>
          m.id === replyId
            ? { ...m, content: 'API nicht erreichbar — bitte Backend starten.', streaming: false }
            : m,
        ));
      }
    }

    setSending(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)' }}>

      {/* Messages */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '16px 24px',
        display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        {messages.map((msg) => {
          const mColor = AGENT_META[msg.agentKey ?? '']?.color ?? agentColor;
          const mInitial = AGENT_META[msg.agentKey ?? '']?.initial ?? msg.agentName?.[0]?.toUpperCase() ?? 'A';
          return (
            <div key={msg.id} style={{
              display: 'flex', gap: 10,
              flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
            }}>
              <div style={{
                width: 26, height: 26, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 9, fontWeight: 800,
                background: msg.role === 'agent' ? mColor : 'var(--surface-2)',
                color: msg.role === 'agent' ? '#080808' : 'var(--text)',
              }}>
                {msg.role === 'agent' ? mInitial : 'DU'}
              </div>
              <div style={{
                maxWidth: '78%', padding: '10px 14px', fontSize: 13, lineHeight: 1.65,
                background: msg.role === 'user' ? 'var(--accent)' : 'var(--surface)',
                color: msg.role === 'user' ? 'var(--on-accent)' : 'var(--text)',
                border: msg.role === 'user' ? 'none' : '1px solid var(--border)',
              }}>
                {msg.agentName && msg.role === 'agent' && (
                  <p style={{
                    fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700,
                    letterSpacing: '0.15em', textTransform: 'uppercase',
                    color: mColor, marginBottom: 5,
                  }}>{msg.agentName.toUpperCase()}</p>
                )}
                {msg.streaming && msg.content === '' ? (
                  <TypingDots />
                ) : (
                  <p style={{ whiteSpace: 'pre-wrap' }}>
                    {msg.content}
                    {msg.streaming && <span style={{ opacity: 0.4 }}>▋</span>}
                  </p>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{
        padding: '12px 24px', borderTop: '1px solid var(--border)',
        display: 'flex', gap: 2,
      }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
          placeholder={`Schreib ${agentName ?? 'Lena'} eine Nachricht…`}
          disabled={sending}
          style={{
            flex: 1, padding: '11px 16px', fontSize: 13,
            background: 'var(--surface)', border: '1px solid var(--border)',
            color: 'var(--text)', outline: 'none',
            opacity: sending ? 0.6 : 1,
          }}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || sending}
          onMouseEnter={() => setSendHov(true)}
          onMouseLeave={() => setSendHov(false)}
          style={{
            background: sendHov && input.trim() && !sending ? 'var(--text)' : agentColor,
            color: '#080808',
            padding: '11px 22px', fontWeight: 800, fontSize: 11,
            letterSpacing: '0.08em', textTransform: 'uppercase',
            border: 'none', cursor: input.trim() && !sending ? 'pointer' : 'default',
            opacity: input.trim() && !sending ? 1 : 0.4,
            transition: 'all 0.15s',
          }}
        >{sending ? '…' : 'SENDEN →'}</button>
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center', height: 20 }}>
      {[0, 1, 2].map((i) => (
        <span key={i} style={{
          width: 5, height: 5, borderRadius: '50%',
          background: 'var(--text-muted)',
          animation: `typingDot 1.2s ${i * 0.2}s infinite ease-in-out`,
        }} />
      ))}
      <style>{`
        @keyframes typingDot {
          0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
