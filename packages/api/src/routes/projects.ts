import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db/index.js';
import { projects, deployments } from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth.js';
import { tenantMiddleware } from '../middleware/tenant.js';

const projectsRouter = new Hono();

projectsRouter.use('/*', authMiddleware, tenantMiddleware);

// POST /projects — Create new project
projectsRouter.post('/', async (c) => {
  const tenantId = c.get('tenantId');
  const body = await c.req.json();

  const input = z
    .object({
      name: z.string().min(1).max(100),
      subdomain: z
        .string()
        .min(3)
        .max(40)
        .regex(/^[a-z0-9-]+$/),
      template: z
        .enum(['gastro', 'handwerk', 'handel', 'dienstleistung', 'landwirtschaft', 'gesundheit', 'custom'])
        .default('custom'),
    })
    .parse(body);

  const existing = await db
    .select()
    .from(projects)
    .where(eq(projects.subdomain, input.subdomain))
    .limit(1);

  if (existing.length > 0) {
    return c.json({ error: 'Subdomain already taken' }, 409);
  }

  const [project] = await db
    .insert(projects)
    .values({
      tenantId,
      name: input.name,
      subdomain: input.subdomain,
      template: input.template,
    })
    .returning();

  return c.json({ project }, 201);
});

// GET /projects/:id — Get project details
projectsRouter.get('/:id', async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');

  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.tenantId, tenantId)))
    .limit(1);

  if (!project) {
    return c.json({ error: 'Project not found' }, 404);
  }

  return c.json({ project });
});

// POST /projects/:id/deploy — Trigger deployment
projectsRouter.post('/:id/deploy', async (c) => {
  const tenantId = c.get('tenantId');
  const user = c.get('user');
  const id = c.req.param('id');

  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.tenantId, tenantId)))
    .limit(1);

  if (!project) {
    return c.json({ error: 'Project not found' }, 404);
  }

  const [deployment] = await db
    .insert(deployments)
    .values({
      projectId: id,
      triggeredBy: user.sub,
      status: 'pending',
    })
    .returning();

  // TODO: Trigger Coolify deployment via API
  // await triggerCoolifyDeploy(project.coolifyAppId, deployment.id);

  return c.json({ deployment }, 201);
});

// GET /projects/:id/deployments — Deployment history
projectsRouter.get('/:id/deployments', async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');

  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.tenantId, tenantId)))
    .limit(1);

  if (!project) {
    return c.json({ error: 'Project not found' }, 404);
  }

  const deploys = await db
    .select()
    .from(deployments)
    .where(eq(deployments.projectId, id))
    .orderBy(desc(deployments.startedAt))
    .limit(20);

  return c.json({ deployments: deploys });
});

// GET /projects/:id/status — Current status
projectsRouter.get('/:id/status', async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');

  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.tenantId, tenantId)))
    .limit(1);

  if (!project) {
    return c.json({ error: 'Project not found' }, 404);
  }

  return c.json({
    status: project.status,
    subdomain: `${project.subdomain}.basis.app`,
  });
});

// DELETE /projects/:id — Delete project
projectsRouter.delete('/:id', async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');

  const deleted = await db
    .delete(projects)
    .where(and(eq(projects.id, id), eq(projects.tenantId, tenantId)))
    .returning();

  if (deleted.length === 0) {
    return c.json({ error: 'Project not found' }, 404);
  }

  // TODO: Delete Coolify container

  return c.json({ ok: true });
});

export default projectsRouter;
