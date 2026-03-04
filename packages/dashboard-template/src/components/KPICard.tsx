'use client';

import { useState } from 'react';

interface KPICardProps {
  label: string;
  value: string;
  change: string;
  positive: boolean;
}

export function KPICard({ label, value, change, positive }: KPICardProps) {
  const [hov, setHov] = useState(false);

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: hov ? 'var(--accent)' : 'var(--surface)',
        padding: '32px 28px',
        transition: 'all 0.2s',
        cursor: 'default',
      }}
    >
      <p style={{
        fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
        letterSpacing: '0.15em', textTransform: 'uppercase',
        color: hov ? 'rgba(8,8,8,0.5)' : 'var(--text-muted)',
        marginBottom: 16, transition: 'color 0.2s',
      }}>{label}</p>
      <p style={{
        fontSize: 42, fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1,
        color: hov ? 'var(--on-accent)' : 'var(--text)',
        marginBottom: 8, transition: 'color 0.2s',
      }}>{value}</p>
      <p style={{
        fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600,
        letterSpacing: '0.1em',
        color: hov ? 'rgba(8,8,8,0.65)' : positive ? 'var(--positive)' : 'var(--negative)',
        transition: 'color 0.2s',
      }}>
        {change}
      </p>
    </div>
  );
}
