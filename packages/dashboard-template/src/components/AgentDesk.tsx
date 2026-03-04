'use client';

import { useState } from 'react';

interface AgentDeskProps {
  name: string;
  role: string;
  initial: string;
  color: string;
  status: 'working' | 'idle' | 'waiting';
  speechBubble?: string;
  postIts: Array<{ text: string; priority: 'high' | 'medium' | 'low' }>;
  lastAction?: string;
  onClick?: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  working: 'ARBEITET',
  idle: 'BEREIT',
  waiting: 'WARTET',
};

const STATUS_COLORS: Record<string, string> = {
  working: 'var(--positive)',
  idle: 'var(--text-muted)',
  waiting: 'var(--warning)',
};

const PRIORITY_COLORS: Record<string, string> = {
  high: '#FF6B6B',
  medium: '#E8FF3A',
  low: '#88CC88',
};

export function AgentDesk({
  name, role, initial, color, status, speechBubble, postIts, lastAction, onClick,
}: AgentDeskProps) {
  const [hov, setHov] = useState(false);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        position: 'relative',
        background: hov ? 'var(--surface-2)' : 'var(--surface)',
        border: hov ? '1px solid var(--accent)' : '1px solid var(--border)',
        padding: 0,
        cursor: 'pointer',
        transition: 'all 0.2s',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'visible',
      }}
    >
      {/* Speech Bubble */}
      {speechBubble && (
        <div style={{
          position: 'absolute',
          top: -38,
          left: 16,
          right: 16,
          background: 'var(--bg)',
          border: '1px solid var(--accent)',
          padding: '6px 12px',
          fontSize: 11,
          lineHeight: 1.4,
          color: 'var(--text)',
          zIndex: 10,
        }}>
          <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{name}:</span>{' '}
          {speechBubble}
          {/* Triangle */}
          <div style={{
            position: 'absolute',
            bottom: -6,
            left: 20,
            width: 0,
            height: 0,
            borderLeft: '6px solid transparent',
            borderRight: '6px solid transparent',
            borderTop: '6px solid var(--accent)',
          }} />
        </div>
      )}

      {/* Agent Identity Row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '16px 20px 12px',
      }}>
        {/* Avatar */}
        <div style={{
          width: 40,
          height: 40,
          background: hov ? color : 'var(--surface-2)',
          color: hov ? '#080808' : color,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 16,
          fontWeight: 900,
          transition: 'all 0.2s',
          flexShrink: 0,
        }}>{initial}</div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            fontSize: 15,
            fontWeight: 800,
            color: hov ? 'var(--accent)' : 'var(--text)',
            transition: 'color 0.2s',
          }}>{name}</p>
          <p style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
          }}>{role}</p>
        </div>

        {/* Status Indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            width: 6,
            height: 6,
            background: STATUS_COLORS[status],
            animation: status === 'working' ? 'pulse 1.5s infinite' : 'none',
          }} />
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '0.15em',
            color: STATUS_COLORS[status],
          }}>{STATUS_LABELS[status]}</span>
        </div>
      </div>

      {/* Desk Surface — where Post-Its live */}
      <div style={{
        flex: 1,
        padding: '0 20px 16px',
        display: 'flex',
        flexWrap: 'wrap',
        gap: 6,
        alignContent: 'flex-start',
        minHeight: 60,
      }}>
        {postIts.map((note, i) => (
          <PostIt key={i} index={i} text={note.text} priority={note.priority} />
        ))}
      </div>

      {/* Last Action — bottom bar */}
      {lastAction && (
        <div style={{
          borderTop: '1px solid var(--border)',
          padding: '8px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <div style={{
            width: 4,
            height: 4,
            background: 'var(--accent)',
            flexShrink: 0,
          }} />
          <p style={{
            fontSize: 11,
            color: 'var(--text-dim)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>{lastAction}</p>
        </div>
      )}
    </div>
  );
}

const FIXED_ROTATIONS = [-1.2, 0.8, -0.5, 1.4, -0.9, 0.6, 1.1, -0.7];

function PostIt({ text, priority, index }: { text: string; priority: string; index: number }) {
  const [hov, setHov] = useState(false);
  const bgColor = PRIORITY_COLORS[priority] ?? PRIORITY_COLORS.medium;
  const rot = FIXED_ROTATIONS[index % FIXED_ROTATIONS.length];

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: bgColor,
        color: '#080808',
        padding: '4px 8px',
        fontSize: 10,
        fontWeight: 700,
        lineHeight: 1.3,
        maxWidth: '100%',
        transform: hov ? 'rotate(-1deg) scale(1.05)' : `rotate(${rot}deg)`,
        transition: 'transform 0.15s',
        cursor: 'default',
      }}
    >{text}</div>
  );
}
