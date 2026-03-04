import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db/index.js';
import { integrations, integrationSyncLog, auditLog } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth.js';
import { tenantMiddleware } from '../middleware/tenant.js';
import { rbac } from '../middleware/rbac.js';
import { encryptCredentials } from '../lib/crypto.js';
import { createAdapter, SUPPORTED_PROVIDERS } from '../integrations/registry.js';
import { syncTenantYAML } from '../lib/tenant-yaml.js';

const app = new Hono();

// ─── GET /integrations/providers — Verfügbare CRM-Anbieter ──────────────────
app.get('/providers', authMiddleware, tenantMiddleware, async (c) => {
  return c.json({ providers: SUPPORTED_PROVIDERS });
});

// ─── POST /integrations — Neue CRM-Verbindung einrichten ────────────────────
const createSchema = z.object({
  provider: z.enum(['odoo', 'hubspot', 'salesforce', 'pipedrive', 'custom']),
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

  // Encrypt credentials — they never touch DB in plaintext
  const encrypted = encryptCredentials(JSON.stringify(credentials));

  // Test connection before saving
  try {
    const adapter = createAdapter(provider as any, encrypted);
    const ok = await adapter.testConnection();
    if (!ok) {
      return c.json({ error: 'Verbindung fehlgeschlagen — bitte Zugangsdaten prüfen' }, 400);
    }
  } catch (err: any) {
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
    const adapter = createAdapter(integration.provider as any, {
      encrypted: integration.credentialsEncrypted,
      iv: integration.credentialsIv,
      tag: integration.credentialsTag,
    });

    const ok = await adapter.testConnection();
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
    const adapter = createAdapter(integration.provider as any, {
      encrypted: integration.credentialsEncrypted,
      iv: integration.credentialsIv,
      tag: integration.credentialsTag,
    });

    // Get aggregated summary — NO raw data stored
    const summary = await adapter.getSummary();
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
      recordsSynced: summary.totalContacts + summary.openDeals,
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

    // Update tenant YAML with CRM summary
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

  const contacts = await adapter.getContacts(limit, search);

  // Log the read access
  await db.insert(integrationSyncLog).values({
    integrationId, tenantId, action: 'read', recordsSynced: contacts.length,
  });

  return c.json({ contacts });
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

  const deals = await adapter.getDeals();
  return c.json({ deals });
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

  const invoices = await adapter.getInvoices(50, status);
  return c.json({ invoices });
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
