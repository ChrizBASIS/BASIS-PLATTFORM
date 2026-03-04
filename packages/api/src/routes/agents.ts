import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db/index.js';
import { agentConfig, agentConversations } from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth.js';
import { tenantMiddleware } from '../middleware/tenant.js';
import { rbac } from '../middleware/rbac.js';
import { runAgent, runAgentStream } from '../agents/runner.js';
import { getAllAgents } from '../agents/prompts.js';
import { syncTenantYAML } from '../lib/tenant-yaml.js';
import type { AgentType } from '../agents/types.js';

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

// POST /agents/chat — Message to orchestrator (auto-routes to best agent)
agentsRouter.post('/chat', rbac('agent', 'read'), async (c) => {
  const tenantId = c.get('tenantId');
  const user = c.get('user');
  const body = await c.req.json();

  const input = z
    .object({
      message: z.string().min(1),
      conversationId: z.string().uuid().optional(),
    })
    .parse(body);

  // Load enabled agents for this tenant
  const configs = await db
    .select()
    .from(agentConfig)
    .where(eq(agentConfig.tenantId, tenantId));

  const enabledAgents: AgentType[] = configs.length > 0
    ? configs.filter((c) => c.enabled).map((c) => c.agentType as AgentType)
    : AGENT_TYPES.map((t) => t); // All enabled by default

  const result = await runAgent(
    {
      tenantId,
      userId: user.sub,
      conversationId: input.conversationId ?? '',
      language: 'de',
      enabledAgents,
    },
    input.message,
    input.conversationId,
  );

  return c.json({
    reply: result.message,
    agent: result.agent,
    agentName: result.agentName,
    conversationId: result.conversationId,
    handedOff: result.handedOff,
    handedOffTo: result.handedOffTo,
    metadata: result.metadata,
  });
});

// POST /agents/chat/stream — SSE streaming chat
agentsRouter.post('/chat/stream', rbac('agent', 'read'), async (c) => {
  const tenantId = c.get('tenantId');
  const user = c.get('user');
  const body = await c.req.json();

  const input = z
    .object({
      message: z.string().min(1),
      conversationId: z.string().uuid().optional(),
    })
    .parse(body);

  const configs = await db
    .select()
    .from(agentConfig)
    .where(eq(agentConfig.tenantId, tenantId));

  const enabledAgents: AgentType[] = configs.length > 0
    ? configs.filter((c) => c.enabled).map((c) => c.agentType as AgentType)
    : AGENT_TYPES.map((t) => t);

  const { stream } = await runAgentStream(
    {
      tenantId,
      userId: user.sub,
      conversationId: input.conversationId ?? '',
      language: 'de',
      enabledAgents,
    },
    input.message,
    input.conversationId,
  );

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
});

// POST /agents/:type/chat — Direct message to specific agent
agentsRouter.post('/:type/chat', rbac('agent', 'read'), async (c) => {
  const tenantId = c.get('tenantId');
  const user = c.get('user');
  const agentType = c.req.param('type');

  if (!AGENT_TYPES.includes(agentType as (typeof AGENT_TYPES)[number])) {
    return c.json({ error: 'Unbekannter Agent' }, 400);
  }

  const body = await c.req.json();
  const input = z
    .object({
      message: z.string().min(1),
      conversationId: z.string().uuid().optional(),
    })
    .parse(body);

  const configs = await db
    .select()
    .from(agentConfig)
    .where(eq(agentConfig.tenantId, tenantId));

  const enabledAgents: AgentType[] = configs.length > 0
    ? configs.filter((c) => c.enabled).map((c) => c.agentType as AgentType)
    : AGENT_TYPES.map((t) => t);

  const result = await runAgent(
    {
      tenantId,
      userId: user.sub,
      conversationId: input.conversationId ?? '',
      language: 'de',
      enabledAgents,
    },
    input.message,
    input.conversationId,
    agentType as AgentType,
  );

  return c.json({
    reply: result.message,
    agent: result.agent,
    agentName: result.agentName,
    conversationId: result.conversationId,
    metadata: result.metadata,
  });
});

// GET /agents/:type/conversation/latest — Load latest conversation for an agent type
agentsRouter.get('/:type/conversation/latest', rbac('agent', 'read'), async (c) => {
  const tenantId = c.get('tenantId');
  const user = c.get('user');
  const agentType = c.req.param('type');

  if (!AGENT_TYPES.includes(agentType as (typeof AGENT_TYPES)[number])) {
    return c.json({ error: 'Unbekannter Agent' }, 400);
  }

  const [conversation] = await db
    .select()
    .from(agentConversations)
    .where(
      and(
        eq(agentConversations.tenantId, tenantId),
        eq(agentConversations.agentType, agentType),
        eq(agentConversations.userId, user.sub),
      ),
    )
    .orderBy(desc(agentConversations.createdAt))
    .limit(1);

  if (!conversation) {
    return c.json({ conversation: null });
  }

  return c.json({
    conversation: {
      id: conversation.id,
      agentType: conversation.agentType,
      messages: conversation.messages,
      createdAt: conversation.createdAt,
    },
  });
});

// GET /agents/list — All available agents with their info
agentsRouter.get('/list', async (c) => {
  const tenantId = c.get('tenantId');
  const all = getAllAgents();

  const configs = await db
    .select()
    .from(agentConfig)
    .where(eq(agentConfig.tenantId, tenantId));

  const configMap = new Map(configs.map((c) => [c.agentType, c]));

  return c.json({
    agents: all.map((a) => ({
      type: a.type,
      name: a.name,
      emoji: a.emoji,
      description: a.description,
      enabled: configMap.get(a.type)?.enabled ?? true,
      tools: a.tools?.map((t) => t.name) ?? [],
    })),
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

  await syncTenantYAML(tenantId);

  return c.json({ ok: true, agentType: input.agentType, enabled: input.enabled });
});

export default agentsRouter;
