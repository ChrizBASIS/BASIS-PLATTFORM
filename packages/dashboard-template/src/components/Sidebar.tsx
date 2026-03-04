'use client';

import { useState } from 'react';

interface SidebarProps {
  tenantName?: string;
  plan?: string;
}

interface NavItem {
  label: string;
  href: string;
  active?: boolean;
  badge?: string;
}

const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/', active: true },
  { label: 'Agenten', href: '/agents', badge: '7' },
  { label: 'Build Mode', href: '/sandbox' },
  { label: 'Analysen', href: '/analytics' },
  { label: 'Dokumente', href: '/documents' },
  { label: 'Team', href: '/team' },
  { label: 'Abrechnung', href: '/billing' },
];

const bottomItems: NavItem[] = [
  { label: 'Hilfe', href: '/help' },
  { label: 'Einstellungen', href: '/settings' },
];

export function Sidebar({ tenantName, plan }: SidebarProps = {}) {
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <aside style={{
      position: 'fixed', left: 0, top: 0, zIndex: 40,
      display: 'flex', flexDirection: 'column',
      width: 260, height: '100vh',
      background: 'var(--bg)',
      borderRight: '1px solid var(--border)',
    }}>
      {/* Logo */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        height: 64, padding: '0 24px',
        borderBottom: '1px solid var(--border)',
      }}>
        <div style={{
          width: 28, height: 28,
          background: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, fontWeight: 900, color: 'var(--on-accent)',
        }}>B</div>
        <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text)' }}>
          BASIS
        </span>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '12px 12px' }}>
        {navItems.map((item) => {
          const isHov = hovered === item.href;
          const isActive = item.active;
          return (
            <a
              key={item.href}
              href={item.href}
              onMouseEnter={() => setHovered(item.href)}
              onMouseLeave={() => setHovered(null)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 16px', marginBottom: 2,
                fontSize: 13, fontWeight: isActive ? 700 : 500,
                textDecoration: 'none',
                transition: 'all 0.15s',
                background: isActive ? 'var(--surface)' : isHov ? 'var(--surface)' : 'transparent',
                color: isActive ? 'var(--accent)' : isHov ? 'var(--text)' : 'var(--text-dim)',
                borderLeft: isActive ? '3px solid var(--accent)' : '3px solid transparent',
              }}
            >
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.badge && (
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
                  letterSpacing: '0.1em', color: 'var(--accent)',
                  border: '1px solid var(--accent)',
                  padding: '2px 8px',
                }}>{item.badge}</span>
              )}
            </a>
          );
        })}
      </nav>

      {/* Bottom nav */}
      <div style={{ borderTop: '1px solid var(--border)', padding: '12px' }}>
        {bottomItems.map((item) => {
          const isHov = hovered === item.href;
          return (
            <a
              key={item.href}
              href={item.href}
              onMouseEnter={() => setHovered(item.href)}
              onMouseLeave={() => setHovered(null)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 16px', marginBottom: 2,
                fontSize: 13, fontWeight: 500,
                textDecoration: 'none',
                transition: 'all 0.15s',
                background: isHov ? 'var(--surface)' : 'transparent',
                color: isHov ? 'var(--text)' : 'var(--text-muted)',
              }}
            >{item.label}</a>
          );
        })}
      </div>

      {/* Tenant info */}
      <div style={{
        borderTop: '1px solid var(--border)',
        padding: '16px 20px',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <div style={{
          width: 32, height: 32,
          background: 'var(--accent)', color: 'var(--on-accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 800,
        }}>{tenantName ? tenantName.slice(0, 2).toUpperCase() : 'BA'}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {tenantName ?? 'BASIS'}
          </p>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--accent)' }}>
            {plan ? `${plan.toUpperCase()} PLAN` : 'PLAN'}
          </p>
        </div>
      </div>
    </aside>
  );
}
