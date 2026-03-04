import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db/index.js';
import { agentConfig, agentConversations } from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth.js';
import { tenantMiddleware } from '../middleware/tenant.js';

const agentsRouter = new Hono();

agentsRouter.use('/*', authMiddleware, tenantMiddleware);

const AGENT_TYPES = [
  'orchestrator',
  'sekretariat',
  'backoffice',
  'finance',
  'marketing',
  'support',
  'builder',
] as const;

// POST /agents/chat — Message to orchestrator (streamed SSE response)
agentsRouter.post('/chat', async (c) => {
  const tenantId = c.get('tenantId');
  const user = c.get('user');
  const body = await c.req.json();

  const input = z
    .object({
      message: z.string().min(1),
      conversationId: z.string().uuid().optional(),
    })
    .parse(body);

  // TODO: Implement OpenAI Agents SDK orchestrator with SSE streaming
  // For now, return a placeholder response
  return c.json({
    reply: `[Lena — Orchestrator] Ich habe deine Nachricht erhalten: "${input.message}". Das Agenten-System wird in Phase 3 implementiert.`,
    agent: 'orchestrator',
    conversationId: input.conversationId || crypto.randomUUID(),
  });
});

// POST /agents/:type/chat — Direct message to specific agent
agentsRouter.post('/:type/chat', async (c) => {
  const tenantId = c.get('tenantId');
  const agentType = c.req.param('type');

  if (!AGENT_TYPES.includes(agentType as (typeof AGENT_TYPES)[number])) {
    return c.json({ error: 'Unknown agent type' }, 400);
  }

  const body = await c.req.json();
  const input = z
    .object({
      message: z.string().min(1),
      conversationId: z.string().uuid().optional(),
    })
    .parse(body);

  // TODO: Route to specific agent via OpenAI Agents SDK
  return c.json({
    reply: `[Agent: ${agentType}] Nachricht erhalten. Implementierung folgt in Phase 3.`,
    agent: agentType,
    conversationId: input.conversationId || crypto.randomUUID(),
  });
});

// GET /agents/conversations — List past conversations
agentsRouter.get('/conversations', async (c) => {
  const tenantId = c.get('tenantId');

  const conversations = await db
    .select()
    .from(agentConversations)
    .where(eq(agentConversations.tenantId, tenantId))
    .orderBy(desc(agentConversations.createdAt))
    .limit(50);

  return c.json({ conversations });
});

// GET /agents/conversations/:id — Single conversation
agentsRouter.get('/conversations/:id', async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');

  const [conversation] = await db
    .select()
    .from(agentConversations)
    .where(and(eq(agentConversations.id, id), eq(agentConversations.tenantId, tenantId)))
    .limit(1);

  if (!conversation) {
    return c.json({ error: 'Conversation not found' }, 404);
  }

  return c.json({ conversation });
});

// GET /agents/config — Enabled agents per tenant
agentsRouter.get('/config', async (c) => {
  const tenantId = c.get('tenantId');

  const configs = await db
    .select()
    .from(agentConfig)
    .where(eq(agentConfig.tenantId, tenantId));

  return c.json({ agents: configs });
});

// PATCH /agents/config — Enable/disable agents
agentsRouter.patch('/config', async (c) => {
  const tenantId = c.get('tenantId');
  const body = await c.req.json();

  const input = z
    .object({
      agentType: z.enum(AGENT_TYPES),
      enabled: z.boolean(),
    })
    .parse(body);

  // Upsert agent config
  const existing = await db
    .select()
    .from(agentConfig)
    .where(and(eq(agentConfig.tenantId, tenantId), eq(agentConfig.agentType, input.agentType)))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(agentConfig)
      .set({ enabled: input.enabled })
      .where(eq(agentConfig.id, existing[0].id));
  } else {
    await db.insert(agentConfig).values({
      tenantId,
      agentType: input.agentType,
      enabled: input.enabled,
    });
  }

  return c.json({ ok: true, agentType: input.agentType, enabled: input.enabled });
});

export default agentsRouter;
