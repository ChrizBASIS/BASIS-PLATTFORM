'use client';

import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface KPICardProps {
  title: string;
  value: string;
  change?: number;
  changeLabel?: string;
  icon?: React.ElementType;
}

export function KPICard({ title, value, change, changeLabel, icon: Icon }: KPICardProps) {
  const trend = change ? (change > 0 ? 'up' : 'down') : 'neutral';

  return (
    <Card className="hover:border-accent/30 transition-colors">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <p className="text-sm text-muted">{title}</p>
            <p className="text-2xl font-bold tracking-tight">{value}</p>
            {change !== undefined && (
              <div className="flex items-center gap-1.5">
                {trend === 'up' && <TrendingUp className="h-3.5 w-3.5 text-success" />}
                {trend === 'down' && <TrendingDown className="h-3.5 w-3.5 text-danger" />}
                {trend === 'neutral' && <Minus className="h-3.5 w-3.5 text-muted" />}
                <span
                  className={cn(
                    'text-xs font-medium',
                    trend === 'up' && 'text-success',
                    trend === 'down' && 'text-danger',
                    trend === 'neutral' && 'text-muted',
                  )}
                >
                  {change > 0 ? '+' : ''}
                  {change}% {changeLabel}
                </span>
              </div>
            )}
          </div>
          {Icon && (
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
              <Icon className="h-5 w-5 text-accent" />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
