import { Hono } from 'hono';
import { db } from '../db/index.js';
import { tenants, users, projects, deployments, envVars, agentConversations, agentMemory, agentConfig, sandboxSessions, auditLog } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth.js';
import { tenantMiddleware } from '../middleware/tenant.js';

const gdprRouter = new Hono();

gdprRouter.use('/*', authMiddleware, tenantMiddleware);

// POST /gdpr/export — Complete data export (DSGVO Art. 20)
gdprRouter.post('/export', async (c) => {
  const tenantId = c.get('tenantId');

  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  const tenantUsers = await db.select().from(users).where(eq(users.tenantId, tenantId));
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
gdprRouter.post('/delete', async (c) => {
  const tenantId = c.get('tenantId');
  const user = c.get('user');

  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (tenant?.ownerId !== user.sub) {
    return c.json({ error: 'Only the tenant owner can request deletion' }, 403);
  }

  // Cascade delete all tenant data
  await db.delete(agentMemory).where(eq(agentMemory.tenantId, tenantId));
  await db.delete(agentConversations).where(eq(agentConversations.tenantId, tenantId));
  await db.delete(agentConfig).where(eq(agentConfig.tenantId, tenantId));

  const tenantProjects = await db.select().from(projects).where(eq(projects.tenantId, tenantId));
  for (const project of tenantProjects) {
    await db.delete(sandboxSessions).where(eq(sandboxSessions.projectId, project.id));
    await db.delete(envVars).where(eq(envVars.projectId, project.id));
    await db.delete(deployments).where(eq(deployments.projectId, project.id));
  }
  await db.delete(projects).where(eq(projects.tenantId, tenantId));

  await db.update(tenants).set({ deletedAt: new Date(), name: '[GELÖSCHT]', slug: `deleted-${tenantId.slice(0, 8)}` }).where(eq(tenants.id, tenantId));
  await db.delete(users).where(eq(users.tenantId, tenantId));

  return c.json({ ok: true, message: 'Alle Daten wurden gelöscht (DSGVO Art. 17).' });
});

// GET /gdpr/audit-log — Access log
gdprRouter.get('/audit-log', async (c) => {
  const tenantId = c.get('tenantId');

  const logs = await db
    .select()
    .from(auditLog)
    .where(eq(auditLog.tenantId, tenantId))
    .limit(100);

  return c.json({ logs });
});

export default gdprRouter;
