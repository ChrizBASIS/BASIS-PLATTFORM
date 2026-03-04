'use client';

import { useState } from 'react';
import { Send, Bot, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Message {
  id: string;
  role: 'user' | 'agent';
  agent?: string;
  content: string;
  timestamp: Date;
}

const DEMO_MESSAGES: Message[] = [
  {
    id: '1',
    role: 'agent',
    agent: 'Lena',
    content: 'Hallo! Ich bin Lena, deine Assistentin. Wie kann ich dir heute helfen?',
    timestamp: new Date(),
  },
];

export function AgentChat() {
  const [messages, setMessages] = useState<Message[]>(DEMO_MESSAGES);
  const [input, setInput] = useState('');

  const handleSend = () => {
    if (!input.trim()) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    const agentReply: Message = {
      id: crypto.randomUUID(),
      role: 'agent',
      agent: 'Lena',
      content: `Ich habe deine Nachricht erhalten. Das Agenten-System wird aktuell eingerichtet — bald kann ich dir hier richtig helfen!`,
      timestamp: new Date(),
    };

    setMessages([...messages, userMsg, agentReply]);
    setInput('');
  };

  return (
    <Card className="flex h-[400px] flex-col">
      <CardHeader className="border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/20">
            <Bot className="h-4 w-4 text-accent" />
          </div>
          <CardTitle className="text-sm">Dein Team</CardTitle>
          <span className="ml-auto flex h-2 w-2 rounded-full bg-success" />
          <span className="text-xs text-muted">Online</span>
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-y-auto space-y-3 p-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
          >
            <div
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs ${
                msg.role === 'agent' ? 'bg-accent/20 text-accent' : 'bg-card text-foreground'
              }`}
            >
              {msg.role === 'agent' ? <Bot className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
            </div>
            <div
              className={`max-w-[80%] rounded-xl px-3.5 py-2.5 text-sm ${
                msg.role === 'user'
                  ? 'bg-accent text-background'
                  : 'bg-card border border-border'
              }`}
            >
              {msg.agent && (
                <p className="mb-1 text-xs font-medium text-accent">{msg.agent}</p>
              )}
              <p>{msg.content}</p>
            </div>
          </div>
        ))}
      </CardContent>

      <div className="border-t border-border p-3">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Schreib Lena eine Nachricht..."
            className="flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
          />
          <Button size="icon" onClick={handleSend} disabled={!input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
