import { Hono } from 'hono';
import { db } from '../db/index.js';
import { tokenUsage, tenants } from '../db/schema.js';
import { eq, and, gte, lte, sql } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth.js';
import { tenantMiddleware } from '../middleware/tenant.js';
import { rbac } from '../middleware/rbac.js';

const app = new Hono();

// Token-Limits pro Plan
const PLAN_LIMITS: Record<string, number> = {
  starter: 10_000,
  pro: 50_000,
  enterprise: 200_000,
};

// GET /token-usage/summary — Monatliche Zusammenfassung
app.get('/summary', authMiddleware, tenantMiddleware, rbac('token_usage', 'read'), async (c) => {
  const tenantId = c.get('tenantId');
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  // Gesamt-Verbrauch diesen Monat
  const [total] = await db
    .select({
      totalInput: sql<number>`COALESCE(SUM(${tokenUsage.inputTokens}), 0)`,
      totalOutput: sql<number>`COALESCE(SUM(${tokenUsage.outputTokens}), 0)`,
      totalRequests: sql<number>`COUNT(*)`,
    })
    .from(tokenUsage)
    .where(
      and(
        eq(tokenUsage.tenantId, tenantId),
        gte(tokenUsage.createdAt, monthStart),
        lte(tokenUsage.createdAt, monthEnd),
      ),
    );

  // Pro Agent aufgeschlüsselt
  const byAgent = await db
    .select({
      agentType: tokenUsage.agentType,
      inputTokens: sql<number>`COALESCE(SUM(${tokenUsage.inputTokens}), 0)`,
      outputTokens: sql<number>`COALESCE(SUM(${tokenUsage.outputTokens}), 0)`,
      requests: sql<number>`COUNT(*)`,
    })
    .from(tokenUsage)
    .where(
      and(
        eq(tokenUsage.tenantId, tenantId),
        gte(tokenUsage.createdAt, monthStart),
        lte(tokenUsage.createdAt, monthEnd),
      ),
    )
    .groupBy(tokenUsage.agentType)
    .orderBy(sql`SUM(${tokenUsage.inputTokens}) + SUM(${tokenUsage.outputTokens}) DESC`);

  const totalTokens = Number(total.totalInput) + Number(total.totalOutput);

  const [tenant] = await db.select({ plan: tenants.plan }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  const limit = PLAN_LIMITS[tenant?.plan ?? 'pro'] ?? PLAN_LIMITS['pro'];
  const percentage = limit > 0 ? Math.round((totalTokens / limit) * 100) : 0;

  return c.json({
    period: {
      start: monthStart.toISOString(),
      end: monthEnd.toISOString(),
      label: `${now.toLocaleString('de', { month: 'long' })} ${now.getFullYear()}`,
    },
    total: {
      inputTokens: Number(total.totalInput),
      outputTokens: Number(total.totalOutput),
      totalTokens,
      requests: Number(total.totalRequests),
    },
    limit,
    percentage,
    warning: percentage > 95 ? 'critical' : percentage > 80 ? 'warning' : null,
    byAgent: byAgent.map((a) => ({
      agent: a.agentType,
      inputTokens: Number(a.inputTokens),
      outputTokens: Number(a.outputTokens),
      totalTokens: Number(a.inputTokens) + Number(a.outputTokens),
      requests: Number(a.requests),
    })),
  });
});

// GET /token-usage/history — Täglicher Verlauf (letzte 30 Tage)
app.get('/history', authMiddleware, tenantMiddleware, rbac('token_usage', 'read'), async (c) => {
  const tenantId = c.get('tenantId');
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const daily = await db
    .select({
      date: sql<string>`DATE(${tokenUsage.createdAt})`,
      inputTokens: sql<number>`COALESCE(SUM(${tokenUsage.inputTokens}), 0)`,
      outputTokens: sql<number>`COALESCE(SUM(${tokenUsage.outputTokens}), 0)`,
      requests: sql<number>`COUNT(*)`,
    })
    .from(tokenUsage)
    .where(
      and(
        eq(tokenUsage.tenantId, tenantId),
        gte(tokenUsage.createdAt, thirtyDaysAgo),
      ),
    )
    .groupBy(sql`DATE(${tokenUsage.createdAt})`)
    .orderBy(sql`DATE(${tokenUsage.createdAt})`);

  return c.json({
    history: daily.map((d) => ({
      date: d.date,
      inputTokens: Number(d.inputTokens),
      outputTokens: Number(d.outputTokens),
      totalTokens: Number(d.inputTokens) + Number(d.outputTokens),
      requests: Number(d.requests),
    })),
  });
});

export { app as tokenUsageRoutes };
