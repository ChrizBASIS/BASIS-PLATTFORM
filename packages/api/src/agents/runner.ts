import OpenAI from 'openai';
import { db } from '../db/index.js';
import { tokenUsage } from '../db/schema.js';
import {
  buildMessages,
  saveConversation,
  loadConversation,
} from './orchestrator.js';
import { getAgent, AGENTS } from './prompts.js';
import { getEnv } from '../lib/env.js';
import { getToolsForAgent, executeTool } from './tool-executor.js';
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

  // 2. Prüfe ob Agent aktiviert ist
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

  // 5. OpenAI API Call (with Function Calling)
  let assistantMessage = '';
  let inputTokens = 0;
  let outputTokens = 0;
  const executedToolCalls: Array<{ name: string; args: Record<string, unknown>; result?: string }> = [];

  try {
    const tools = getToolsForAgent(currentAgent);
    let currentMessages = [...messages];
    let toolCallRounds = 0;
    const MAX_TOOL_ROUNDS = 5;

    // Loop: GPT may call tools multiple times before giving a final answer
    while (toolCallRounds < MAX_TOOL_ROUNDS) {
      const completion = await openai.chat.completions.create({
        model: MODEL,
        messages: currentMessages,
        temperature: 0.7,
        max_tokens: 1500,
        ...(tools.length > 0 ? { tools } : {}),
      });

      inputTokens += completion.usage?.prompt_tokens ?? 0;
      outputTokens += completion.usage?.completion_tokens ?? 0;

      const choice = completion.choices[0];

      // If GPT wants to call tools
      if (choice?.finish_reason === 'tool_calls' && choice.message.tool_calls?.length) {
        // Add assistant message with tool calls to history
        currentMessages.push(choice.message as any);

        // Execute each tool call
        for (const tc of choice.message.tool_calls) {
          let args: Record<string, unknown> = {};
          try { args = JSON.parse(tc.function.arguments); } catch { /* empty args */ }
          console.log(`[runner] Tool call: ${tc.function.name}(${JSON.stringify(args)})`);

          const result = await executeTool(tc.function.name, args, ctx.tenantId, ctx);
          currentMessages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: result,
          } as any);
          executedToolCalls.push({ name: tc.function.name, args, result });
        }
        toolCallRounds++;
        continue; // Let GPT process the tool results
      }

      // Final text response
      assistantMessage = choice?.message?.content ?? 'Keine Antwort erhalten.';
      break;
    }

    if (!assistantMessage) {
      assistantMessage = 'Ich habe die Daten abgerufen, konnte aber keine Antwort formulieren. Bitte versuche es nochmal.';
    }
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
      toolCalls: executedToolCalls.length > 0 ? executedToolCalls : undefined,
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

  if (!ctx.enabledAgents.includes(currentAgent) && currentAgent !== 'orchestrator') {
    currentAgent = 'orchestrator';
  }

  const agentDef = getAgent(currentAgent);
  if (!agentDef) {
    throw new Error(`Agent nicht gefunden: ${currentAgent}`);
  }
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
  const tools = getToolsForAgent(currentAgent);

  // Resolve tool calls and collect them for SSE events
  let resolvedMessages = [...messages];
  let preToolTokensIn = 0;
  let preToolTokensOut = 0;
  const executedToolCalls: Array<{ name: string; args: Record<string, unknown>; result: string }> = [];

  if (tools.length > 0) {
    let toolRounds = 0;
    while (toolRounds < 5) {
      const preflight = await openai.chat.completions.create({
        model: MODEL,
        messages: resolvedMessages,
        temperature: 0.7,
        max_tokens: 1500,
        tools,
      });
      preToolTokensIn += preflight.usage?.prompt_tokens ?? 0;
      preToolTokensOut += preflight.usage?.completion_tokens ?? 0;
      const ch = preflight.choices[0];
      if (ch?.finish_reason === 'tool_calls' && ch.message.tool_calls?.length) {
        resolvedMessages.push(ch.message as any);
        for (const tc of ch.message.tool_calls) {
          let args: Record<string, unknown> = {};
          try { args = JSON.parse(tc.function.arguments); } catch { /* empty */ }
          console.log(`[runner-stream] Tool call: ${tc.function.name}(${JSON.stringify(args)})`);

          const result = await executeTool(tc.function.name, args, ctx.tenantId, ctx);
          resolvedMessages.push({ role: 'tool', tool_call_id: tc.id, content: result } as any);
          executedToolCalls.push({ name: tc.function.name, args, result });
        }
        toolRounds++;
        continue;
      }
      break;
    }
  }

  const openaiStream = await openai.chat.completions.create({
    model: MODEL,
    messages: resolvedMessages,
    temperature: 0.7,
    max_tokens: 1500,
    stream: true,
    stream_options: { include_usage: true },
  });

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let inputTokens = preToolTokensIn;
      let outputTokens = preToolTokensOut;

      // Send agent info first
      controller.enqueue(encoder.encode(
        `data: ${JSON.stringify({ type: 'agent', agent: currentAgent, agentName: agentDef.name })}\n\n`,
      ));

      // Send tool call events so the dashboard can show them as job cards
      for (const tc of executedToolCalls) {
        controller.enqueue(encoder.encode(
          `data: ${JSON.stringify({ type: 'tool_call', tool: tc.name, args: tc.args })}\n\n`,
        ));
      }

      try {
        for await (const chunk of openaiStream) {
          const delta = chunk.choices[0]?.delta?.content;
          if (delta) {
            fullResponse += delta;
            controller.enqueue(encoder.encode(
              `data: ${JSON.stringify({ type: 'delta', content: delta })}\n\n`,
            ));
          }
          // Capture usage from final chunk
          if (chunk.usage) {
            inputTokens += chunk.usage.prompt_tokens ?? 0;
            outputTokens += chunk.usage.completion_tokens ?? 0;
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

        // Track token usage
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
