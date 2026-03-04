'use client';

import { useState } from 'react';

interface AgentUsage {
  name: string;
  tokens: number;
}

interface TokenMeterProps {
  used: number;
  limit: number;
  agents: AgentUsage[];
  period: string;
}

export function TokenMeter({ used, limit, agents, period }: TokenMeterProps) {
  const [hovAgent, setHovAgent] = useState<string | null>(null);
  const pct = Math.min((used / limit) * 100, 100);
  const barColor = pct > 95 ? 'var(--negative)' : pct > 80 ? 'var(--warning)' : 'var(--accent)';

  const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);

  return (
    <div style={{ background: 'var(--surface)', padding: '32px 28px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600,
          letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--accent)',
        }}>TOKEN-VERBRAUCH</span>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
          letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--text-muted)',
        }}>{period}</span>
      </div>

      {/* Big number */}
      <div style={{ marginBottom: 16 }}>
        <span style={{ fontSize: 36, fontWeight: 900, letterSpacing: '-0.04em', color: 'var(--text)' }}>
          {fmt(used)}
        </span>
        <span style={{ fontSize: 14, color: 'var(--text-muted)', marginLeft: 8 }}>
          / {fmt(limit)} Tokens
        </span>
      </div>

      {/* Progress bar */}
      <div style={{ background: 'var(--bg)', height: 6, marginBottom: 24, position: 'relative' }}>
        <div style={{
          height: '100%', width: `${pct}%`, background: barColor,
          transition: 'width 0.6s ease, background 0.3s',
        }} />
      </div>

      {pct > 80 && (
        <div style={{
          background: pct > 95 ? 'var(--negative)' : 'var(--warning)',
          color: 'var(--on-accent)', padding: '8px 14px', marginBottom: 20,
          fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
          letterSpacing: '0.15em', textTransform: 'uppercase',
          display: 'inline-block',
        }}>
          {pct > 95 ? 'LIMIT FAST ERREICHT' : 'VERBRAUCH > 80%'}
        </div>
      )}

      {/* Per-agent breakdown */}
      <p style={{
        fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
        letterSpacing: '0.15em', textTransform: 'uppercase',
        color: 'var(--text-muted)', marginBottom: 12,
      }}>PRO AGENT</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {agents.map((a) => {
          const agentPct = limit > 0 ? (a.tokens / limit) * 100 : 0;
          const isHov = hovAgent === a.name;
          return (
            <div
              key={a.name}
              onMouseEnter={() => setHovAgent(a.name)}
              onMouseLeave={() => setHovAgent(null)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '8px 12px',
                background: isHov ? 'var(--surface-2)' : 'transparent',
                transition: 'background 0.15s',
              }}
            >
              <div style={{
                width: 22, height: 22, flexShrink: 0,
                background: isHov ? 'var(--accent)' : 'var(--surface-2)',
                color: isHov ? 'var(--on-accent)' : 'var(--text-dim)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 9, fontWeight: 800, transition: 'all 0.15s',
              }}>{a.name[0]}</div>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', flex: 1 }}>
                {a.name}
              </span>
              <div style={{ width: 80, height: 3, background: 'var(--bg)', flexShrink: 0 }}>
                <div style={{ height: '100%', width: `${agentPct}%`, background: 'var(--accent)', transition: 'width 0.4s' }} />
              </div>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
                color: 'var(--text-dim)', width: 44, textAlign: 'right',
              }}>{fmt(a.tokens)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
