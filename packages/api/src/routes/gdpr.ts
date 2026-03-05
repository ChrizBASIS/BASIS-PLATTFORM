import { Hono } from 'hono';
import { db } from '../db/index.js';
import { tenants, users, projects, deployments, envVars, agentConversations, agentMemory, agentConfig, sandboxSessions, widgets, auditLog, tenantMembers, tokenUsage, onboardingTasks, onboardingProfiles, supportSessions, integrations, integrationSyncLog, roles, rolePermissions } from '../db/schema.js';
import { eq, and, isNull, inArray } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth.js';
import { tenantMiddleware } from '../middleware/tenant.js';
import { rbac } from '../middleware/rbac.js';

const gdprRouter = new Hono();

gdprRouter.use('/*', authMiddleware, tenantMiddleware);

// POST /gdpr/export — Complete data export (DSGVO Art. 20)
gdprRouter.post('/export', rbac('gdpr', 'read'), async (c) => {
  const tenantId = c.get('tenantId');

  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  const tenantUsers = await db
    .select({ id: users.id, email: users.email, name: users.name, language: users.language })
    .from(tenantMembers)
    .innerJoin(users, eq(tenantMembers.userId, users.id))
    .where(and(eq(tenantMembers.tenantId, tenantId), isNull(tenantMembers.removedAt)));
  const tenantProjects = await db.select().from(projects).where(eq(projects.tenantId, tenantId));
  const conversations = await db.select().from(agentConversations).where(eq(agentConversations.tenantId, tenantId));
  const memory = await db.select().from(agentMemory).where(eq(agentMemory.tenantId, tenantId));

  return c.json({
    exportedAt: new Date().toISOString(),
    tenant,
    users: tenantUsers,
    projects: tenantProjects,
    agentConversations: conversations,
    agentMemory: memory,
  });
});

// POST /gdpr/delete — Complete data deletion (DSGVO Art. 17)
gdprRouter.post('/delete', rbac('gdpr', 'manage'), async (c) => {
  const tenantId = c.get('tenantId');
  const user = c.get('user');

  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (tenant?.ownerId !== user.sub) {
    return c.json({ error: 'Only the tenant owner can request deletion' }, 403);
  }

  // Cascade delete all tenant data
  // NOTE: audit_log is intentionally NOT deleted — retained for legal compliance
  // (Handels-/Steuerrechtliche Aufbewahrungspflicht, max. 10 Jahre)
  await db.delete(agentMemory).where(eq(agentMemory.tenantId, tenantId));
  await db.delete(agentConversations).where(eq(agentConversations.tenantId, tenantId));
  await db.delete(agentConfig).where(eq(agentConfig.tenantId, tenantId));

  // Delete all widgets for tenant (must be before projects/sessions due to FK refs)
  await db.delete(widgets).where(eq(widgets.tenantId, tenantId));

  const tenantProjects = await db.select().from(projects).where(eq(projects.tenantId, tenantId));
  for (const project of tenantProjects) {
    await db.delete(sandboxSessions).where(eq(sandboxSessions.projectId, project.id));
    await db.delete(envVars).where(eq(envVars.projectId, project.id));
    await db.delete(deployments).where(eq(deployments.projectId, project.id));
  }
  await db.delete(projects).where(eq(projects.tenantId, tenantId));

  // Delete onboarding data
  const [profile] = await db.select({ id: onboardingProfiles.id }).from(onboardingProfiles).where(eq(onboardingProfiles.tenantId, tenantId)).limit(1);
  if (profile) {
    await db.delete(onboardingTasks).where(eq(onboardingTasks.profileId, profile.id));
    await db.delete(onboardingProfiles).where(eq(onboardingProfiles.tenantId, tenantId));
  }

  // Delete integrations + sync logs (credentials permanently destroyed)
  await db.delete(integrationSyncLog).where(eq(integrationSyncLog.tenantId, tenantId));
  await db.delete(integrations).where(eq(integrations.tenantId, tenantId));

  // Delete token usage + support sessions
  await db.delete(tokenUsage).where(eq(tokenUsage.tenantId, tenantId));
  await db.delete(supportSessions).where(eq(supportSessions.tenantId, tenantId));

  // Remove tenant memberships (users themselves may belong to other tenants)
  await db.delete(tenantMembers).where(eq(tenantMembers.tenantId, tenantId));

  // Delete tenant-specific roles + their permission mappings
  const tenantRoles = await db.select({ id: roles.id }).from(roles).where(eq(roles.tenantId, tenantId));
  if (tenantRoles.length > 0) {
    const roleIds = tenantRoles.map((r) => r.id);
    await db.delete(rolePermissions).where(inArray(rolePermissions.roleId, roleIds));
    await db.delete(roles).where(eq(roles.tenantId, tenantId));
  }

  await db.update(tenants).set({ deletedAt: new Date(), name: '[GELÖSCHT]', slug: `deleted-${tenantId.slice(0, 8)}` }).where(eq(tenants.id, tenantId));

  return c.json({ ok: true, message: 'Alle Daten wurden gelöscht (DSGVO Art. 17).' });
});

// GET /gdpr/audit-log — Access log
gdprRouter.get('/audit-log', rbac('gdpr', 'read'), async (c) => {
  const tenantId = c.get('tenantId');

  const logs = await db
    .select()
    .from(auditLog)
    .where(eq(auditLog.tenantId, tenantId))
    .limit(100);

  return c.json({ logs });
});

export default gdprRouter;
