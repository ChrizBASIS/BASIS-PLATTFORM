import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db/index.js';
import { onboardingProfiles, onboardingTasks, agentMemory } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth.js';
import { tenantMiddleware } from '../middleware/tenant.js';
import { rbac } from '../middleware/rbac.js';

const app = new Hono();

/**
 * Agent-Zuordnungslogik:
 * Basierend auf Kategorie wird der passende Agent zugewiesen.
 */
const AGENT_ROUTING: Record<string, string> = {
  'email': 'marie',
  'korrespondenz': 'marie',
  'termine': 'marie',
  'kalender': 'marie',
  'telefon': 'marie',
  'dokumente': 'tom',
  'formulare': 'tom',
  'organisation': 'tom',
  'personal': 'tom',
  'inventar': 'tom',
  'rechnungen': 'clara',
  'buchhaltung': 'clara',
  'finanzen': 'clara',
  'mahnungen': 'clara',
  'steuern': 'clara',
  'lohnabrechnung': 'clara',
  'social-media': 'marco',
  'marketing': 'marco',
  'werbung': 'marco',
  'newsletter': 'marco',
  'bewertungen': 'marco',
  'website': 'marco',
  'support': 'alex',
  'kundenanfragen': 'alex',
  'reklamationen': 'alex',
  'faq': 'alex',
  'dashboard': 'nico',
  'widgets': 'nico',
  'berichte': 'nico',
  'automatisierung': 'nico',
};

function assignAgent(category: string, title: string): string {
  const combined = `${category} ${title}`.toLowerCase();
  for (const [keyword, agent] of Object.entries(AGENT_ROUTING)) {
    if (combined.includes(keyword)) return agent;
  }
  return 'lena'; // Orchestrator als Fallback
}

// ─── POST /onboarding/profile — Onboarding-Profil erstellen ─────────────────
const profileSchema = z.object({
  industry: z.string().min(2),
  companySize: z.string().optional(),
  businessDescription: z.string().optional(),
  workflows: z.array(z.object({
    name: z.string(),
    description: z.string().optional(),
    frequency: z.enum(['daily', 'weekly', 'monthly', 'occasional']).optional(),
    painLevel: z.number().min(1).max(5).optional(),
  })).optional(),
  painPoints: z.array(z.object({
    area: z.string(),
    description: z.string(),
    severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  })).optional(),
  automationWishes: z.array(z.object({
    task: z.string(),
    currentProcess: z.string().optional(),
    expectedBenefit: z.string().optional(),
  })).optional(),
});

app.post('/profile', authMiddleware, tenantMiddleware, async (c) => {
  const tenantId = c.get('tenantId');
  const body = await c.req.json();
  const parsed = profileSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: 'Ungültige Eingabe', details: parsed.error.flatten() }, 400);
  }

  const data = parsed.data;

  // Upsert: Update wenn schon vorhanden
  const existing = await db
    .select({ id: onboardingProfiles.id })
    .from(onboardingProfiles)
    .where(eq(onboardingProfiles.tenantId, tenantId))
    .limit(1);

  let profileId: string;

  if (existing.length > 0) {
    profileId = existing[0].id;
    await db
      .update(onboardingProfiles)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(onboardingProfiles.id, profileId));
  } else {
    const [profile] = await db
      .insert(onboardingProfiles)
      .values({ tenantId, ...data })
      .returning();
    profileId = profile.id;
  }

  return c.json({ profileId }, 201);
});

// ─── POST /onboarding/analyze — Workflows analysieren & Tasks + Agenten zuweisen
const analyzeSchema = z.object({
  tasks: z.array(z.object({
    category: z.string(),
    title: z.string(),
    description: z.string().optional(),
    currentProcess: z.string().optional(),
    priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
    automatable: z.boolean().optional(),
  })),
});

app.post('/analyze', authMiddleware, tenantMiddleware, async (c) => {
  const tenantId = c.get('tenantId');
  const body = await c.req.json();
  const parsed = analyzeSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: 'Ungültige Eingabe', details: parsed.error.flatten() }, 400);
  }

  // Profil muss existieren
  const [profile] = await db
    .select()
    .from(onboardingProfiles)
    .where(eq(onboardingProfiles.tenantId, tenantId))
    .limit(1);

  if (!profile) {
    return c.json({ error: 'Bitte zuerst Onboarding-Profil erstellen' }, 400);
  }

  // Bestehende Tasks für dieses Profil löschen (Re-Analyse)
  await db
    .delete(onboardingTasks)
    .where(eq(onboardingTasks.profileId, profile.id));

  // Tasks erstellen mit automatischer Agent-Zuweisung
  const createdTasks = [];
  for (const task of parsed.data.tasks) {
    const agent = assignAgent(task.category, task.title);
    const [created] = await db
      .insert(onboardingTasks)
      .values({
        tenantId,
        profileId: profile.id,
        assignedAgent: agent,
        category: task.category,
        title: task.title,
        description: task.description,
        currentProcess: task.currentProcess,
        priority: task.priority ?? 'medium',
        automatable: task.automatable ?? true,
      })
      .returning();
    createdTasks.push({ ...created, assignedAgentName: agentName(agent) });
  }

  // Agent-Memory aktualisieren: Jeder Agent bekommt seine Tasks
  const agentGroups = groupBy(createdTasks, 'assignedAgent');
  for (const [agent, tasks] of Object.entries(agentGroups)) {
    const memoryValue = {
      tenantId,
      assignedTasks: tasks.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        category: t.category,
        currentProcess: t.currentProcess,
        priority: t.priority,
      })),
      lastUpdated: new Date().toISOString(),
    };

    // Upsert in agent_memory
    const memKey = `onboarding_tasks_${agent}`;
    const existingMem = await db
      .select()
      .from(agentMemory)
      .where(and(eq(agentMemory.tenantId, tenantId), eq(agentMemory.key, memKey)))
      .limit(1);

    if (existingMem.length > 0) {
      await db
        .update(agentMemory)
        .set({ value: memoryValue, updatedAt: new Date() })
        .where(eq(agentMemory.id, existingMem[0].id));
    } else {
      await db.insert(agentMemory).values({
        tenantId,
        key: memKey,
        value: memoryValue,
      });
    }
  }

  // Profil als abgeschlossen markieren
  await db
    .update(onboardingProfiles)
    .set({ completedAt: new Date(), updatedAt: new Date() })
    .where(eq(onboardingProfiles.id, profile.id));

  return c.json({
    tasks: createdTasks,
    summary: {
      total: createdTasks.length,
      byAgent: Object.fromEntries(
        Object.entries(agentGroups).map(([agent, tasks]) => [
          agentName(agent),
          tasks.length,
        ]),
      ),
    },
  });
});

// ─── GET /onboarding/profile — Profil + Tasks abrufen ────────────────────────
app.get('/profile', authMiddleware, tenantMiddleware, async (c) => {
  const tenantId = c.get('tenantId');

  const [profile] = await db
    .select()
    .from(onboardingProfiles)
    .where(eq(onboardingProfiles.tenantId, tenantId))
    .limit(1);

  if (!profile) {
    return c.json({ profile: null, tasks: [] });
  }

  const tasks = await db
    .select()
    .from(onboardingTasks)
    .where(eq(onboardingTasks.profileId, profile.id))
    .orderBy(onboardingTasks.assignedAgent);

  return c.json({
    profile,
    tasks: tasks.map((t) => ({ ...t, assignedAgentName: agentName(t.assignedAgent) })),
  });
});

// ─── GET /onboarding/tasks/:agent — Tasks pro Agent ─────────────────────────
app.get('/tasks/:agent', authMiddleware, tenantMiddleware, async (c) => {
  const tenantId = c.get('tenantId');
  const agent = c.req.param('agent');

  const [profile] = await db
    .select()
    .from(onboardingProfiles)
    .where(eq(onboardingProfiles.tenantId, tenantId))
    .limit(1);

  if (!profile) {
    return c.json({ tasks: [] });
  }

  const tasks = await db
    .select()
    .from(onboardingTasks)
    .where(
      and(
        eq(onboardingTasks.profileId, profile.id),
        eq(onboardingTasks.assignedAgent, agent),
      ),
    );

  return c.json({
    agent,
    agentName: agentName(agent),
    tasks,
  });
});

// ─── PUT /onboarding/tasks/:id — Task-Status aktualisieren ──────────────────
const updateTaskSchema = z.object({
  status: z.enum(['identified', 'in_progress', 'automated', 'manual', 'deferred']).optional(),
  assignedAgent: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
});

app.put('/tasks/:id', authMiddleware, tenantMiddleware, rbac('agent', 'manage'), async (c) => {
  const taskId = c.req.param('id');
  const tenantId = c.get('tenantId');
  const body = await c.req.json();
  const parsed = updateTaskSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: 'Ungültige Eingabe' }, 400);
  }

  const [task] = await db
    .select()
    .from(onboardingTasks)
    .where(and(eq(onboardingTasks.id, taskId), eq(onboardingTasks.tenantId, tenantId)))
    .limit(1);

  if (!task) return c.json({ error: 'Task nicht gefunden' }, 404);

  await db
    .update(onboardingTasks)
    .set(parsed.data)
    .where(eq(onboardingTasks.id, taskId));

  return c.json({ success: true });
});

// ─── Helpers ─────────────────────────────────────────────────────────────────
const AGENT_NAMES: Record<string, string> = {
  lena: 'Lena (Orchestrator)',
  marie: 'Marie (Sekretariat)',
  tom: 'Tom (Backoffice)',
  clara: 'Clara (Finance)',
  marco: 'Marco (Marketing)',
  alex: 'Alex (Support)',
  nico: 'Nico (Builder)',
};

function agentName(slug: string): string {
  return AGENT_NAMES[slug] ?? slug;
}

function groupBy<T>(arr: T[], key: keyof T): Record<string, T[]> {
  return arr.reduce((acc, item) => {
    const k = String(item[key]);
    (acc[k] = acc[k] || []).push(item);
    return acc;
  }, {} as Record<string, T[]>);
}

export { app as onboardingRoutes };
