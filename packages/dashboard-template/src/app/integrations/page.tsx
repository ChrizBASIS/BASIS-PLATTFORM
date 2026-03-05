'use client';

import { useState, useEffect } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { useDashboardData } from '@/hooks/useDashboardData';
import { useToast } from '@/components/Toast';
import {
  fetchIntegrations, createIntegration, testIntegration,
  syncIntegration, deleteIntegration, fetchContacts, fetchDeals,
  type Integration, type CrmContact, type CrmDeal, type CrmSummary,
} from '@/lib/api-client';

const PROVIDERS = [
  {
    id: 'odoo',
    label: 'Odoo',
    color: '#A855F7',
    description: 'Open-Source ERP — Buchhaltung, CRM, Lager',
    fields: [
      { key: 'db',       label: 'Datenbank-Name', placeholder: 'mein-odoo-db' },
      { key: 'username', label: 'Benutzername',   placeholder: 'admin@beispiel.at' },
      { key: 'password', label: 'API-Key / Passwort', placeholder: '••••••••', type: 'password' },
    ],
    needsBaseUrl: true,
  },
  {
    id: 'hubspot',
    label: 'HubSpot',
    color: '#FF7A59',
    description: 'CRM & Marketing — Kontakte, Deals, E-Mails',
    fields: [
      { key: 'accessToken', label: 'Private App Access Token', placeholder: 'pat-na1-...', type: 'password' },
    ],
    needsBaseUrl: false,
  },
  {
    id: 'salesforce',
    label: 'Salesforce',
    color: '#00A1E0',
    description: 'Enterprise CRM — Kontakte, Opportunities',
    fields: [
      { key: 'instanceUrl',    label: 'Instance URL',    placeholder: 'https://xxx.salesforce.com' },
      { key: 'accessToken',    label: 'Access Token',    placeholder: '••••', type: 'password' },
    ],
    needsBaseUrl: false,
  },
  {
    id: 'pipedrive',
    label: 'Pipedrive',
    color: '#28D19D',
    description: 'Sales-CRM — Deals, Pipeline, Kontakte',
    fields: [
      { key: 'apiToken', label: 'API Token', placeholder: '••••••••', type: 'password' },
    ],
    needsBaseUrl: false,
  },
  {
    id: 'email',
    label: 'E-Mail (IMAP)',
    color: '#3B82F6',
    description: 'E-Mail-Postfach — Mails lesen, durchsuchen, Entwürfe erstellen',
    fields: [
      { key: 'imapHost', label: 'IMAP Server',     placeholder: 'imap.gmail.com' },
      { key: 'imapPort', label: 'IMAP Port',        placeholder: '993' },
      { key: 'email',    label: 'E-Mail-Adresse',   placeholder: 'name@firma.at' },
      { key: 'password', label: 'App-Passwort',     placeholder: '••••••••', type: 'password' },
    ],
    needsBaseUrl: false,
  },
];

const STATUS_COLOR: Record<string, string> = {
  active:  'var(--positive)',
  error:   'var(--negative)',
  pending: 'var(--warning)',
};

export default function IntegrationsPage() {
  const { tenant } = useDashboardData();
  const { toast } = useToast();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);

  // Connect form
  const [showConnect, setShowConnect] = useState(false);
  const [selProvider, setSelProvider] = useState(PROVIDERS[0].id);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [baseUrl, setBaseUrl] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState('');

  // Detail panel
  const [selected, setSelected] = useState<Integration | null>(null);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSummary, setLastSummary] = useState<CrmSummary | null>(null);
  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [deals, setDeals] = useState<CrmDeal[]>([]);
  const [contactSearch, setContactSearch] = useState('');
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [detailTab, setDetailTab] = useState<'overview' | 'contacts' | 'deals'>('overview');
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    fetchIntegrations().then(setIntegrations).finally(() => setLoading(false));
  }, []);

  const providerMeta = (id: string) => PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0];

  // ─── Connect ───────────────────────────────────────────────────────────────
  const handleConnect = async () => {
    const provider = providerMeta(selProvider);
    const missing = provider.fields.some((f) => !fields[f.key]?.trim());
    if (missing) { setConnectError('Bitte alle Felder ausfüllen'); return; }
    setConnecting(true);
    setConnectError('');
    try {
      const payload: Parameters<typeof createIntegration>[0] = {
        provider: selProvider,
        credentials: { ...fields },
        ...(provider.needsBaseUrl && baseUrl ? { baseUrl } : {}),
      };
      await createIntegration(payload);
      const fresh = await fetchIntegrations();
      setIntegrations(fresh);
      setShowConnect(false);
      setFields({});
      setBaseUrl('');
      toast('Integration verbunden', 'success');
    } catch (e: unknown) {
      setConnectError(e instanceof Error ? e.message : 'Verbindung fehlgeschlagen');
      toast('Verbindung fehlgeschlagen', 'error');
    } finally {
      setConnecting(false);
    }
  };

  // ─── Test ──────────────────────────────────────────────────────────────────
  const handleTest = async () => {
    if (!selected) return;
    setTesting(true);
    try {
      const res = await testIntegration(selected.id);
      setIntegrations((prev) => prev.map((i) => i.id === selected.id ? { ...i, status: res.status as Integration['status'] } : i));
      setSelected((s) => s ? { ...s, status: res.status as Integration['status'] } : s);
      toast(res.success ? 'Verbindung erfolgreich' : 'Verbindung fehlgeschlagen', res.success ? 'success' : 'error');
    } catch {
      toast('Verbindungstest fehlgeschlagen', 'error');
    } finally {
      setTesting(false);
    }
  };

  // ─── Sync ──────────────────────────────────────────────────────────────────
  const handleSync = async () => {
    if (!selected) return;
    setSyncing(true);
    try {
      const res = await syncIntegration(selected.id);
      if (res.summary) setLastSummary(res.summary);
      const now = new Date().toISOString();
      setIntegrations((prev) => prev.map((i) => i.id === selected.id ? { ...i, lastSyncedAt: now, status: 'active' } : i));
      setSelected((s) => s ? { ...s, lastSyncedAt: now, status: 'active' } : s);
      toast('Sync abgeschlossen — YAML aktualisiert', 'success');
    } catch {
      toast('Sync fehlgeschlagen', 'error');
    } finally {
      setSyncing(false);
    }
  };

  // ─── Load contacts ─────────────────────────────────────────────────────────
  const loadContacts = async (search?: string) => {
    if (!selected) return;
    setLoadingContacts(true);
    const res = await fetchContacts(selected.id, search);
    setContacts(res);
    setLoadingContacts(false);
  };

  const loadDeals = async () => {
    if (!selected) return;
    const res = await fetchDeals(selected.id);
    setDeals(res);
  };

  useEffect(() => {
    if (!selected) return;
    if (detailTab === 'contacts') loadContacts();
    if (detailTab === 'deals') loadDeals();
  }, [detailTab, selected?.id]);

  // ─── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!selected) return;
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setDeleting(true);
    try {
      await deleteIntegration(selected.id);
      setIntegrations((prev) => prev.filter((i) => i.id !== selected.id));
      setSelected(null);
      toast('Integration entfernt', 'info');
    } catch {
      toast('Löschen fehlgeschlagen', 'error');
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const fmt = (n: number | undefined) => (n ?? 0).toLocaleString('de-AT');

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar tenantName={tenant?.meta?.name} plan={tenant?.meta?.plan} />

      <main style={{ marginLeft: 260, flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>

        {/* Header */}
        <div style={{ padding: '40px 40px 24px', borderBottom: '1px solid var(--border)' }}>
          <p style={{
            fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
            letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 6,
          }}>CRM & INTEGRATIONEN</p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h1 style={{ fontSize: 28, fontWeight: 900, letterSpacing: '-0.03em', color: 'var(--text)' }}>
              Externe Systeme
            </h1>
            <button
              onClick={() => setShowConnect(true)}
              style={{
                padding: '10px 24px', background: 'var(--accent)', border: 'none',
                color: '#080808', fontFamily: 'var(--font-mono)', fontSize: 10,
                fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase',
                cursor: 'pointer',
              }}
            >+ VERBINDEN</button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', flex: 1, overflow: 'hidden' }}>

          {/* ── Left: integrations list ───────────────────────────────── */}
          <div style={{ borderRight: '1px solid var(--border)', overflowY: 'auto' }}>
            {loading && (
              <p style={{ padding: '20px', fontSize: 13, color: 'var(--text-muted)' }}>Lade…</p>
            )}
            {!loading && integrations.length === 0 && (
              <div style={{ padding: '24px' }}>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 16 }}>
                  Noch keine CRM-Verbindung. Verbinde Odoo, HubSpot oder ein anderes System.
                </p>
                {/* Provider teaser */}
                {PROVIDERS.map((p) => (
                  <div key={p.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 0', borderBottom: '1px solid var(--border)',
                  }}>
                    <div style={{
                      width: 8, height: 8, background: p.color, flexShrink: 0,
                    }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>{p.label}</span>
                  </div>
                ))}
              </div>
            )}
            {integrations.map((intg) => {
              const meta = providerMeta(intg.provider);
              const isSelected = selected?.id === intg.id;
              return (
                <button
                  key={intg.id}
                  onClick={() => { setSelected(intg); setDetailTab('overview'); setLastSummary(null); setConfirmDelete(false); }}
                  style={{
                    width: '100%', textAlign: 'left', padding: '16px 20px',
                    border: 'none', cursor: 'pointer',
                    background: isSelected ? 'var(--surface)' : 'transparent',
                    borderLeft: isSelected ? `3px solid ${meta.color}` : '3px solid transparent',
                    borderBottom: '1px solid var(--border)', transition: 'all 0.1s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <div style={{ width: 8, height: 8, background: meta.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{intg.label}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 5, height: 5, background: STATUS_COLOR[intg.status] ?? 'var(--text-muted)' }} />
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700,
                      letterSpacing: '0.1em', textTransform: 'uppercase',
                      color: STATUS_COLOR[intg.status] ?? 'var(--text-muted)',
                    }}>{intg.status}</span>
                    {intg.lastSyncedAt && (
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-muted)', marginLeft: 4 }}>
                        · {new Date(intg.lastSyncedAt).toLocaleDateString('de-AT', { day: 'numeric', month: 'short' })}
                      </span>
                    )}
                  </div>
                  {intg.syncError && (
                    <p style={{ fontSize: 11, color: 'var(--negative)', marginTop: 4, lineHeight: 1.3 }}>
                      {intg.syncError}
                    </p>
                  )}
                </button>
              );
            })}
          </div>

          {/* ── Right: detail panel ───────────────────────────────────── */}
          <div style={{ overflowY: 'auto' }}>

            {/* Connect form overlay */}
            {showConnect && (
              <div style={{ padding: '32px 40px' }}>
                <div style={{
                  background: 'var(--surface)', border: '1px solid var(--accent)',
                  padding: '28px', maxWidth: 520,
                }}>
                  <p style={{
                    fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
                    letterSpacing: '0.15em', color: 'var(--accent)', marginBottom: 20,
                  }}>NEUE INTEGRATION</p>

                  {/* Provider selection */}
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.12em', marginBottom: 8 }}>ANBIETER</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 2, marginBottom: 20 }}>
                    {PROVIDERS.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => { setSelProvider(p.id); setFields({}); setBaseUrl(''); }}
                        style={{
                          padding: '10px 14px', border: 'none', cursor: 'pointer',
                          background: selProvider === p.id ? p.color : 'var(--surface-2)',
                          color: selProvider === p.id ? '#080808' : 'var(--text-muted)',
                          fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
                          letterSpacing: '0.08em', transition: 'all 0.15s', textAlign: 'left',
                        }}
                      >
                        <span style={{ display: 'block' }}>{p.label}</span>
                        <span style={{ fontSize: 8, opacity: 0.7, fontWeight: 500 }}>{p.description}</span>
                      </button>
                    ))}
                  </div>

                  {/* Dynamic fields */}
                  {(() => {
                    const provider = providerMeta(selProvider);
                    return (
                      <>
                        {provider.needsBaseUrl && (
                          <div style={{ marginBottom: 12 }}>
                            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.12em', marginBottom: 6 }}>BASE URL</p>
                            <input
                              value={baseUrl}
                              onChange={(e) => setBaseUrl(e.target.value)}
                              placeholder="https://mein-odoo.beispiel.at"
                              style={{
                                width: '100%', padding: '10px 14px', fontSize: 13,
                                background: 'var(--bg)', border: '1px solid var(--border)',
                                color: 'var(--text)', boxSizing: 'border-box',
                              }}
                            />
                          </div>
                        )}
                        {provider.fields.map((f) => (
                          <div key={f.key} style={{ marginBottom: 12 }}>
                            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.12em', marginBottom: 6 }}>{f.label.toUpperCase()}</p>
                            <input
                              type={f.type ?? 'text'}
                              value={fields[f.key] ?? ''}
                              onChange={(e) => setFields((prev) => ({ ...prev, [f.key]: e.target.value }))}
                              placeholder={f.placeholder}
                              style={{
                                width: '100%', padding: '10px 14px', fontSize: 13,
                                background: 'var(--bg)', border: '1px solid var(--border)',
                                color: 'var(--text)', boxSizing: 'border-box',
                              }}
                            />
                          </div>
                        ))}
                        <p style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 16, marginTop: 4 }}>
                          🔒 Zugangsdaten werden AES-256-GCM verschlüsselt gespeichert — nie im Klartext.
                        </p>
                      </>
                    );
                  })()}

                  {connectError && (
                    <p style={{ fontSize: 12, color: 'var(--negative)', marginBottom: 12 }}>{connectError}</p>
                  )}

                  <div style={{ display: 'flex', gap: 2 }}>
                    <button
                      onClick={handleConnect}
                      disabled={connecting}
                      style={{
                        padding: '10px 24px', background: connecting ? 'var(--surface)' : 'var(--accent)',
                        border: 'none', color: connecting ? 'var(--text-muted)' : '#080808',
                        fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 800,
                        letterSpacing: '0.1em', textTransform: 'uppercase',
                        cursor: connecting ? 'default' : 'pointer',
                      }}
                    >{connecting ? '… VERBINDE & TESTE' : 'VERBINDEN →'}</button>
                    <button
                      onClick={() => { setShowConnect(false); setConnectError(''); setFields({}); }}
                      style={{
                        padding: '10px 18px', background: 'transparent',
                        border: '1px solid var(--border)', color: 'var(--text-muted)',
                        fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
                        letterSpacing: '0.08em', cursor: 'pointer',
                      }}
                    >ABBRECHEN</button>
                  </div>
                </div>
              </div>
            )}

            {/* Selected integration detail */}
            {!showConnect && selected && (() => {
              const meta = providerMeta(selected.provider);
              return (
                <div style={{ padding: '32px 40px' }}>
                  {/* Integration header */}
                  <div style={{
                    display: 'flex', alignItems: 'flex-start', gap: 16,
                    marginBottom: 24, paddingBottom: 20, borderBottom: '1px solid var(--border)',
                  }}>
                    <div style={{
                      width: 12, height: 12, background: meta.color,
                      marginTop: 6, flexShrink: 0,
                    }} />
                    <div style={{ flex: 1 }}>
                      <h2 style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.02em', color: 'var(--text)', marginBottom: 4 }}>
                        {selected.label}
                      </h2>
                      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
                        {selected.provider.toUpperCase()} · {meta.description}
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: 2 }}>
                      <button
                        onClick={handleTest}
                        disabled={testing}
                        style={{
                          padding: '8px 16px', background: 'transparent',
                          border: '1px solid var(--border)', color: 'var(--text-muted)',
                          fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700,
                          letterSpacing: '0.08em', cursor: testing ? 'default' : 'pointer',
                          opacity: testing ? 0.6 : 1,
                        }}
                      >{testing ? '…' : '⚡ TESTEN'}</button>
                      <button
                        onClick={handleSync}
                        disabled={syncing}
                        style={{
                          padding: '8px 16px',
                          background: syncing ? 'var(--surface)' : 'var(--accent)',
                          border: 'none', color: syncing ? 'var(--text-muted)' : '#080808',
                          fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 800,
                          letterSpacing: '0.08em', cursor: syncing ? 'default' : 'pointer',
                        }}
                      >{syncing ? '… SYNC' : '↻ SYNC'}</button>
                    </div>
                  </div>

                  {/* Tabs */}
                  <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '1px solid var(--border)' }}>
                    {[
                      { id: 'overview',  label: 'ÜBERSICHT' },
                      { id: 'contacts',  label: 'KONTAKTE' },
                      { id: 'deals',     label: 'DEALS' },
                    ].map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setDetailTab(t.id as typeof detailTab)}
                        style={{
                          padding: '10px 18px', border: 'none', cursor: 'pointer',
                          background: 'transparent',
                          borderBottom: detailTab === t.id ? `2px solid ${meta.color}` : '2px solid transparent',
                          fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700,
                          letterSpacing: '0.1em', color: detailTab === t.id ? 'var(--text)' : 'var(--text-muted)',
                          transition: 'all 0.15s',
                        }}
                      >{t.label}</button>
                    ))}
                  </div>

                  {/* Overview tab */}
                  {detailTab === 'overview' && (
                    <div>
                      {/* Status + last sync */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2, marginBottom: 20 }}>
                        {[
                          { label: 'STATUS',      value: selected.status.toUpperCase(), color: STATUS_COLOR[selected.status] },
                          { label: 'LETZTER SYNC', value: selected.lastSyncedAt ? new Date(selected.lastSyncedAt).toLocaleDateString('de-AT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—' },
                          { label: 'VERBUNDEN',   value: new Date(selected.createdAt).toLocaleDateString('de-AT', { day: 'numeric', month: 'short', year: 'numeric' }) },
                        ].map((s) => (
                          <div key={s.label} style={{ background: 'var(--surface)', padding: '14px 16px' }}>
                            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--text-muted)', marginBottom: 6 }}>{s.label}</p>
                            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 900, color: (s as {color?: string}).color ?? 'var(--text)' }}>{s.value}</p>
                          </div>
                        ))}
                      </div>

                      {/* Last sync summary */}
                      {lastSummary && (
                        <div style={{ marginBottom: 20 }}>
                          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--text-muted)', marginBottom: 10 }}>SYNC-ERGEBNIS</p>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2 }}>
                            {((lastSummary as any).provider === 'email' ? [
                              { label: 'LETZTE MAILS',  value: fmt((lastSummary as any).recentEmails) },
                              { label: 'UNGELESEN',      value: fmt((lastSummary as any).unreadEmails) },
                              { label: 'NEUESTE',        value: String((lastSummary as any).latestSubject || '—') },
                            ] : [
                              { label: 'KONTAKTE',  value: fmt(lastSummary.totalContacts) },
                              { label: 'DEALS',     value: fmt(lastSummary.openDeals) },
                              { label: 'UMSATZ',    value: `${lastSummary.currency ?? 'EUR'} ${fmt(lastSummary.totalRevenue)}` },
                            ]).map((s) => (
                              <div key={s.label} style={{ background: 'var(--surface)', padding: '14px 16px', borderLeft: `3px solid ${meta.color}` }}>
                                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--text-muted)', marginBottom: 6 }}>{s.label}</p>
                                <p style={{ fontSize: 18, fontWeight: 900, color: 'var(--text)', letterSpacing: '-0.02em' }}>{s.value}</p>
                              </div>
                            ))}
                          </div>
                          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                            ↳ Daten wurden ins YAML-Profil übernommen — alle Agenten haben Zugriff.
                          </p>
                        </div>
                      )}

                      {/* Delete */}
                      <div style={{ marginTop: 32, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
                        <button
                          onClick={handleDelete}
                          disabled={deleting}
                          onMouseLeave={() => setConfirmDelete(false)}
                          style={{
                            padding: '9px 18px', border: `1px solid var(--negative)`,
                            background: confirmDelete ? 'var(--negative)' : 'transparent',
                            color: confirmDelete ? '#080808' : 'var(--negative)',
                            fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 800,
                            letterSpacing: '0.1em', textTransform: 'uppercase',
                            cursor: deleting ? 'default' : 'pointer', transition: 'all 0.15s',
                          }}
                        >
                          {deleting ? '… LÖSCHE' : confirmDelete ? 'WIRKLICH LÖSCHEN ?' : '✕ VERBINDUNG TRENNEN'}
                        </button>
                        {confirmDelete && (
                          <p style={{ fontSize: 11, color: 'var(--negative)', marginTop: 6 }}>
                            Zugangsdaten werden unwiderruflich gelöscht. Erneut klicken zum Bestätigen.
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Contacts tab */}
                  {detailTab === 'contacts' && (
                    <div>
                      <div style={{ display: 'flex', gap: 2, marginBottom: 16 }}>
                        <input
                          value={contactSearch}
                          onChange={(e) => setContactSearch(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && loadContacts(contactSearch)}
                          placeholder="Name oder E-Mail suchen…"
                          style={{
                            flex: 1, padding: '10px 14px', fontSize: 13,
                            background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)',
                          }}
                        />
                        <button
                          onClick={() => loadContacts(contactSearch)}
                          style={{
                            padding: '10px 18px', background: 'var(--accent)', border: 'none',
                            color: '#080808', fontFamily: 'var(--font-mono)', fontSize: 9,
                            fontWeight: 800, cursor: 'pointer', letterSpacing: '0.08em',
                          }}
                        >SUCHEN</button>
                      </div>
                      {loadingContacts && <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Lade…</p>}
                      {!loadingContacts && contacts.length === 0 && (
                        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Keine Kontakte — erst Sync starten.</p>
                      )}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {contacts.map((c) => (
                          <div key={String(c.id)} style={{
                            display: 'flex', alignItems: 'center', gap: 12,
                            padding: '12px 16px', background: 'var(--surface)',
                          }}>
                            <div style={{
                              width: 28, height: 28, background: meta.color, color: '#080808',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 10, fontWeight: 900, flexShrink: 0,
                            }}>{c.name[0].toUpperCase()}</div>
                            <div style={{ flex: 1 }}>
                              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{c.name}</p>
                              {c.email && <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.email}</p>}
                            </div>
                            {c.company && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.company}</span>}
                            {c.phone && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}>{c.phone}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Deals tab */}
                  {detailTab === 'deals' && (
                    <div>
                      {deals.length === 0 && (
                        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Keine Deals — erst Sync starten.</p>
                      )}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {deals.map((d) => (
                          <div key={String(d.id)} style={{
                            display: 'flex', alignItems: 'center', gap: 16,
                            padding: '14px 18px', background: 'var(--surface)',
                          }}>
                            <div style={{ flex: 1 }}>
                              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>{d.name}</p>
                              <span style={{
                                fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700,
                                letterSpacing: '0.08em', textTransform: 'uppercase',
                                padding: '2px 8px', background: 'var(--surface-2)', color: 'var(--text-muted)',
                              }}>{d.stage}</span>
                            </div>
                            {d.amount != null && (
                              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 900, color: 'var(--positive)', flexShrink: 0 }}>
                                {d.currency ?? '€'} {fmt(d.amount)}
                              </span>
                            )}
                            {d.probability != null && (
                              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>
                                {d.probability}%
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Empty state */}
            {!showConnect && !selected && (
              <div style={{ padding: '60px 40px' }}>
                <p style={{
                  fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
                  letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 12,
                }}>KEIN SYSTEM AUSGEWÄHLT</p>
                <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.7, maxWidth: 400 }}>
                  Verbinde dein CRM-System um Kontakte, Deals und Rechnungen direkt im Dashboard zu sehen — und von deinen Agenten analysieren zu lassen.
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
