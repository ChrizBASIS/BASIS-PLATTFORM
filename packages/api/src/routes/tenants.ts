import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db/index.js';
import { tenants, users, tenantMembers, roles, auditLog } from '../db/schema.js';
import { eq, and, isNull } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth.js';
import { tenantMiddleware } from '../middleware/tenant.js';
import { rbac } from '../middleware/rbac.js';

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

  // Assign owner role via tenantMembers
  const [ownerRole] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(and(eq(roles.slug, 'owner'), eq(roles.tenantId, tenant.id)))
    .limit(1);

  if (ownerRole) {
    await db.insert(tenantMembers).values({
      tenantId: tenant.id,
      userId: user.sub,
      roleId: ownerRole.id,
    });
  }

  return c.json({ tenant }, 201);
});

// GET /tenants/:id — Get tenant details
tenantsRouter.get('/:id', tenantMiddleware, rbac('tenant', 'read'), async (c) => {
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
tenantsRouter.patch('/:id', tenantMiddleware, rbac('tenant', 'update'), async (c) => {
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
tenantsRouter.delete('/:id', tenantMiddleware, rbac('tenant', 'delete'), async (c) => {
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

  await db.insert(auditLog).values({
    tenantId: id,
    userId: user.sub,
    action: 'tenant.deleted',
    resource: 'tenant',
    details: { tenantName: tenant.name },
  });

  return c.json({ ok: true, message: 'Tenant marked for deletion' });
});

// GET /tenants/:id/members — List team members
tenantsRouter.get('/:id/members', tenantMiddleware, rbac('team', 'read'), async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');

  if (id !== tenantId) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const members = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      language: users.language,
      role: roles.name,
      joinedAt: tenantMembers.joinedAt,
    })
    .from(tenantMembers)
    .innerJoin(users, eq(tenantMembers.userId, users.id))
    .innerJoin(roles, eq(tenantMembers.roleId, roles.id))
    .where(and(eq(tenantMembers.tenantId, id), isNull(tenantMembers.removedAt)));

  return c.json({ members });
});

export default tenantsRouter;
