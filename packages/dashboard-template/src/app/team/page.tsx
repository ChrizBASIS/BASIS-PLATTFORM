'use client';

import { useState, useEffect } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { useDashboardData } from '@/hooks/useDashboardData';
import { fetchMembers, type TenantMember } from '@/lib/api-client';

const ROLE_COLORS: Record<string, string> = {
  owner:         'var(--accent)',
  admin:         '#A78BFA',
  manager:       '#60A5FA',
  member:        '#34D399',
  viewer:        'var(--text-muted)',
  basis_support: '#FB923C',
};

export default function TeamPage() {
  const { tenant } = useDashboardData();
  const [members, setMembers] = useState<TenantMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [inviteHov, setInviteHov] = useState(false);
  const [inviteSent, setInviteSent] = useState(false);

  useEffect(() => {
    if (!tenant?.id) return;
    fetchMembers(tenant.id)
      .then(setMembers)
      .finally(() => setLoading(false));
  }, [tenant?.id]);

  const handleInvite = () => {
    if (!inviteEmail.trim()) return;
    setInviteSent(true);
    setTimeout(() => { setInviteSent(false); setInviteEmail(''); }, 2500);
  };

  const ROLES = ['owner', 'admin', 'manager', 'member', 'viewer'];

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar tenantName={tenant?.meta?.name} plan={tenant?.meta?.plan} />

      <main style={{ marginLeft: 260, flex: 1, padding: '40px' }}>
        <p style={{
          fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
          letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 6,
        }}>TEAM</p>
        <h1 style={{
          fontSize: 28, fontWeight: 900, letterSpacing: '-0.03em',
          color: 'var(--text)', marginBottom: 32,
        }}>Team-Verwaltung</h1>

        <div style={{ maxWidth: 680 }}>

          {/* Invite section */}
          <div style={{ marginBottom: 40 }}>
            <p style={{
              fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
              letterSpacing: '0.15em', textTransform: 'uppercase',
              color: 'var(--text-muted)', marginBottom: 14,
            }}>MITGLIED EINLADEN</p>

            <div style={{ display: 'flex', gap: 2, marginBottom: 8 }}>
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
                placeholder="email@beispiel.at"
                style={{
                  flex: 1, padding: '12px 16px', fontSize: 14,
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  color: 'var(--text)',
                }}
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                style={{
                  padding: '12px 14px', fontSize: 12,
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  color: 'var(--text)', fontFamily: 'var(--font-mono)',
                  fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                }}
              >
                {ROLES.filter((r) => r !== 'owner').map((r) => (
                  <option key={r} value={r}>{r.toUpperCase()}</option>
                ))}
              </select>
              <button
                onClick={handleInvite}
                onMouseEnter={() => setInviteHov(true)}
                onMouseLeave={() => setInviteHov(false)}
                style={{
                  padding: '12px 24px', border: 'none', cursor: 'pointer',
                  background: inviteSent ? 'var(--positive)' : inviteHov ? 'var(--text)' : 'var(--accent)',
                  color: '#080808', fontWeight: 800, fontSize: 11,
                  letterSpacing: '0.08em', textTransform: 'uppercase', transition: 'all 0.15s',
                }}
              >{inviteSent ? '✓ GESENDET' : 'EINLADEN →'}</button>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Neue Mitglieder erhalten eine E-Mail-Einladung und können sich über Keycloak anmelden.
            </p>
          </div>

          {/* Members list */}
          <p style={{
            fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
            letterSpacing: '0.15em', textTransform: 'uppercase',
            color: 'var(--text-muted)', marginBottom: 12,
          }}>AKTIVE MITGLIEDER ({loading ? '…' : members.length})</p>

          {loading && (
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Lade Mitglieder…</p>
          )}
          {!loading && members.length === 0 && (
            <div style={{
              padding: '24px', background: 'var(--surface)',
              border: '1px solid var(--border)', textAlign: 'center',
            }}>
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                Noch keine weiteren Mitglieder. Lade jemanden ein!
              </p>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {members.map((m) => {
              const roleColor = ROLE_COLORS[m.role] ?? 'var(--text-muted)';
              const initial = (m.name ?? m.email)[0].toUpperCase();
              return (
                <div key={m.id} style={{
                  display: 'flex', alignItems: 'center', gap: 16,
                  padding: '16px 20px', background: 'var(--surface)',
                  borderLeft: `3px solid ${roleColor}`,
                }}>
                  <div style={{
                    width: 36, height: 36, flexShrink: 0,
                    background: roleColor, color: '#080808',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 900,
                  }}>{initial}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>
                      {m.name ?? m.email}
                    </p>
                    {m.name && (
                      <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{m.email}</p>
                    )}
                  </div>
                  <div style={{ flexShrink: 0, textAlign: 'right' }}>
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 800,
                      letterSpacing: '0.12em', textTransform: 'uppercase',
                      padding: '4px 10px', border: `1px solid ${roleColor}`, color: roleColor,
                    }}>{m.role}</span>
                    <p style={{
                      fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-muted)',
                      marginTop: 4,
                    }}>
                      seit {new Date(m.joinedAt).toLocaleDateString('de-AT', { month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Role legend */}
          {!loading && members.length > 0 && (
            <div style={{ marginTop: 24, padding: '16px 20px', background: 'var(--surface)' }}>
              <p style={{
                fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700,
                letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 12,
              }}>ROLLEN-LEGENDE</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {Object.entries(ROLE_COLORS).filter(([r]) => r !== 'basis_support').map(([role, color]) => (
                  <div key={role} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 8, height: 8, background: color }} />
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600,
                      textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.08em',
                    }}>{role}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
