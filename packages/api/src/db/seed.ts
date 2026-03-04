/**
 * DB Seeder — System Roles & Permissions
 * Run: npx tsx src/db/seed.ts
 */

import 'dotenv/config';
import { db } from './index.js';
import { roles, permissions, rolePermissions } from './schema.js';
import { SYSTEM_ROLES, SYSTEM_PERMISSIONS } from './seed-rbac.js';
import { eq, and, isNull } from 'drizzle-orm';

async function seed() {
  console.log('🌱 Seeding RBAC roles and permissions…');

  // 1. Upsert all permissions
  const permMap: Record<string, string> = {};

  for (const perm of SYSTEM_PERMISSIONS) {
    const existing = await db
      .select({ id: permissions.id })
      .from(permissions)
      .where(and(eq(permissions.resource, perm.resource), eq(permissions.action, perm.action)))
      .limit(1);

    if (existing.length > 0) {
      permMap[`${perm.resource}:${perm.action}`] = existing[0].id;
    } else {
      const [inserted] = await db
        .insert(permissions)
        .values({ resource: perm.resource, action: perm.action, description: perm.description })
        .returning();
      permMap[`${perm.resource}:${perm.action}`] = inserted.id;
      console.log(`  ✔ Permission: ${perm.resource}:${perm.action}`);
    }
  }

  // 2. Upsert system roles (tenantId = null → system-wide)
  for (const [slug, role] of Object.entries(SYSTEM_ROLES)) {
    const existing = await db
      .select({ id: roles.id })
      .from(roles)
      .where(and(eq(roles.slug, slug), isNull(roles.tenantId)))
      .limit(1);

    let roleId: string;

    if (existing.length > 0) {
      roleId = existing[0].id;
      await db
        .update(roles)
        .set({ name: role.name, description: role.description })
        .where(eq(roles.id, roleId));
    } else {
      const [inserted] = await db
        .insert(roles)
        .values({ slug, name: role.name, description: role.description, isSystem: true })
        .returning();
      roleId = inserted.id;
      console.log(`  ✔ Role: ${slug}`);
    }

    // 3. Sync role permissions
    if (role.permissions === '*') {
      // Owner: attach all permissions
      for (const permId of Object.values(permMap)) {
        const exists = await db
          .select({ id: rolePermissions.id })
          .from(rolePermissions)
          .where(and(eq(rolePermissions.roleId, roleId), eq(rolePermissions.permissionId, permId)))
          .limit(1);
        if (exists.length === 0) {
          await db.insert(rolePermissions).values({ roleId, permissionId: permId });
        }
      }
    } else {
      for (const permKey of role.permissions as string[]) {
        const permId = permMap[permKey];
        if (!permId) {
          console.warn(`  ⚠ Unknown permission: ${permKey} (role: ${slug})`);
          continue;
        }
        const exists = await db
          .select({ id: rolePermissions.id })
          .from(rolePermissions)
          .where(and(eq(rolePermissions.roleId, roleId), eq(rolePermissions.permissionId, permId)))
          .limit(1);
        if (exists.length === 0) {
          await db.insert(rolePermissions).values({ roleId, permissionId: permId });
        }
      }
    }
  }

  console.log('✅ Seeding complete.');
  process.exit(0);
}

seed().catch((err) => {
  console.error('❌ Seeding failed:', err);
  process.exit(1);
});
