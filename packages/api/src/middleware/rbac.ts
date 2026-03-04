import { createMiddleware } from 'hono/factory';
import { db } from '../db/index.js';
import { tenantMembers, roles, rolePermissions, permissions } from '../db/schema.js';
import { eq, and, isNull } from 'drizzle-orm';

/**
 * RBAC Middleware — prüft ob der aktuelle User die geforderte Permission hat.
 *
 * Verwendung in Routes:
 *   app.get('/projects', authMiddleware, rbac('project', 'read'), handler)
 *   app.post('/projects', authMiddleware, rbac('project', 'create'), handler)
 */
export function rbac(resource: string, action: string) {
  return createMiddleware(async (c, next) => {
    const user = c.get('user');
    const tenantId = c.get('tenantId');

    if (!user || !tenantId) {
      return c.json({ error: 'Nicht authentifiziert' }, 401);
    }

    const hasPermission = await checkPermission(user.sub, tenantId, resource, action);

    if (!hasPermission) {
      return c.json({
        error: 'Keine Berechtigung',
        required: `${resource}:${action}`,
      }, 403);
    }

    await next();
  });
}

/**
 * Prüft ob ein User in einem Tenant eine bestimmte Permission hat.
 * Owner-Rolle hat automatisch alle Rechte ('*').
 */
async function checkPermission(
  userId: string,
  tenantId: string,
  resource: string,
  action: string,
): Promise<boolean> {
  // 1. Finde die Mitgliedschaft + Rolle des Users in diesem Tenant
  const membership = await db
    .select({
      roleId: tenantMembers.roleId,
      roleSlug: roles.slug,
      isSystem: roles.isSystem,
    })
    .from(tenantMembers)
    .innerJoin(roles, eq(tenantMembers.roleId, roles.id))
    .where(
      and(
        eq(tenantMembers.tenantId, tenantId),
        eq(tenantMembers.userId, userId),
        isNull(tenantMembers.removedAt),
      ),
    )
    .limit(1);

  if (membership.length === 0) {
    return false;
  }

  const { roleId, roleSlug } = membership[0];

  // Owner hat immer alle Rechte
  if (roleSlug === 'owner') {
    return true;
  }

  // 2. Prüfe ob die Rolle die geforderte Permission hat
  const result = await db
    .select({ id: permissions.id })
    .from(rolePermissions)
    .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
    .where(
      and(
        eq(rolePermissions.roleId, roleId),
        eq(permissions.resource, resource),
        eq(permissions.action, action),
      ),
    )
    .limit(1);

  return result.length > 0;
}

/**
 * Helper: Alle Permissions eines Users in einem Tenant laden.
 * Nützlich für Frontend (was darf der User sehen/tun).
 */
export async function getUserPermissions(
  userId: string,
  tenantId: string,
): Promise<{ role: string; permissions: string[] }> {
  const membership = await db
    .select({
      roleId: tenantMembers.roleId,
      roleSlug: roles.slug,
      roleName: roles.name,
    })
    .from(tenantMembers)
    .innerJoin(roles, eq(tenantMembers.roleId, roles.id))
    .where(
      and(
        eq(tenantMembers.tenantId, tenantId),
        eq(tenantMembers.userId, userId),
        isNull(tenantMembers.removedAt),
      ),
    )
    .limit(1);

  if (membership.length === 0) {
    return { role: 'none', permissions: [] };
  }

  const { roleId, roleSlug } = membership[0];

  if (roleSlug === 'owner') {
    return { role: 'owner', permissions: ['*'] };
  }

  const perms = await db
    .select({
      resource: permissions.resource,
      action: permissions.action,
    })
    .from(rolePermissions)
    .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
    .where(eq(rolePermissions.roleId, roleId));

  return {
    role: roleSlug,
    permissions: perms.map((p) => `${p.resource}:${p.action}`),
  };
}
