import { db } from '../db/index.js';
import { agentMemory, agentConversations, onboardingTasks, onboardingProfiles } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { AGENTS, getAgent } from './prompts.js';
import { getTenantYAML } from '../lib/tenant-yaml.js';
import type { AgentType, AgentContext, ChatMessage, AgentResponse } from './types.js';

/**
 * Keyword-basiertes Routing: Analysiert die Nachricht und bestimmt den zuständigen Agenten.
 */
const ROUTING_KEYWORDS: Record<AgentType, string[]> = {
  orchestrator: ['team', 'agenten', 'wer', 'hilfe', 'onboarding', 'status', 'übersicht'],
  sekretariat: ['email', 'e-mail', 'mail', 'termin', 'kalender', 'brief', 'einladung', 'telefon', 'anruf', 'korrespondenz', 'absage', 'bestätigung', 'reminder'],
  backoffice: ['dokument', 'formular', 'vorlage', 'checklist', 'inventar', 'personal', 'dienstplan', 'urlaub', 'organisation', 'ordner'],
  finance: ['rechnung', 'invoice', 'buchhaltung', 'zahlung', 'mahnung', 'umsatz', 'gewinn', 'steuer', 'lohn', 'gehalt', 'finanzen', 'konto', 'bilanz', 'mwst'],
  marketing: ['social', 'instagram', 'facebook', 'post', 'newsletter', 'werbung', 'kampagne', 'bewertung', 'review', 'seo', 'website', 'foto', 'hashtag'],
  support: ['hilfe', 'problem', 'fehler', 'bug', 'funktioniert nicht', 'wie geht', 'anleitung', 'faq', 'support', 'reklamation'],
  builder: ['widget', 'dashboard', 'bericht', 'report', 'anpassen', 'bauen', 'erstellen', 'automatisierung', 'trigger', 'layout'],
};

/**
 * Routet eine Nachricht zum richtigen Agenten basierend auf Keyword-Analyse.
 * Gibt den AgentType zurück.
 */
export function routeMessage(message: string): AgentType {
  const lower = message.toLowerCase();
  const scores: Record<string, number> = {};

  for (const [agent, keywords] of Object.entries(ROUTING_KEYWORDS)) {
    scores[agent] = 0;
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        scores[agent] += kw.length; // Längere Matches = höheres Gewicht
      }
    }
  }

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (sorted[0][1] > 0 && sorted[0][0] !== 'orchestrator') {
    return sorted[0][0] as AgentType;
  }

  // Fallback: Orchestrator beantwortet selbst
  return 'orchestrator';
}

/**
 * Lädt den Kontext für einen Agenten: Onboarding-Tasks + gespeicherte Memories.
 */
export async function loadAgentContext(
  agentType: AgentType,
  tenantId: string,
): Promise<string> {
  const parts: string[] = [];

  // 0. Tenant YAML-Profil als primäre Kontextquelle
  const yaml = await getTenantYAML(tenantId);
  if (yaml) {
    parts.push(`KUNDEN-PROFIL (YAML — Single Source of Truth):\n\`\`\`yaml\n${yaml}\n\`\`\`\n`);
  }

  // 1. Onboarding-Profile laden
  const [profile] = await db
    .select()
    .from(onboardingProfiles)
    .where(eq(onboardingProfiles.tenantId, tenantId))
    .limit(1);

  if (profile) {
    parts.push(`KUNDENPROFIL:
- Branche: ${profile.industry}
- Betriebsgröße: ${profile.companySize ?? 'unbekannt'}
- Beschreibung: ${profile.businessDescription ?? 'keine'}
`);
  }

  // 2. Diesem Agent zugewiesene Tasks laden
  if (profile) {
    const tasks = await db
      .select()
      .from(onboardingTasks)
      .where(
        and(
          eq(onboardingTasks.tenantId, tenantId),
          eq(onboardingTasks.assignedAgent, agentType === 'orchestrator' ? 'lena'
            : agentType === 'sekretariat' ? 'marie'
            : agentType === 'backoffice' ? 'tom'
            : agentType === 'finance' ? 'clara'
            : agentType === 'marketing' ? 'marco'
            : agentType === 'support' ? 'alex'
            : 'nico'),
        ),
      );

    if (tasks.length > 0) {
      parts.push(`DEINE ZUGEWIESENEN AUFGABEN (aus Onboarding):`);
      for (const t of tasks) {
        parts.push(`- [${t.priority?.toUpperCase()}] ${t.title}${t.description ? `: ${t.description}` : ''}${t.currentProcess ? ` (Aktuell: ${t.currentProcess})` : ''} — Status: ${t.status}`);
      }
      parts.push('');
    }
  }

  // 3. Agent-Memory laden
  const agentSlug = agentType === 'orchestrator' ? 'lena'
    : agentType === 'sekretariat' ? 'marie'
    : agentType === 'backoffice' ? 'tom'
    : agentType === 'finance' ? 'clara'
    : agentType === 'marketing' ? 'marco'
    : agentType === 'support' ? 'alex'
    : 'nico';

  const memories = await db
    .select()
    .from(agentMemory)
    .where(
      and(
        eq(agentMemory.tenantId, tenantId),
        eq(agentMemory.key, `context_${agentSlug}`),
      ),
    )
    .limit(1);

  if (memories.length > 0 && memories[0].value) {
    parts.push(`GESPEICHERTER KONTEXT:\n${JSON.stringify(memories[0].value, null, 2)}\n`);
  }

  return parts.join('\n');
}

/**
 * Baut die vollständige Nachrichtenliste für den OpenAI API-Call:
 * System-Prompt + Agent-Kontext + Conversation-History + neue Nachricht.
 */
export async function buildMessages(
  agentType: AgentType,
  tenantId: string,
  conversationHistory: ChatMessage[],
  userMessage: string,
): Promise<Array<{ role: 'system' | 'user' | 'assistant'; content: string }>> {
  const agentDef = getAgent(agentType);
  if (!agentDef) throw new Error(`Unknown agent: ${agentType}`);

  const context = await loadAgentContext(agentType, tenantId);

  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    {
      role: 'system',
      content: `${agentDef.systemPrompt}\n\n${context}`,
    },
  ];

  // Conversation history (last 20 messages max to stay within context)
  const recent = conversationHistory.slice(-20);
  for (const msg of recent) {
    messages.push({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.content,
    });
  }

  // New user message
  messages.push({ role: 'user', content: userMessage });

  return messages;
}

/**
 * Speichert eine Konversation in der DB.
 */
export async function saveConversation(
  tenantId: string,
  userId: string,
  agentType: AgentType,
  messages: ChatMessage[],
  conversationId?: string,
): Promise<string> {
  if (conversationId) {
    await db
      .update(agentConversations)
      .set({ messages })
      .where(eq(agentConversations.id, conversationId));
    return conversationId;
  }

  const [conv] = await db
    .insert(agentConversations)
    .values({
      tenantId,
      userId,
      agentType,
      messages,
    })
    .returning();

  return conv.id;
}

/**
 * Lädt eine bestehende Konversation.
 */
export async function loadConversation(
  conversationId: string,
): Promise<{ agentType: string; messages: ChatMessage[] } | null> {
  const [conv] = await db
    .select()
    .from(agentConversations)
    .where(eq(agentConversations.id, conversationId))
    .limit(1);

  if (!conv) return null;

  return {
    agentType: conv.agentType,
    messages: conv.messages as ChatMessage[],
  };
}
