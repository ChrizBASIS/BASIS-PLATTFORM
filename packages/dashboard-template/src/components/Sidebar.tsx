'use client';

import {
  LayoutDashboard,
  MessageSquare,
  Hammer,
  Settings,
  BarChart3,
  FileText,
  Users,
  CreditCard,
  HelpCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  label: string;
  icon: React.ElementType;
  href: string;
  active?: boolean;
  badge?: string;
}

const navItems: NavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard, href: '/', active: true },
  { label: 'Agenten', icon: MessageSquare, href: '/agents', badge: '7' },
  { label: 'Build Mode', icon: Hammer, href: '/sandbox' },
  { label: 'Analysen', icon: BarChart3, href: '/analytics' },
  { label: 'Dokumente', icon: FileText, href: '/documents' },
  { label: 'Team', icon: Users, href: '/team' },
  { label: 'Abrechnung', icon: CreditCard, href: '/billing' },
];

const bottomItems: NavItem[] = [
  { label: 'Hilfe', icon: HelpCircle, href: '/help' },
  { label: 'Einstellungen', icon: Settings, href: '/settings' },
];

export function Sidebar() {
  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-64 flex-col border-r border-border bg-background">
      <div className="flex h-16 items-center gap-2 border-b border-border px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent">
          <span className="text-sm font-bold text-background">B</span>
        </div>
        <span className="text-lg font-bold tracking-tight">BASIS</span>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {navItems.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors',
              item.active
                ? 'bg-card text-accent font-medium'
                : 'text-muted hover:bg-card-hover hover:text-foreground',
            )}
          >
            <item.icon className="h-4 w-4" />
            <span className="flex-1">{item.label}</span>
            {item.badge && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent/20 px-1.5 text-xs text-accent">
                {item.badge}
              </span>
            )}
          </a>
        ))}
      </nav>

      <div className="border-t border-border p-3">
        {bottomItems.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted transition-colors hover:bg-card-hover hover:text-foreground"
          >
            <item.icon className="h-4 w-4" />
            <span>{item.label}</span>
          </a>
        ))}
      </div>

      <div className="border-t border-border p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-card text-sm font-medium">
            GS
          </div>
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-medium">Gasthof Sonnenhof</p>
            <p className="truncate text-xs text-muted">Pro Plan</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
