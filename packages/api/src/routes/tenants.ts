import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db/index.js';
import { tenants, users } from '../db/schema.js';
import { eq, and, isNull } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth.js';
import { tenantMiddleware } from '../middleware/tenant.js';

const tenantsRouter = new Hono();

tenantsRouter.use('/*', authMiddleware);

// POST /tenants — Create a new tenant
tenantsRouter.post('/', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();

  const input = z
    .object({
      name: z.string().min(1).max(100),
      slug: z
        .string()
        .min(3)
        .max(40)
        .regex(/^[a-z0-9-]+$/),
    })
    .parse(body);

  const existing = await db.select().from(tenants).where(eq(tenants.slug, input.slug)).limit(1);
  if (existing.length > 0) {
    return c.json({ error: 'Slug already taken' }, 409);
  }

  const [tenant] = await db
    .insert(tenants)
    .values({
      name: input.name,
      slug: input.slug,
      ownerId: user.sub,
    })
    .returning();

  await db
    .update(users)
    .set({ tenantId: tenant.id, role: 'owner' })
    .where(eq(users.id, user.sub));

  return c.json({ tenant }, 201);
});

// GET /tenants/:id — Get tenant details
tenantsRouter.get('/:id', tenantMiddleware, async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');

  if (id !== tenantId) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const [tenant] = await db
    .select()
    .from(tenants)
    .where(and(eq(tenants.id, id), isNull(tenants.deletedAt)))
    .limit(1);

  if (!tenant) {
    return c.json({ error: 'Tenant not found' }, 404);
  }

  return c.json({ tenant });
});

// PATCH /tenants/:id — Update tenant settings
tenantsRouter.patch('/:id', tenantMiddleware, async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');

  if (id !== tenantId) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const body = await c.req.json();
  const input = z
    .object({
      name: z.string().min(1).max(100).optional(),
    })
    .parse(body);

  const [updated] = await db.update(tenants).set(input).where(eq(tenants.id, id)).returning();

  return c.json({ tenant: updated });
});

// DELETE /tenants/:id — Soft-delete tenant (DSGVO Art. 17)
tenantsRouter.delete('/:id', tenantMiddleware, async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');
  const user = c.get('user');

  if (id !== tenantId) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, id)).limit(1);
  if (tenant?.ownerId !== user.sub) {
    return c.json({ error: 'Only the owner can delete a tenant' }, 403);
  }

  await db.update(tenants).set({ deletedAt: new Date() }).where(eq(tenants.id, id));

  return c.json({ ok: true, message: 'Tenant marked for deletion' });
});

// GET /tenants/:id/members — List team members
tenantsRouter.get('/:id/members', tenantMiddleware, async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');

  if (id !== tenantId) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const members = await db.select().from(users).where(eq(users.tenantId, id));

  return c.json({ members });
});

export default tenantsRouter;
