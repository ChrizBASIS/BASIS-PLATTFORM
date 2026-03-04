import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db/index.js';
import { sandboxSessions, projects } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth.js';
import { tenantMiddleware } from '../middleware/tenant.js';
import { rbac } from '../middleware/rbac.js';

const sandboxRouter = new Hono();

sandboxRouter.use('/*', authMiddleware, tenantMiddleware);

// POST /sandbox/session — Start new sandbox session
sandboxRouter.post('/session', rbac('sandbox', 'create'), async (c) => {
  const user = c.get('user');
  const body = await c.req.json();

  const input = z
    .object({
      projectId: z.string().uuid(),
    })
    .parse(body);

  const branchName = `sandbox/${user.sub.slice(0, 8)}-${Date.now()}`;

  const [session] = await db
    .insert(sandboxSessions)
    .values({
      projectId: input.projectId,
      userId: user.sub,
      branchName,
      status: 'active',
      changes: [],
    })
    .returning();

  // TODO: Create git branch + start preview container

  return c.json({ session }, 201);
});

// GET /sandbox/session/:id — Session status + preview URL
sandboxRouter.get('/session/:id', rbac('sandbox', 'read'), async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');

  const [session] = await db
    .select()
    .from(sandboxSessions)
    .innerJoin(projects, eq(sandboxSessions.projectId, projects.id))
    .where(and(eq(sandboxSessions.id, id), eq(projects.tenantId, tenantId)))
    .limit(1);

  if (!session) {
    return c.json({ error: 'Session not found' }, 404);
  }

  return c.json({ session: session.sandbox_sessions });
});

// POST /sandbox/session/:id/widget — Create/modify widget in sandbox (via Nico)
sandboxRouter.post('/session/:id/widget', rbac('sandbox', 'create'), async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');

  // Verify session belongs to tenant
  const [session] = await db
    .select({ id: sandboxSessions.id })
    .from(sandboxSessions)
    .innerJoin(projects, eq(sandboxSessions.projectId, projects.id))
    .where(and(eq(sandboxSessions.id, id), eq(projects.tenantId, tenantId)))
    .limit(1);

  if (!session) {
    return c.json({ error: 'Session not found' }, 404);
  }

  const body = await c.req.json();

  const input = z
    .object({
      description: z.string().min(1),
      widgetId: z.string().optional(),
    })
    .parse(body);

  // TODO: Send description to Nico (Build Agent)
  // Nico generates widget config/code, renders preview
  return c.json({
    message: `Nico hat deine Beschreibung erhalten: "${input.description}". Widget-Generierung wird in Phase 3 implementiert.`,
    widgetId: input.widgetId || crypto.randomUUID(),
    previewReady: false,
  });
});

// GET /sandbox/session/:id/preview — Get preview URL
sandboxRouter.get('/session/:id/preview', rbac('sandbox', 'read'), async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');

  const [session] = await db
    .select()
    .from(sandboxSessions)
    .innerJoin(projects, eq(sandboxSessions.projectId, projects.id))
    .where(and(eq(sandboxSessions.id, id), eq(projects.tenantId, tenantId)))
    .limit(1);

  if (!session) {
    return c.json({ error: 'Session not found' }, 404);
  }

  return c.json({
    previewUrl: session.sandbox_sessions.previewUrl || null,
    status: session.sandbox_sessions.status,
  });
});

// POST /sandbox/session/:id/publish — Publish sandbox changes to live
sandboxRouter.post('/session/:id/publish', rbac('sandbox', 'manage'), async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');

  const [session] = await db
    .select()
    .from(sandboxSessions)
    .innerJoin(projects, eq(sandboxSessions.projectId, projects.id))
    .where(and(eq(sandboxSessions.id, id), eq(sandboxSessions.status, 'active'), eq(projects.tenantId, tenantId)))
    .limit(1);

  if (!session) {
    return c.json({ error: 'No active sandbox session found' }, 404);
  }

  // TODO: Merge git branch → trigger deploy
  await db
    .update(sandboxSessions)
    .set({ status: 'published', closedAt: new Date() })
    .where(eq(sandboxSessions.id, id));

  return c.json({ ok: true, message: 'Änderungen werden ins Live-Dashboard übernommen.' });
});

// POST /sandbox/session/:id/revert — Discard all changes
sandboxRouter.post('/session/:id/revert', rbac('sandbox', 'manage'), async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');

  // Verify session belongs to tenant before reverting
  const [session] = await db
    .select({ id: sandboxSessions.id })
    .from(sandboxSessions)
    .innerJoin(projects, eq(sandboxSessions.projectId, projects.id))
    .where(and(eq(sandboxSessions.id, id), eq(projects.tenantId, tenantId)))
    .limit(1);

  if (!session) {
    return c.json({ error: 'Session not found' }, 404);
  }

  await db
    .update(sandboxSessions)
    .set({ status: 'reverted', closedAt: new Date() })
    .where(eq(sandboxSessions.id, id));

  // TODO: Delete git branch + preview container

  return c.json({ ok: true, message: 'Sandbox verworfen. Keine Änderungen am Live-Dashboard.' });
});

// GET /sandbox/session/:id/diff — Show changes vs live
sandboxRouter.get('/session/:id/diff', rbac('sandbox', 'read'), async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');

  const [session] = await db
    .select()
    .from(sandboxSessions)
    .innerJoin(projects, eq(sandboxSessions.projectId, projects.id))
    .where(and(eq(sandboxSessions.id, id), eq(projects.tenantId, tenantId)))
    .limit(1);

  if (!session) {
    return c.json({ error: 'Session not found' }, 404);
  }

  return c.json({
    changes: session.sandbox_sessions.changes || [],
    branchName: session.sandbox_sessions.branchName,
  });
});

export default sandboxRouter;
