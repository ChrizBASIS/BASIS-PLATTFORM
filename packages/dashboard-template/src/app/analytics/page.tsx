'use client';

import { useState, useEffect } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { TokenMeter } from '@/components/TokenMeter';
import { useDashboardData, AGENT_META } from '@/hooks/useDashboardData';
import { fetchTokenHistory, type TokenHistoryDay } from '@/lib/api-client';

export default function AnalyticsPage() {
  const { tenant, tokens } = useDashboardData();
  const [history, setHistory] = useState<TokenHistoryDay[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  useEffect(() => {
    fetchTokenHistory()
      .then(setHistory)
      .finally(() => setLoadingHistory(false));
  }, []);

  // ─── Chart helpers ──────────────────────────────────────────────────────────
  const last30 = history.slice(-30);
  const maxTokens = Math.max(...last30.map((d) => d.totalTokens), 1);
  const fmtDate = (s: string) => {
    const d = new Date(s);
    return d.toLocaleDateString('de-AT', { day: 'numeric', month: 'short' });
  };
  const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);

  // Per-agent totals from history
  const agentTotals: Record<string, number> = {};
  history.forEach((day) => {
    Object.entries(day.byAgent ?? {}).forEach(([agent, n]) => {
      agentTotals[agent] = (agentTotals[agent] ?? 0) + n;
    });
  });
  const agentList = Object.entries(agentTotals)
    .sort((a, b) => b[1] - a[1]);
  const maxAgentTokens = Math.max(...agentList.map(([, n]) => n), 1);

  // ─── Task breakdown ─────────────────────────────────────────────────────────
  const tasks = tenant?.tasks ?? [];
  const tasksByStatus = {
    done: tasks.filter((t) => t.status === 'done' || t.status === 'completed').length,
    in_progress: tasks.filter((t) => t.status === 'in_progress').length,
    pending: tasks.filter((t) => t.status === 'pending').length,
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar tenantName={tenant?.meta?.name} plan={tenant?.meta?.plan} />

      <main style={{ marginLeft: 260, flex: 1, padding: '40px' }}>
        <p style={{
          fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
          letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 6,
        }}>ANALYSEN</p>
        <h1 style={{
          fontSize: 28, fontWeight: 900, letterSpacing: '-0.03em',
          color: 'var(--text)', marginBottom: 32,
        }}>Nutzungsübersicht</h1>

        {/* ─── KPI Row ─────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 2, marginBottom: 24 }}>
          {[
            { label: 'TOKENS GESAMT',   value: tokens ? fmt(tokens.total_tokens) : '—' },
            { label: 'LIMIT',           value: tokens ? fmt(tokens.limit) : '—' },
            { label: 'AUSLASTUNG',      value: tokens ? `${tokens.percentage.toFixed(1)}%` : '—' },
            { label: 'AUFGABEN TOTAL',  value: String(tasks.length || '—') },
          ].map((k) => (
            <div key={k.label} style={{ background: 'var(--surface)', padding: '16px 20px' }}>
              <p style={{
                fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600,
                letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8,
              }}>{k.label}</p>
              <p style={{ fontSize: 24, fontWeight: 900, letterSpacing: '-0.03em', color: 'var(--text)' }}>
                {k.value}
              </p>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 2, alignItems: 'start' }}>

          {/* ─── Left Column ──────────────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>

            {/* Token History Chart */}
            <div style={{ background: 'var(--surface)', padding: '24px 28px' }}>
              <p style={{
                fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
                letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 20,
              }}>TOKEN-VERLAUF (30 TAGE)</p>

              {loadingHistory ? (
                <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Lade…</p>
              ) : last30.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Noch keine Nutzungsdaten vorhanden.</p>
              ) : (
                <div>
                  <div style={{
                    display: 'flex', alignItems: 'flex-end', gap: 3,
                    height: 140, paddingBottom: 8,
                    borderBottom: '1px solid var(--border)',
                  }}>
                    {last30.map((day) => {
                      const h = Math.max((day.totalTokens / maxTokens) * 120, 2);
                      const pct = tokens ? (day.totalTokens / tokens.limit) * 100 : 0;
                      const color = pct > 95 ? 'var(--negative)' : pct > 80 ? 'var(--warning)' : 'var(--accent)';
                      return (
                        <div
                          key={day.date}
                          title={`${fmtDate(day.date)}: ${fmt(day.totalTokens)} Tokens`}
                          style={{
                            flex: 1, height: h, background: color,
                            opacity: 0.85, cursor: 'default',
                            transition: 'opacity 0.15s',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                          onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.85')}
                        />
                      );
                    })}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)' }}>
                      {fmtDate(last30[0]?.date ?? '')}
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)' }}>
                      {fmtDate(last30[last30.length - 1]?.date ?? '')}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Per-agent bar chart */}
            {agentList.length > 0 && (
              <div style={{ background: 'var(--surface)', padding: '24px 28px' }}>
                <p style={{
                  fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
                  letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 16,
                }}>TOKENS PRO AGENT (GESAMT)</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {agentList.map(([agent, total]) => {
                    const key = agent.toLowerCase().split(' ')[0];
                    const meta = AGENT_META[key] ?? { color: '#888', initial: agent[0] };
                    const barPct = (total / maxAgentTokens) * 100;
                    return (
                      <div key={agent} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{
                          width: 24, height: 24, flexShrink: 0,
                          background: meta.color, color: '#080808',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 9, fontWeight: 900,
                        }}>{meta.initial}</div>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', width: 64, flexShrink: 0 }}>
                          {agent}
                        </span>
                        <div style={{ flex: 1, height: 6, background: 'var(--bg)' }}>
                          <div style={{
                            height: '100%', width: `${barPct}%`,
                            background: meta.color, transition: 'width 0.5s ease',
                          }} />
                        </div>
                        <span style={{
                          fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
                          color: 'var(--text-muted)', width: 44, textAlign: 'right', flexShrink: 0,
                        }}>{fmt(total)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Task status breakdown */}
            <div style={{ background: 'var(--surface)', padding: '24px 28px' }}>
              <p style={{
                fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
                letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 16,
              }}>AUFGABEN-STATUS</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2 }}>
                {[
                  { label: 'ERLEDIGT',     value: tasksByStatus.done,        color: 'var(--positive)' },
                  { label: 'IN ARBEIT',    value: tasksByStatus.in_progress,  color: 'var(--warning)' },
                  { label: 'AUSSTEHEND',   value: tasksByStatus.pending,     color: 'var(--text-muted)' },
                ].map((s) => (
                  <div key={s.label} style={{ background: 'var(--bg)', padding: '16px' }}>
                    <p style={{
                      fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700,
                      letterSpacing: '0.1em', color: s.color, marginBottom: 6,
                    }}>{s.label}</p>
                    <p style={{ fontSize: 28, fontWeight: 900, color: 'var(--text)', letterSpacing: '-0.03em' }}>
                      {s.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ─── Right Column: TokenMeter ─────────────────────────── */}
          <div>
            {tokens ? (
              <TokenMeter
                used={tokens.total_tokens}
                limit={tokens.limit}
                agents={tokens.agents.map((a) => ({ name: a.agent, tokens: a.tokens }))}
                period={tokens.period.label}
              />
            ) : (
              <div style={{ background: 'var(--surface)', padding: '32px 28px' }}>
                <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Keine Token-Daten.</p>
              </div>
            )}
          </div>
        </div>

      </main>
    </div>
  );
}
