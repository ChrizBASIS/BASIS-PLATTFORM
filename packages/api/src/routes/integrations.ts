import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db/index.js';
import { integrations, integrationSyncLog, auditLog, agentMemory } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth.js';
import { tenantMiddleware } from '../middleware/tenant.js';
import { rbac } from '../middleware/rbac.js';
import { encryptCredentials } from '../lib/crypto.js';
import { createAdapter, createMailAdapter, SUPPORTED_PROVIDERS } from '../integrations/registry.js';
import { syncTenantYAML } from '../lib/tenant-yaml.js';

const app = new Hono();

// ─── GET /integrations/providers — Verfügbare CRM-Anbieter ──────────────────
app.get('/providers', authMiddleware, tenantMiddleware, async (c) => {
  return c.json({ providers: SUPPORTED_PROVIDERS });
});

// ─── POST /integrations — Neue CRM-Verbindung einrichten ────────────────────
const createSchema = z.object({
  provider: z.enum(['odoo', 'hubspot', 'salesforce', 'pipedrive', 'custom', 'email']),
  label: z.string().optional(),
  baseUrl: z.string().url().optional(),
  credentials: z.record(z.string()),
});

app.post('/', authMiddleware, tenantMiddleware, rbac('integration', 'create'), async (c) => {
  const tenantId = c.get('tenantId');
  const user = c.get('user');
  const body = await c.req.json();
  const parsed = createSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: 'Ungültige Eingabe', details: parsed.error.flatten() }, 400);
  }

  const { provider, label, baseUrl, credentials } = parsed.data;

  // Normalize credential keys: Dashboard sends baseUrl separately and uses
  // "password" for Odoo, but the adapter expects "url" and "apiKey" inside credentials.
  const normalizedCreds = { ...credentials };
  if (provider === 'odoo') {
    if (baseUrl && !normalizedCreds.url) normalizedCreds.url = baseUrl;
    if (normalizedCreds.password && !normalizedCreds.apiKey) {
      normalizedCreds.apiKey = normalizedCreds.password;
      delete normalizedCreds.password;
    }
  }
  // Normalize email credentials: imapPort stored as string; ImapMailAdapter converts with Number()
  if (provider === 'email' && normalizedCreds.imapPort) {
    normalizedCreds.imapPort = String(normalizedCreds.imapPort);
  }

  // Encrypt credentials — they never touch DB in plaintext
  const encrypted = encryptCredentials(JSON.stringify(normalizedCreds));

  // Test connection before saving
  try {
    let ok: boolean;
    if (provider === 'email') {
      const mailAdapter = createMailAdapter(encrypted);
      ok = await mailAdapter.testConnection();
    } else {
      const adapter = createAdapter(provider as any, encrypted);
      ok = await adapter.testConnection();
    }
    if (!ok) {
      return c.json({ error: 'Verbindung fehlgeschlagen — bitte Zugangsdaten prüfen' }, 400);
    }
  } catch (err: any) {
    console.error('[integrations] Connection test error:', err?.message, err?.cause);
    return c.json({ error: `Verbindungstest fehlgeschlagen: ${err?.message ?? 'Unbekannt'}` }, 400);
  }

  // Save integration
  const [integration] = await db
    .insert(integrations)
    .values({
      tenantId,
      provider,
      label: label ?? provider,
      baseUrl,
      credentialsEncrypted: encrypted.encrypted,
      credentialsIv: encrypted.iv,
      credentialsTag: encrypted.tag,
    })
    .returning();

  // Audit
  await db.insert(auditLog).values({
    tenantId,
    userId: user.sub,
    action: 'integration.created',
    resource: 'integration',
    details: { integrationId: integration.id, provider, label },
  });

  return c.json({
    id: integration.id,
    provider,
    label: integration.label,
    status: integration.status,
  }, 201);
});

// ─── GET /integrations — Aktive Integrationen auflisten ──────────────────────
app.get('/', authMiddleware, tenantMiddleware, rbac('integration', 'read'), async (c) => {
  const tenantId = c.get('tenantId');

  const items = await db
    .select({
      id: integrations.id,
      provider: integrations.provider,
      label: integrations.label,
      status: integrations.status,
      lastSyncedAt: integrations.lastSyncedAt,
      syncError: integrations.syncError,
      createdAt: integrations.createdAt,
    })
    .from(integrations)
    .where(eq(integrations.tenantId, tenantId));

  // NEVER return credentials
  return c.json({ integrations: items });
});

// ─── POST /integrations/:id/test — Verbindung testen ────────────────────────
app.post('/:id/test', authMiddleware, tenantMiddleware, rbac('integration', 'manage'), async (c) => {
  const tenantId = c.get('tenantId');
  const integrationId = c.req.param('id');

  const [integration] = await db
    .select()
    .from(integrations)
    .where(and(eq(integrations.id, integrationId), eq(integrations.tenantId, tenantId)))
    .limit(1);

  if (!integration) return c.json({ error: 'Integration nicht gefunden' }, 404);

  try {
    const encData = {
      encrypted: integration.credentialsEncrypted,
      iv: integration.credentialsIv,
      tag: integration.credentialsTag,
    };

    let ok: boolean;
    if (integration.provider === 'email') {
      const mailAdapter = createMailAdapter(encData);
      ok = await mailAdapter.testConnection();
    } else {
      const adapter = createAdapter(integration.provider as any, encData);
      ok = await adapter.testConnection();
    }
    const newStatus = ok ? 'active' : 'error';

    await db
      .update(integrations)
      .set({ status: newStatus, syncError: ok ? null : 'Connection test failed' })
      .where(eq(integrations.id, integrationId));

    return c.json({ success: ok, status: newStatus });
  } catch (err: any) {
    await db
      .update(integrations)
      .set({ status: 'error', syncError: err?.message })
      .where(eq(integrations.id, integrationId));

    return c.json({ success: false, error: 'Verbindungstest fehlgeschlagen' }, 500);
  }
});

// ─── POST /integrations/:id/sync — Sync auslösen ────────────────────────────
app.post('/:id/sync', authMiddleware, tenantMiddleware, rbac('integration', 'manage'), async (c) => {
  const tenantId = c.get('tenantId');
  const user = c.get('user');
  const integrationId = c.req.param('id');

  const [integration] = await db
    .select()
    .from(integrations)
    .where(and(eq(integrations.id, integrationId), eq(integrations.tenantId, tenantId)))
    .limit(1);

  if (!integration) return c.json({ error: 'Integration nicht gefunden' }, 404);

  const start = Date.now();

  try {
    const encData = {
      encrypted: integration.credentialsEncrypted,
      iv: integration.credentialsIv,
      tag: integration.credentialsTag,
    };

    let summary: any;
    let recordsSynced = 0;

    if (integration.provider === 'email') {
      // Email sync: test connection + count recent emails
      const mailAdapter = createMailAdapter(encData);
      const ok = await mailAdapter.testConnection();
      if (!ok) throw new Error('E-Mail-Verbindung fehlgeschlagen');
      const recent = await mailAdapter.getRecentEmails(5, 'INBOX');
      const unread = recent.filter(e => !e.read).length;
      summary = {
        provider: 'email',
        connected: true,
        recentEmails: recent.length,
        unreadEmails: unread,
        latestSubject: recent[0]?.subject ?? '(keine Mails)',
        latestFrom: recent[0]?.from ?? '',
        latestDate: recent[0]?.date ?? '',
      };
      recordsSynced = recent.length;
    } else {
      // CRM sync: get aggregated summary
      const adapter = createAdapter(integration.provider as any, encData);
      const raw: any = await adapter.getSummary();
      summary = {
        totalContacts: raw.totalContacts ?? 0,
        openDeals: raw.openDeals ?? 0,
        totalRevenue: raw.revenuePipeline ?? raw.totalRevenue ?? 0,
        currency: raw.pipelineCurrency ?? raw.currency ?? 'EUR',
        openInvoices: raw.openInvoices ?? 0,
        overdueInvoices: raw.overdueInvoices ?? 0,
      };
      recordsSynced = (summary.totalContacts ?? 0) + (summary.openDeals ?? 0);
    }

    const durationMs = Date.now() - start;

    // Update integration status
    await db
      .update(integrations)
      .set({ lastSyncedAt: new Date(), status: 'active', syncError: null })
      .where(eq(integrations.id, integrationId));

    // Log sync
    await db.insert(integrationSyncLog).values({
      integrationId,
      tenantId,
      action: 'sync',
      recordsSynced,
      durationMs,
    });

    // Audit
    await db.insert(auditLog).values({
      tenantId,
      userId: user.sub,
      action: 'integration.synced',
      resource: 'integration',
      details: { integrationId, provider: integration.provider, durationMs },
    });

    // For CRM integrations: persist summary in agent_memory so YAML crm_summary field is populated
    if (integration.provider !== 'email') {
      const memKey = 'crm_summary';
      const existing = await db
        .select({ id: agentMemory.id })
        .from(agentMemory)
        .where(and(eq(agentMemory.tenantId, tenantId), eq(agentMemory.key, memKey)))
        .limit(1);
      if (existing.length > 0) {
        await db.update(agentMemory).set({ value: summary, updatedAt: new Date() }).where(eq(agentMemory.id, existing[0].id));
      } else {
        await db.insert(agentMemory).values({ tenantId, key: memKey, value: summary });
      }
    }

    // Update tenant YAML
    await syncTenantYAML(tenantId);

    return c.json({ success: true, summary, durationMs });
  } catch (err: any) {
    const durationMs = Date.now() - start;

    await db
      .update(integrations)
      .set({ status: 'error', syncError: err?.message })
      .where(eq(integrations.id, integrationId));

    await db.insert(integrationSyncLog).values({
      integrationId,
      tenantId,
      action: 'sync',
      error: err?.message,
      durationMs,
    });

    console.error('[integrations] Sync error:', err?.message, err?.stack?.slice(0, 300));
    return c.json({ success: false, error: 'Sync fehlgeschlagen' }, 500);
  }
});

// ─── GET /integrations/:id/contacts — On-demand Kontaktabfrage ──────────────
app.get('/:id/contacts', authMiddleware, tenantMiddleware, rbac('integration', 'read'), async (c) => {
  const tenantId = c.get('tenantId');
  const integrationId = c.req.param('id');
  const search = c.req.query('search');
  const limit = parseInt(c.req.query('limit') ?? '20');

  const [integration] = await db
    .select()
    .from(integrations)
    .where(and(eq(integrations.id, integrationId), eq(integrations.tenantId, tenantId)))
    .limit(1);

  if (!integration) return c.json({ error: 'Integration nicht gefunden' }, 404);

  const adapter = createAdapter(integration.provider as any, {
    encrypted: integration.credentialsEncrypted,
    iv: integration.credentialsIv,
    tag: integration.credentialsTag,
  });

  try {
    const raw = await adapter.getContacts(limit, search);
    const contacts = raw.map((r: any) => ({
      id: r.externalId ?? r.id,
      name: r.name,
      email: r.email ?? null,
      phone: r.phone ?? null,
      company: r.company ?? null,
    }));

    await db.insert(integrationSyncLog).values({
      integrationId, tenantId, action: 'read', recordsSynced: contacts.length,
    });

    return c.json({ contacts });
  } catch (err: any) {
    console.error('[integrations] Contacts error:', err?.message);
    return c.json({ error: 'Kontakte konnten nicht geladen werden' }, 500);
  }
});

// ─── GET /integrations/:id/deals — On-demand Deals ──────────────────────────
app.get('/:id/deals', authMiddleware, tenantMiddleware, rbac('integration', 'read'), async (c) => {
  const tenantId = c.get('tenantId');
  const integrationId = c.req.param('id');

  const [integration] = await db
    .select()
    .from(integrations)
    .where(and(eq(integrations.id, integrationId), eq(integrations.tenantId, tenantId)))
    .limit(1);

  if (!integration) return c.json({ error: 'Integration nicht gefunden' }, 404);

  const adapter = createAdapter(integration.provider as any, {
    encrypted: integration.credentialsEncrypted,
    iv: integration.credentialsIv,
    tag: integration.credentialsTag,
  });

  try {
    const raw = await adapter.getDeals();
    const deals = raw.map((d: any) => ({
      id: d.externalId ?? d.id,
      name: d.title ?? d.name ?? '',
      stage: d.stage ?? 'Unknown',
      amount: d.value ?? d.amount ?? null,
      currency: d.currency ?? 'EUR',
      probability: d.probability ?? null,
    }));
    return c.json({ deals });
  } catch (err: any) {
    console.error('[integrations] Deals error:', err?.message);
    return c.json({ error: 'Deals konnten nicht geladen werden' }, 500);
  }
});

// ─── GET /integrations/:id/invoices — On-demand Rechnungen ──────────────────
app.get('/:id/invoices', authMiddleware, tenantMiddleware, rbac('integration', 'read'), async (c) => {
  const tenantId = c.get('tenantId');
  const integrationId = c.req.param('id');
  const status = c.req.query('status');

  const [integration] = await db
    .select()
    .from(integrations)
    .where(and(eq(integrations.id, integrationId), eq(integrations.tenantId, tenantId)))
    .limit(1);

  if (!integration) return c.json({ error: 'Integration nicht gefunden' }, 404);

  const adapter = createAdapter(integration.provider as any, {
    encrypted: integration.credentialsEncrypted,
    iv: integration.credentialsIv,
    tag: integration.credentialsTag,
  });

  try {
    const raw = await adapter.getInvoices(50, status);
    const invoices = raw.map((r: any) => ({
      id: r.externalId ?? r.id,
      number: r.number ?? '',
      amount: r.amount ?? 0,
      currency: r.currency ?? 'EUR',
      status: r.status ?? 'draft',
      dueDate: r.dueDate ?? null,
      contactName: r.contactName ?? null,
    }));
    return c.json({ invoices });
  } catch (err: any) {
    console.error('[integrations] Invoices error:', err?.message);
    return c.json({ error: 'Rechnungen konnten nicht geladen werden' }, 500);
  }
});

// ─── DELETE /integrations/:id — Sofort-Widerruf ─────────────────────────────
app.delete('/:id', authMiddleware, tenantMiddleware, rbac('integration', 'manage'), async (c) => {
  const tenantId = c.get('tenantId');
  const user = c.get('user');
  const integrationId = c.req.param('id');

  const [integration] = await db
    .select({ id: integrations.id, provider: integrations.provider })
    .from(integrations)
    .where(and(eq(integrations.id, integrationId), eq(integrations.tenantId, tenantId)))
    .limit(1);

  if (!integration) return c.json({ error: 'Integration nicht gefunden' }, 404);

  // HARD DELETE — credentials are gone forever, no soft-delete
  await db.delete(integrationSyncLog).where(eq(integrationSyncLog.integrationId, integrationId));
  await db.delete(integrations).where(eq(integrations.id, integrationId));

  // Audit
  await db.insert(auditLog).values({
    tenantId,
    userId: user.sub,
    action: 'integration.deleted',
    resource: 'integration',
    details: { integrationId, provider: integration.provider },
  });

  // Update YAML (remove CRM data)
  await syncTenantYAML(tenantId);

  return c.json({ success: true, message: 'Integration und Zugangsdaten unwiderruflich gelöscht' });
});

export { app as integrationRoutes };
