'use client';

import { useState } from 'react';

interface Message {
  id: string;
  role: 'user' | 'agent';
  agent?: string;
  content: string;
}

const DEMO_MESSAGES: Message[] = [
  {
    id: '1',
    role: 'agent',
    agent: 'Lena',
    content: 'Hallo! Ich bin Lena, deine Orchestratorin. Wie kann ich dir heute helfen? Ich kann Aufgaben an Marie, Tom, Clara, Marco, Alex oder Nico delegieren.',
  },
];

export function AgentChat() {
  const [messages, setMessages] = useState<Message[]>(DEMO_MESSAGES);
  const [input, setInput] = useState('');
  const [sendHov, setSendHov] = useState(false);

  const handleSend = () => {
    if (!input.trim()) return;
    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: input };
    const reply: Message = {
      id: crypto.randomUUID(), role: 'agent', agent: 'Lena',
      content: 'Ich habe deine Nachricht erhalten. Das Agenten-System wird aktuell eingerichtet — bald kann ich dir hier richtig helfen!',
    };
    setMessages([...messages, userMsg, reply]);
    setInput('');
  };

  return (
    <div style={{
      background: 'var(--surface)', display: 'flex', flexDirection: 'column', height: 420,
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 24px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{
          width: 6, height: 6, background: 'var(--positive)',
          animation: 'pulse 1.5s infinite', flexShrink: 0,
        }} />
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600,
          letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--accent)',
        }}>DEIN TEAM</span>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em',
          color: 'var(--text-muted)', marginLeft: 'auto',
        }}>7 AGENTEN ONLINE</span>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {messages.map((msg) => (
          <div key={msg.id} style={{
            display: 'flex', gap: 12,
            flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
          }}>
            <div style={{
              width: 28, height: 28, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 800,
              background: msg.role === 'agent' ? 'var(--accent)' : 'var(--surface-2)',
              color: msg.role === 'agent' ? 'var(--on-accent)' : 'var(--text)',
            }}>
              {msg.role === 'agent' ? (msg.agent?.[0] ?? 'A') : 'DU'}
            </div>
            <div style={{
              maxWidth: '75%', padding: '12px 16px', fontSize: 14, lineHeight: 1.65,
              background: msg.role === 'user' ? 'var(--accent)' : 'var(--bg)',
              color: msg.role === 'user' ? 'var(--on-accent)' : 'var(--text)',
              border: msg.role === 'user' ? 'none' : '1px solid var(--border)',
            }}>
              {msg.agent && (
                <p style={{
                  fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
                  letterSpacing: '0.15em', textTransform: 'uppercase',
                  color: msg.role === 'user' ? 'rgba(8,8,8,0.6)' : 'var(--accent)',
                  marginBottom: 6,
                }}>{msg.agent}</p>
              )}
              <p>{msg.content}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: 2 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Schreib Lena eine Nachricht..."
          style={{ flex: 1, padding: '12px 16px', fontSize: 14 }}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim()}
          onMouseEnter={() => setSendHov(true)}
          onMouseLeave={() => setSendHov(false)}
          style={{
            background: sendHov && input.trim() ? 'var(--text)' : 'var(--accent)',
            color: 'var(--on-accent)',
            padding: '12px 24px',
            fontWeight: 800, fontSize: 13,
            letterSpacing: '0.08em', textTransform: 'uppercase',
            border: 'none', cursor: input.trim() ? 'pointer' : 'default',
            opacity: input.trim() ? 1 : 0.4,
            transition: 'all 0.15s',
          }}
        >SENDEN →</button>
      </div>
    </div>
  );
}
