import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db/index.js';
import { supportSessions, auditLog, tenants } from '../db/schema.js';
import { eq, and, isNull, gt } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth.js';
import { tenantMiddleware } from '../middleware/tenant.js';
import { rbac } from '../middleware/rbac.js';
import { nanoid } from 'nanoid';

const app = new Hono();

// ─── POST /support/sessions — Support-Session starten ────────────────────────
// Nur BASIS-Team mit basis_support Rolle kann das
const createSessionSchema = z.object({
  targetTenantId: z.string().uuid(),
  reason: z.string().min(5).max(500),
  durationMinutes: z.number().min(15).max(480).default(60),
});

app.post('/sessions', authMiddleware, tenantMiddleware, rbac('support', 'create'), async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const parsed = createSessionSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: 'Ungültige Eingabe', details: parsed.error.flatten() }, 400);
  }

  const { targetTenantId, reason, durationMinutes } = parsed.data;

  // Prüfe ob Ziel-Tenant existiert
  const [tenant] = await db
    .select()
    .from(tenants)
    .where(and(eq(tenants.id, targetTenantId), isNull(tenants.deletedAt)))
    .limit(1);

  if (!tenant) {
    return c.json({ error: 'Tenant nicht gefunden' }, 404);
  }

  // Zeitlich begrenzten Token generieren
  const accessToken = `bsup_${nanoid(48)}`;
  const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000);

  const [session] = await db
    .insert(supportSessions)
    .values({
      tenantId: targetTenantId,
      supportUserId: user.sub,
      reason,
      accessToken,
      expiresAt,
    })
    .returning();

  // Audit-Log
  await db.insert(auditLog).values({
    tenantId: targetTenantId,
    userId: user.sub,
    action: 'support.session.created',
    resource: 'support_session',
    details: {
      sessionId: session.id,
      reason,
      durationMinutes,
      expiresAt: expiresAt.toISOString(),
      supportUser: user.email,
    },
  });

  return c.json({
    session: {
      id: session.id,
      tenantId: targetTenantId,
      tenantName: tenant.name,
      accessToken,
      expiresAt: expiresAt.toISOString(),
      reason,
    },
  }, 201);
});

// ─── GET /support/sessions — Aktive Sessions auflisten ───────────────────────
app.get('/sessions', authMiddleware, tenantMiddleware, rbac('support', 'read'), async (c) => {
  const now = new Date();

  const sessions = await db
    .select({
      id: supportSessions.id,
      tenantId: supportSessions.tenantId,
      tenantName: tenants.name,
      supportUserId: supportSessions.supportUserId,
      reason: supportSessions.reason,
      expiresAt: supportSessions.expiresAt,
      createdAt: supportSessions.createdAt,
    })
    .from(supportSessions)
    .innerJoin(tenants, eq(supportSessions.tenantId, tenants.id))
    .where(
      and(
        isNull(supportSessions.revokedAt),
        gt(supportSessions.expiresAt, now),
      ),
    )
    .orderBy(supportSessions.createdAt);

  return c.json({ sessions });
});

// ─── POST /support/sessions/:id/revoke — Session vorzeitig beenden ──────────
app.post('/sessions/:id/revoke', authMiddleware, tenantMiddleware, rbac('support', 'manage'), async (c) => {
  const sessionId = c.req.param('id');
  const user = c.get('user');

  const [session] = await db
    .select()
    .from(supportSessions)
    .where(
      and(
        eq(supportSessions.id, sessionId),
        isNull(supportSessions.revokedAt),
      ),
    )
    .limit(1);

  if (!session) {
    return c.json({ error: 'Session nicht gefunden oder bereits beendet' }, 404);
  }

  await db
    .update(supportSessions)
    .set({ revokedAt: new Date() })
    .where(eq(supportSessions.id, sessionId));

  // Audit-Log
  await db.insert(auditLog).values({
    tenantId: session.tenantId,
    userId: user.sub,
    action: 'support.session.revoked',
    resource: 'support_session',
    details: {
      sessionId,
      revokedBy: user.email,
    },
  });

  return c.json({ success: true });
});

// ─── POST /support/sessions/:id/extend — Session verlängern ─────────────────
const extendSchema = z.object({
  additionalMinutes: z.number().min(15).max(240),
});

app.post('/sessions/:id/extend', authMiddleware, tenantMiddleware, rbac('support', 'manage'), async (c) => {
  const sessionId = c.req.param('id');
  const user = c.get('user');
  const body = await c.req.json();
  const parsed = extendSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: 'Ungültige Eingabe' }, 400);
  }

  const [session] = await db
    .select()
    .from(supportSessions)
    .where(
      and(
        eq(supportSessions.id, sessionId),
        isNull(supportSessions.revokedAt),
      ),
    )
    .limit(1);

  if (!session) {
    return c.json({ error: 'Session nicht gefunden oder bereits beendet' }, 404);
  }

  const newExpiry = new Date(
    Math.max(session.expiresAt.getTime(), Date.now()) +
    parsed.data.additionalMinutes * 60 * 1000,
  );

  await db
    .update(supportSessions)
    .set({ expiresAt: newExpiry })
    .where(eq(supportSessions.id, sessionId));

  // Audit-Log
  await db.insert(auditLog).values({
    tenantId: session.tenantId,
    userId: user.sub,
    action: 'support.session.extended',
    resource: 'support_session',
    details: {
      sessionId,
      newExpiresAt: newExpiry.toISOString(),
      additionalMinutes: parsed.data.additionalMinutes,
      extendedBy: user.email,
    },
  });

  return c.json({ success: true, expiresAt: newExpiry.toISOString() });
});

// ─── GET /support/active — Für Kunden: Ist gerade Support aktiv? ────────────
// Kein rbac nötig — jeder authentifizierte User im Tenant darf wissen ob Support da ist
app.get('/active', authMiddleware, tenantMiddleware, async (c) => {
  const tenantId = c.get('tenantId');
  const now = new Date();

  const [active] = await db
    .select({
      id: supportSessions.id,
      reason: supportSessions.reason,
      expiresAt: supportSessions.expiresAt,
      createdAt: supportSessions.createdAt,
    })
    .from(supportSessions)
    .where(
      and(
        eq(supportSessions.tenantId, tenantId),
        isNull(supportSessions.revokedAt),
        gt(supportSessions.expiresAt, now),
      ),
    )
    .limit(1);

  if (!active) {
    return c.json({ active: false });
  }

  return c.json({
    active: true,
    session: {
      reason: active.reason,
      expiresAt: active.expiresAt,
      startedAt: active.createdAt,
    },
  });
});

// ─── POST /support/request — Kunde kann Support anfordern ───────────────────
const requestSchema = z.object({
  reason: z.string().min(5).max(500),
});

app.post('/request', authMiddleware, tenantMiddleware, async (c) => {
  const user = c.get('user');
  const tenantId = c.get('tenantId');
  const body = await c.req.json();
  const parsed = requestSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: 'Bitte Grund angeben' }, 400);
  }

  // Audit-Log als Support-Anfrage (wird vom BASIS-Team abgeholt)
  await db.insert(auditLog).values({
    tenantId,
    userId: user.sub,
    action: 'support.requested',
    resource: 'support_session',
    details: {
      reason: parsed.data.reason,
      requestedBy: user.email,
    },
  });

  return c.json({
    success: true,
    message: 'Support-Anfrage wurde gesendet. Das BASIS-Team wird sich in Kürze melden.',
  });
});

export { app as supportRoutes };
