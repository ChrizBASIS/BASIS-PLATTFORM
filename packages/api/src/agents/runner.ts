import OpenAI from 'openai';
import { db } from '../db/index.js';
import { tokenUsage } from '../db/schema.js';
import {
  routeMessage,
  buildMessages,
  saveConversation,
  loadConversation,
} from './orchestrator.js';
import { getAgent, AGENTS } from './prompts.js';
import { getEnv } from '../lib/env.js';
import type { AgentType, AgentContext, ChatMessage, AgentResponse } from './types.js';

const env = getEnv();

const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
  ...(env.OPENAI_BASE_URL ? { baseURL: env.OPENAI_BASE_URL } : {}),
});

const MODEL = 'gpt-4o-mini';

/**
 * Hauptfunktion: Verarbeitet eine User-Nachricht.
 *
 * 1. Routet zum richtigen Agenten
 * 2. Lädt Kontext (Onboarding-Tasks, Memory)
 * 3. Ruft OpenAI auf
 * 4. Speichert Konversation + Token-Usage
 * 5. Gibt Antwort zurück
 */
export async function runAgent(
  ctx: AgentContext,
  userMessage: string,
  conversationId?: string,
  forceAgent?: AgentType,
): Promise<AgentResponse & { conversationId: string }> {
  // 1. Bestehende Konversation laden oder neue starten
  let history: ChatMessage[] = [];
  let currentAgent: AgentType = forceAgent ?? 'orchestrator';

  if (conversationId) {
    const conv = await loadConversation(conversationId, ctx.tenantId);
    if (conv) {
      history = conv.messages;
      currentAgent = forceAgent ?? (conv.agentType as AgentType);
    }
  }

  // 2. Routing: Orchestrator entscheidet welcher Agent zuständig ist
  if (!forceAgent) {
    const routed = routeMessage(userMessage);
    if (routed !== 'orchestrator' || currentAgent === 'orchestrator') {
      currentAgent = routed;
    }
  }

  // 3. Prüfe ob Agent aktiviert ist
  if (!ctx.enabledAgents.includes(currentAgent) && currentAgent !== 'orchestrator') {
    currentAgent = 'orchestrator';
  }

  const agentDef = getAgent(currentAgent);
  if (!agentDef) {
    return {
      message: 'Entschuldigung, dieser Agent ist nicht verfügbar.',
      agent: 'orchestrator',
      agentName: 'Lena',
      conversationId: conversationId ?? '',
    };
  }

  // 4. Messages bauen (System-Prompt + Kontext + History + User-Message)
  const messages = await buildMessages(
    currentAgent,
    ctx.tenantId,
    history,
    userMessage,
  );

  // 5. OpenAI API Call
  let assistantMessage = '';
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages,
      temperature: 0.7,
      max_tokens: 1500,
    });

    assistantMessage = completion.choices[0]?.message?.content ?? 'Keine Antwort erhalten.';
    inputTokens = completion.usage?.prompt_tokens ?? 0;
    outputTokens = completion.usage?.completion_tokens ?? 0;
  } catch (error: any) {
    console.error('OpenAI API error:', error?.message);

    // Fallback: Offline-Antwort
    assistantMessage = `Entschuldigung, ich kann gerade nicht antworten. Das KI-System ist vorübergehend nicht erreichbar. Bitte versuche es in ein paar Minuten erneut.\n\n_Fehler: ${error?.message ?? 'Unbekannt'}_`;
  }

  // 6. Handoff-Erkennung: Wenn der Agent an einen anderen delegiert
  let handedOff = false;
  let handedOffTo: AgentType | undefined;

  if (currentAgent === 'orchestrator') {
    const handoffMatch = assistantMessage.match(/\[HANDOFF:(\w+)\]/);
    if (handoffMatch) {
      const targetType = handoffMatch[1] as AgentType;
      if (AGENTS[targetType]) {
        handedOff = true;
        handedOffTo = targetType;
        assistantMessage = assistantMessage.replace(/\[HANDOFF:\w+\]/, '').trim();

        // Rekursiv den Ziel-Agenten aufrufen
        const delegated = await runAgent(
          ctx, userMessage, conversationId, targetType,
        );
        return delegated;
      }
    }
  }

  // 7. Konversation updaten
  const updatedHistory: ChatMessage[] = [
    ...history,
    { role: 'user', content: userMessage, timestamp: new Date() },
    {
      role: 'assistant',
      content: assistantMessage,
      agent: currentAgent,
      agentName: agentDef.name,
      timestamp: new Date(),
    },
  ];

  const savedId = await saveConversation(
    ctx.tenantId,
    ctx.userId,
    currentAgent,
    updatedHistory,
    conversationId,
  );

  // 8. Token-Usage tracken
  if (inputTokens > 0 || outputTokens > 0) {
    await db.insert(tokenUsage).values({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      agentType: currentAgent,
      inputTokens,
      outputTokens,
      model: MODEL,
      conversationId: savedId,
    });
  }

  return {
    message: assistantMessage,
    agent: currentAgent,
    agentName: agentDef.name,
    handedOff,
    handedOffTo,
    conversationId: savedId,
    metadata: {
      model: MODEL,
      inputTokens,
      outputTokens,
    },
  };
}

/**
 * Streaming-Version: Gibt einen ReadableStream zurück für SSE.
 */
export async function runAgentStream(
  ctx: AgentContext,
  userMessage: string,
  conversationId?: string,
  forceAgent?: AgentType,
): Promise<{
  stream: ReadableStream;
  agentType: AgentType;
  agentName: string;
  conversationId: string;
}> {
  // Routing + History laden (gleich wie oben)
  let history: ChatMessage[] = [];
  let currentAgent: AgentType = forceAgent ?? 'orchestrator';

  if (conversationId) {
    const conv = await loadConversation(conversationId, ctx.tenantId);
    if (conv) {
      history = conv.messages;
      currentAgent = forceAgent ?? (conv.agentType as AgentType);
    }
  }

  if (!forceAgent) {
    const routed = routeMessage(userMessage);
    if (routed !== 'orchestrator' || currentAgent === 'orchestrator') {
      currentAgent = routed;
    }
  }

  if (!ctx.enabledAgents.includes(currentAgent) && currentAgent !== 'orchestrator') {
    currentAgent = 'orchestrator';
  }

  const agentDef = getAgent(currentAgent)!;
  const messages = await buildMessages(currentAgent, ctx.tenantId, history, userMessage);

  // Pre-save conversation with user message
  const tempHistory: ChatMessage[] = [
    ...history,
    { role: 'user', content: userMessage, timestamp: new Date() },
  ];
  const savedId = await saveConversation(
    ctx.tenantId, ctx.userId, currentAgent, tempHistory, conversationId,
  );

  // Create streaming response
  let fullResponse = '';

  const openaiStream = await openai.chat.completions.create({
    model: MODEL,
    messages,
    temperature: 0.7,
    max_tokens: 1500,
    stream: true,
  });

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      // Send agent info first
      controller.enqueue(encoder.encode(
        `data: ${JSON.stringify({ type: 'agent', agent: currentAgent, agentName: agentDef.name })}\n\n`,
      ));

      try {
        for await (const chunk of openaiStream) {
          const delta = chunk.choices[0]?.delta?.content;
          if (delta) {
            fullResponse += delta;
            controller.enqueue(encoder.encode(
              `data: ${JSON.stringify({ type: 'delta', content: delta })}\n\n`,
            ));
          }
        }

        // Save complete conversation
        const finalHistory: ChatMessage[] = [
          ...tempHistory,
          {
            role: 'assistant',
            content: fullResponse,
            agent: currentAgent,
            agentName: agentDef.name,
            timestamp: new Date(),
          },
        ];
        await saveConversation(ctx.tenantId, ctx.userId, currentAgent, finalHistory, savedId);

        // Send done event
        controller.enqueue(encoder.encode(
          `data: ${JSON.stringify({ type: 'done', conversationId: savedId })}\n\n`,
        ));
      } catch (error: any) {
        controller.enqueue(encoder.encode(
          `data: ${JSON.stringify({ type: 'error', message: error?.message ?? 'Unknown error' })}\n\n`,
        ));
      } finally {
        controller.close();
      }
    },
  });

  return {
    stream,
    agentType: currentAgent,
    agentName: agentDef.name,
    conversationId: savedId,
  };
}
