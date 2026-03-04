import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db/index.js';
import {
  roles,
  permissions,
  rolePermissions,
  tenantMembers,
  users,
} from '../db/schema.js';
import { eq, and, isNull } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth.js';
import { tenantMiddleware } from '../middleware/tenant.js';
import { rbac } from '../middleware/rbac.js';
import { getUserPermissions } from '../middleware/rbac.js';

const app = new Hono();

// ─── STATIC ROUTES FIRST (before /:id to avoid param collision) ─────────────

// ─── GET /roles/permissions/all — Alle verfügbaren Permissions ───────────────
app.get('/permissions/all', authMiddleware, tenantMiddleware, rbac('role', 'read'), async (c) => {
  const allPerms = await db.select().from(permissions);
  return c.json({ permissions: allPerms });
});

// ─── GET /roles/me — Eigene Rolle + Permissions ─────────────────────────────
app.get('/me', authMiddleware, tenantMiddleware, async (c) => {
  const user = c.get('user');
  const tenantId = c.get('tenantId');
  const result = await getUserPermissions(user.sub, tenantId);
  return c.json(result);
});

// ─── GET /roles/members — Mitglieder mit Rollen ─────────────────────────────
app.get('/members', authMiddleware, tenantMiddleware, rbac('team', 'read'), async (c) => {
  const tenantId = c.get('tenantId');

  const members = await db
    .select({
      memberId: tenantMembers.id,
      userId: tenantMembers.userId,
      userName: users.name,
      userEmail: users.email,
      roleId: tenantMembers.roleId,
      roleName: roles.name,
      roleSlug: roles.slug,
      joinedAt: tenantMembers.joinedAt,
    })
    .from(tenantMembers)
    .innerJoin(users, eq(tenantMembers.userId, users.id))
    .innerJoin(roles, eq(tenantMembers.roleId, roles.id))
    .where(and(eq(tenantMembers.tenantId, tenantId), isNull(tenantMembers.removedAt)));

  return c.json({ members });
});

// ─── PUT /roles/members/:userId — Rolle eines Mitglieds ändern ──────────────
const changeRoleSchema = z.object({
  roleId: z.string().uuid(),
});

app.put('/members/:userId', authMiddleware, tenantMiddleware, rbac('team', 'manage'), async (c) => {
  const targetUserId = c.req.param('userId');
  const tenantId = c.get('tenantId');
  const body = await c.req.json();
  const parsed = changeRoleSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: 'Ungültige Eingabe' }, 400);
  }

  const [targetRole] = await db
    .select()
    .from(roles)
    .where(and(eq(roles.id, parsed.data.roleId), eq(roles.tenantId, tenantId)))
    .limit(1);

  if (!targetRole) return c.json({ error: 'Rolle nicht gefunden' }, 404);

  await db
    .update(tenantMembers)
    .set({ roleId: parsed.data.roleId })
    .where(
      and(
        eq(tenantMembers.tenantId, tenantId),
        eq(tenantMembers.userId, targetUserId),
        isNull(tenantMembers.removedAt),
      ),
    );

  return c.json({ success: true });
});

// ─── DYNAMIC ROUTES ─────────────────────────────────────────────────────────

// ─── GET /roles — Alle Rollen des Tenants ────────────────────────────────────
app.get('/', authMiddleware, tenantMiddleware, rbac('role', 'read'), async (c) => {
  const tenantId = c.get('tenantId');

  const result = await db
    .select()
    .from(roles)
    .where(eq(roles.tenantId, tenantId))
    .orderBy(roles.createdAt);

  return c.json({ roles: result });
});

// ─── GET /roles/:id — Rolle mit ihren Permissions ────────────────────────────
app.get('/:id', authMiddleware, tenantMiddleware, rbac('role', 'read'), async (c) => {
  const roleId = c.req.param('id');
  const tenantId = c.get('tenantId');

  const [role] = await db
    .select()
    .from(roles)
    .where(and(eq(roles.id, roleId), eq(roles.tenantId, tenantId)))
    .limit(1);

  if (!role) return c.json({ error: 'Rolle nicht gefunden' }, 404);

  const perms = await db
    .select({
      id: permissions.id,
      resource: permissions.resource,
      action: permissions.action,
      description: permissions.description,
    })
    .from(rolePermissions)
    .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
    .where(eq(rolePermissions.roleId, roleId));

  return c.json({ role, permissions: perms });
});

// ─── POST /roles — Neue Rolle erstellen ──────────────────────────────────────
const createRoleSchema = z.object({
  name: z.string().min(2).max(50),
  slug: z.string().min(2).max(30).regex(/^[a-z0-9-]+$/),
  description: z.string().optional(),
  permissionIds: z.array(z.string().uuid()),
});

app.post('/', authMiddleware, tenantMiddleware, rbac('role', 'manage'), async (c) => {
  const tenantId = c.get('tenantId');
  const body = await c.req.json();
  const parsed = createRoleSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: 'Ungültige Eingabe', details: parsed.error.flatten() }, 400);
  }

  const { name, slug, description, permissionIds } = parsed.data;

  const [role] = await db
    .insert(roles)
    .values({ tenantId, name, slug, description, isSystem: false })
    .returning();

  if (permissionIds.length > 0) {
    await db.insert(rolePermissions).values(
      permissionIds.map((pid) => ({ roleId: role.id, permissionId: pid })),
    );
  }

  return c.json({ role }, 201);
});

// ─── PUT /roles/:id — Rolle bearbeiten ───────────────────────────────────────
const updateRoleSchema = z.object({
  name: z.string().min(2).max(50).optional(),
  description: z.string().optional(),
  permissionIds: z.array(z.string().uuid()).optional(),
});

app.put('/:id', authMiddleware, tenantMiddleware, rbac('role', 'manage'), async (c) => {
  const roleId = c.req.param('id');
  const tenantId = c.get('tenantId');
  const body = await c.req.json();
  const parsed = updateRoleSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: 'Ungültige Eingabe', details: parsed.error.flatten() }, 400);
  }

  const [existing] = await db
    .select()
    .from(roles)
    .where(and(eq(roles.id, roleId), eq(roles.tenantId, tenantId)))
    .limit(1);

  if (!existing) return c.json({ error: 'Rolle nicht gefunden' }, 404);
  if (existing.isSystem) return c.json({ error: 'System-Rollen können nicht bearbeitet werden' }, 403);

  const { name, description, permissionIds } = parsed.data;

  if (name || description) {
    await db
      .update(roles)
      .set({ ...(name && { name }), ...(description && { description }) })
      .where(eq(roles.id, roleId));
  }

  if (permissionIds) {
    await db.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));
    if (permissionIds.length > 0) {
      await db.insert(rolePermissions).values(
        permissionIds.map((pid) => ({ roleId, permissionId: pid })),
      );
    }
  }

  return c.json({ success: true });
});

// ─── DELETE /roles/:id — Rolle löschen ───────────────────────────────────────
app.delete('/:id', authMiddleware, tenantMiddleware, rbac('role', 'manage'), async (c) => {
  const roleId = c.req.param('id');
  const tenantId = c.get('tenantId');

  const [existing] = await db
    .select()
    .from(roles)
    .where(and(eq(roles.id, roleId), eq(roles.tenantId, tenantId)))
    .limit(1);

  if (!existing) return c.json({ error: 'Rolle nicht gefunden' }, 404);
  if (existing.isSystem) return c.json({ error: 'System-Rollen können nicht gelöscht werden' }, 403);

  const membersWithRole = await db
    .select({ id: tenantMembers.id })
    .from(tenantMembers)
    .where(and(eq(tenantMembers.roleId, roleId), isNull(tenantMembers.removedAt)))
    .limit(1);

  if (membersWithRole.length > 0) {
    return c.json({ error: 'Rolle ist noch Mitgliedern zugewiesen — bitte zuerst umweisen' }, 409);
  }

  await db.delete(roles).where(eq(roles.id, roleId));
  return c.json({ success: true });
});

export { app as rolesRoutes };
