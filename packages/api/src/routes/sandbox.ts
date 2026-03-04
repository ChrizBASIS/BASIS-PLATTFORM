import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db/index.js';
import { sandboxSessions, projects, widgets, tokenUsage } from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth.js';
import { tenantMiddleware } from '../middleware/tenant.js';
import { rbac } from '../middleware/rbac.js';
import { generateWidget, widgetChat } from '../agents/widget-generator.js';

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

  const user = c.get('user');

  try {
    // If widgetId provided → update existing widget
    let existingCode: string | undefined;
    let existingVersion = 1;
    if (input.widgetId) {
      const [existing] = await db
        .select({ code: widgets.code, version: widgets.version })
        .from(widgets)
        .where(eq(widgets.id, input.widgetId))
        .limit(1);
      existingCode = existing?.code;
      existingVersion = existing?.version ?? 1;
    }

    // Generate widget via GPT
    const result = await generateWidget(input.description, existingCode);

    // Find projectId from session
    const [sessionData] = await db
      .select({ projectId: sandboxSessions.projectId })
      .from(sandboxSessions)
      .where(eq(sandboxSessions.id, id))
      .limit(1);

    // Save widget to DB
    if (input.widgetId && existingCode) {
      // Update existing widget
      await db.update(widgets).set({
        code: result.code,
        description: input.description,
        title: result.title,
        version: existingVersion + 1,
        updatedAt: new Date(),
      }).where(eq(widgets.id, input.widgetId));

      // Track tokens
      await db.insert(tokenUsage).values({
        tenantId,
        userId: user.sub,
        agentType: 'builder',
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        model: 'gpt-4o-mini',
      });

      return c.json({
        message: `Widget "${result.title}" wurde aktualisiert.`,
        widgetId: input.widgetId,
        title: result.title,
        code: result.code,
        previewReady: true,
      });
    }

    // Create new widget
    const [widget] = await db.insert(widgets).values({
      tenantId,
      projectId: sessionData?.projectId,
      sessionId: id,
      title: result.title,
      description: input.description,
      code: result.code,
      status: 'draft',
      createdBy: user.sub,
    }).returning();

    // Track tokens
    await db.insert(tokenUsage).values({
      tenantId,
      userId: user.sub,
      agentType: 'builder',
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      model: 'gpt-4o-mini',
    });

    return c.json({
      message: `Widget "${result.title}" wurde generiert! Schau dir die Vorschau an.`,
      widgetId: widget.id,
      title: result.title,
      code: result.code,
      previewReady: true,
    });
  } catch (error: any) {
    console.error('[sandbox] Widget generation error:', error?.message);
    return c.json({
      message: `Fehler bei der Widget-Generierung: ${error?.message ?? 'Unbekannt'}`,
      widgetId: null,
      previewReady: false,
    }, 500);
  }
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

// ─── Widget CRUD ──────────────────────────────────────────────────────────────

// GET /sandbox/widgets — List all widgets for tenant
sandboxRouter.get('/widgets', rbac('sandbox', 'read'), async (c) => {
  const tenantId = c.get('tenantId');

  const result = await db
    .select()
    .from(widgets)
    .where(eq(widgets.tenantId, tenantId))
    .orderBy(desc(widgets.createdAt));

  return c.json({ widgets: result });
});

// GET /sandbox/widgets/:id — Get single widget with code
sandboxRouter.get('/widgets/:id', rbac('sandbox', 'read'), async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');

  const [widget] = await db
    .select()
    .from(widgets)
    .where(and(eq(widgets.id, id), eq(widgets.tenantId, tenantId)))
    .limit(1);

  if (!widget) {
    return c.json({ error: 'Widget not found' }, 404);
  }

  return c.json({ widget });
});

// PATCH /sandbox/widgets/:id — Update widget status (publish/archive)
sandboxRouter.patch('/widgets/:id', rbac('sandbox', 'manage'), async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');
  const body = await c.req.json();

  const input = z.object({
    status: z.enum(['draft', 'published', 'archived']).optional(),
    title: z.string().min(1).optional(),
  }).parse(body);

  const [widget] = await db
    .select({ id: widgets.id })
    .from(widgets)
    .where(and(eq(widgets.id, id), eq(widgets.tenantId, tenantId)))
    .limit(1);

  if (!widget) {
    return c.json({ error: 'Widget not found' }, 404);
  }

  const [updated] = await db.update(widgets).set({
    ...input,
    updatedAt: new Date(),
  }).where(eq(widgets.id, id)).returning();

  return c.json({ widget: updated });
});

// DELETE /sandbox/widgets/:id — Delete widget
sandboxRouter.delete('/widgets/:id', rbac('sandbox', 'manage'), async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');

  const [widget] = await db
    .select({ id: widgets.id })
    .from(widgets)
    .where(and(eq(widgets.id, id), eq(widgets.tenantId, tenantId)))
    .limit(1);

  if (!widget) {
    return c.json({ error: 'Widget not found' }, 404);
  }

  await db.delete(widgets).where(eq(widgets.id, id));
  return c.json({ ok: true });
});

export default sandboxRouter;
