'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Sidebar } from '@/components/Sidebar';
import { useDashboardData } from '@/hooks/useDashboardData';
import { fetchWidget, type Widget } from '@/lib/api-client';

export default function WidgetPage() {
  const { tenant } = useDashboardData();
  const params = useParams();
  const router = useRouter();
  const widgetId = params.id as string;

  const [widget, setWidget] = useState<Widget | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (widgetId) {
      fetchWidget(widgetId)
        .then(setWidget)
        .catch(() => setWidget(null))
        .finally(() => setLoading(false));
    }
  }, [widgetId]);

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
      <Sidebar tenantName={tenant?.meta?.name} plan={tenant?.meta?.plan} />
      <main style={{
        marginLeft: 260, flex: 1, display: 'flex', flexDirection: 'column',
        height: '100vh', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          height: 56, borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', padding: '0 24px', gap: 12,
          flexShrink: 0,
        }}>
          <button
            onClick={() => router.push('/sandbox')}
            style={{
              padding: '5px 12px', background: 'transparent',
              border: '1px solid var(--border)', color: 'var(--text-muted)',
              fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700,
              cursor: 'pointer', letterSpacing: '0.08em',
            }}
          >← ZURÜCK</button>
          <div style={{ width: 6, height: 6, background: 'var(--positive)' }} />
          <p style={{
            fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
            letterSpacing: '0.08em', color: 'var(--text)', flex: 1,
          }}>
            {loading ? 'Laden…' : widget?.title ?? 'Widget nicht gefunden'}
          </p>
          {widget && (
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700,
              letterSpacing: '0.12em', textTransform: 'uppercase',
              color: widget.status === 'published' ? 'var(--positive)' : 'var(--warning)',
              border: `1px solid ${widget.status === 'published' ? 'var(--positive)' : 'var(--warning)'}`,
              padding: '3px 8px',
            }}>{widget.status}</span>
          )}
        </div>

        {/* Content */}
        {loading ? (
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
              Widget wird geladen…
            </p>
          </div>
        ) : !widget ? (
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexDirection: 'column', gap: 12,
          }}>
            <p style={{ fontSize: 40 }}>🔍</p>
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
              Widget nicht gefunden
            </p>
            <button
              onClick={() => router.push('/sandbox')}
              style={{
                padding: '8px 16px', background: 'var(--accent)', border: 'none',
                color: '#080808', fontFamily: 'var(--font-mono)', fontSize: 9,
                fontWeight: 800, cursor: 'pointer', letterSpacing: '0.08em',
              }}
            >ZUM BUILD MODE</button>
          </div>
        ) : (
          <div style={{ flex: 1, background: '#0a0a0a' }}>
            <iframe
              srcDoc={widget.code}
              sandbox="allow-scripts"
              style={{
                width: '100%', height: '100%', border: 'none',
                background: '#0a0a0a',
              }}
              title={widget.title}
            />
          </div>
        )}
      </main>
    </div>
  );
}
