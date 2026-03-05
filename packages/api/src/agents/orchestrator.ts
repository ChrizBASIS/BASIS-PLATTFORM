import { db } from '../db/index.js';
import { agentMemory, agentConversations, onboardingTasks, onboardingProfiles, integrations } from '../db/schema.js';
import { eq, and, ne } from 'drizzle-orm';
import { AGENTS, getAgent } from './prompts.js';
import { getTenantYAML } from '../lib/tenant-yaml.js';
import { createAdapter, createMailAdapter } from '../integrations/registry.js';
import type { CRMAdapter, MailAdapter } from '../integrations/types.js';
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

  // 4. CRM/Odoo Briefing — echte Firmendaten für den jeweiligen Bereich
  const crmBriefing = await loadCrmBriefing(agentType, tenantId);
  if (crmBriefing) {
    parts.push(crmBriefing);
  }

  // 5. Mail Briefing — letzte E-Mails für Agenten mit Mail-Zugang
  const mailBriefing = await loadMailBriefing(agentType, tenantId);
  if (mailBriefing) {
    parts.push(mailBriefing);
  }

  return parts.join('\n');
}

/**
 * Lädt ein bereichsspezifisches CRM-Briefing für den Agenten.
 * Jeder Agent bekommt die Odoo-Daten, die für seinen Bereich relevant sind.
 */
async function loadCrmBriefing(agentType: AgentType, tenantId: string): Promise<string | null> {
  let adapter: CRMAdapter | null = null;
  try {
    const [intg] = await db
      .select()
      .from(integrations)
      .where(and(
        eq(integrations.tenantId, tenantId),
        eq(integrations.status, 'active'),
        ne(integrations.provider, 'email'),
      ))
      .limit(1);
    if (!intg) return null;
    adapter = createAdapter(intg.provider as any, {
      encrypted: intg.credentialsEncrypted,
      iv: intg.credentialsIv,
      tag: intg.credentialsTag,
    } as any);
  } catch {
    return null;
  }
  if (!adapter) return null;

  const parts: string[] = ['DEIN ODOO/CRM-BRIEFING (aktuelle Firmendaten für deinen Bereich):'];

  try {
    switch (agentType) {
      case 'finance': {
        const [summary, invoices, deals, products] = await Promise.all([
          adapter.getSummary().catch(() => null),
          adapter.getInvoices(20).catch(() => []),
          adapter.getDeals(10).catch(() => []),
          adapter.getProducts?.(20).catch(() => []) ?? Promise.resolve([]),
        ]);
        if (summary) {
          parts.push(`\nFINANZ-ÜBERBLICK:`);
          parts.push(`- Offene Deals: ${summary.openDeals} (Pipeline: ${summary.revenuePipeline} ${summary.pipelineCurrency})`);
          parts.push(`- Überfällige Rechnungen: ${summary.overdueInvoices}`);
          parts.push(`- Gesamtkontakte: ${summary.totalContacts}`);
        }
        if (invoices.length > 0) {
          parts.push(`\nRECHNUNGEN (${invoices.length}):`);
          for (const inv of invoices.slice(0, 15)) {
            parts.push(`- ${inv.number}: ${inv.amount} ${inv.currency} | Status: ${inv.status} | Fällig: ${inv.dueDate ?? '?'} | ${inv.contactName ?? 'Unbekannt'}`);
          }
        }
        if (deals.length > 0) {
          parts.push(`\nDEALS (${deals.length}):`);
          for (const d of deals) {
            parts.push(`- ${d.title}: ${d.value ?? '?'} ${d.currency ?? ''} | Phase: ${d.stage} | ${d.contactName ?? ''}`);
          }
        }
        if (products.length > 0) {
          parts.push(`\nPRODUKTE/DIENSTLEISTUNGEN (${products.length}):`);
          for (const p of products.slice(0, 15)) {
            parts.push(`- ${p.name}: ${p.listPrice} ${p.currency} | Typ: ${p.type}${p.category ? ` | Kategorie: ${p.category}` : ''}`);
          }
        }
        break;
      }

      case 'backoffice': {
        const [summary, contacts, employees, products] = await Promise.all([
          adapter.getSummary().catch(() => null),
          adapter.getContacts(30).catch(() => []),
          adapter.getEmployees?.(30).catch(() => []) ?? Promise.resolve([]),
          adapter.getProducts?.(20).catch(() => []) ?? Promise.resolve([]),
        ]);
        if (summary) {
          parts.push(`\nFIRMEN-ÜBERBLICK:`);
          parts.push(`- Gesamtkontakte: ${summary.totalContacts}`);
          parts.push(`- Letzte Aktivitäten: ${summary.recentActivities}`);
        }
        if (contacts.length > 0) {
          parts.push(`\nKONTAKTLISTE (${contacts.length}):`);
          for (const c of contacts.slice(0, 20)) {
            parts.push(`- ${c.name}${c.company ? ` (${c.company})` : ''} | ${c.email ?? ''} | ${c.phone ?? ''}`);
          }
        }
        if (employees.length > 0) {
          parts.push(`\nMITARBEITER (${employees.length}):`);
          for (const e of employees) {
            parts.push(`- ${e.name}${e.jobTitle ? ` — ${e.jobTitle}` : ''}${e.department ? ` (${e.department})` : ''} | ${e.email ?? ''}`);
          }
        }
        if (products.length > 0) {
          parts.push(`\nPRODUKTE/DIENSTLEISTUNGEN (${products.length}):`);
          for (const p of products.slice(0, 15)) {
            parts.push(`- ${p.name}: ${p.listPrice} ${p.currency} | ${p.type}${p.category ? ` | ${p.category}` : ''}`);
          }
        }
        break;
      }

      case 'marketing': {
        const [summary, contacts, activities, events] = await Promise.all([
          adapter.getSummary().catch(() => null),
          adapter.getContacts(20).catch(() => []),
          adapter.getActivities(undefined, 10).catch(() => []),
          adapter.getEvents?.(15).catch(() => []) ?? Promise.resolve([]),
        ]);
        if (summary) {
          parts.push(`\nMARKETING-ÜBERBLICK:`);
          parts.push(`- Gesamtkontakte: ${summary.totalContacts}`);
          parts.push(`- Pipeline-Umsatz: ${summary.revenuePipeline} ${summary.pipelineCurrency}`);
        }
        if (contacts.length > 0) {
          parts.push(`\nKUNDEN/KONTAKTE (${contacts.length}):`);
          for (const c of contacts.slice(0, 15)) {
            parts.push(`- ${c.name}${c.company ? ` (${c.company})` : ''}${c.tags?.length ? ` [${c.tags.join(', ')}]` : ''}`);
          }
        }
        if (activities.length > 0) {
          parts.push(`\nLETZTE AKTIVITÄTEN:`);
          for (const a of activities) {
            parts.push(`- ${a.date}: ${a.type} — ${a.description.substring(0, 100)}${a.contactName ? ` (${a.contactName})` : ''}`);
          }
        }
        if (events.length > 0) {
          parts.push(`\nVERANSTALTUNGEN/EVENTS (${events.length}):`);
          for (const ev of events) {
            parts.push(`- ${ev.name} | ${ev.dateBegin}${ev.dateEnd ? ` bis ${ev.dateEnd}` : ''} | ${ev.location ?? 'Kein Ort'}${ev.seatsAvailable ? ` | ${ev.seatsAvailable} Plätze frei` : ''}`);
          }
        }
        break;
      }

      case 'sekretariat': {
        const [contacts, activities, events] = await Promise.all([
          adapter.getContacts(25).catch(() => []),
          adapter.getActivities(undefined, 15).catch(() => []),
          adapter.getEvents?.(10).catch(() => []) ?? Promise.resolve([]),
        ]);
        if (contacts.length > 0) {
          parts.push(`\nKONTAKTE FÜR KORRESPONDENZ (${contacts.length}):`);
          for (const c of contacts.slice(0, 20)) {
            parts.push(`- ${c.name}${c.company ? ` (${c.company})` : ''} | ${c.email ?? 'kein Email'} | ${c.phone ?? 'kein Tel.'}`);
          }
        }
        if (activities.length > 0) {
          parts.push(`\nLETZTE AKTIVITÄTEN/KOMMUNIKATION:`);
          for (const a of activities) {
            parts.push(`- ${a.date}: ${a.type} — ${a.description.substring(0, 100)}${a.contactName ? ` (${a.contactName})` : ''}`);
          }
        }
        if (events.length > 0) {
          parts.push(`\nKOMMENDE VERANSTALTUNGEN (${events.length}):`);
          for (const ev of events) {
            parts.push(`- ${ev.name} | ${ev.dateBegin}${ev.location ? ` | ${ev.location}` : ''}`);
          }
        }
        break;
      }

      case 'support': {
        const [summary] = await Promise.all([
          adapter.getSummary().catch(() => null),
        ]);
        if (summary) {
          parts.push(`\nFIRMEN-ÜBERBLICK FÜR SUPPORT:`);
          parts.push(`- Gesamtkontakte: ${summary.totalContacts}`);
          parts.push(`- Offene Deals: ${summary.openDeals}`);
          parts.push(`- Überfällige Rechnungen: ${summary.overdueInvoices}`);
          parts.push(`- Letzte Aktivitäten: ${summary.recentActivities}`);
        }
        break;
      }

      case 'orchestrator': {
        const [summary, events, employees] = await Promise.all([
          adapter.getSummary().catch(() => null),
          adapter.getEvents?.(10).catch(() => []) ?? Promise.resolve([]),
          adapter.getEmployees?.(20).catch(() => []) ?? Promise.resolve([]),
        ]);
        if (summary) {
          parts.push(`\nGESAMTÜBERBLICK (für Team-Koordination):`);
          parts.push(`- Gesamtkontakte: ${summary.totalContacts}`);
          parts.push(`- Offene Deals: ${summary.openDeals} (Pipeline: ${summary.revenuePipeline} ${summary.pipelineCurrency})`);
          parts.push(`- Überfällige Rechnungen: ${summary.overdueInvoices}`);
          parts.push(`- Letzte Aktivitäten: ${summary.recentActivities}`);
          parts.push(`- Letzte Synchronisierung: ${summary.lastSynced}`);
        }
        if (events.length > 0) {
          parts.push(`\nVERANSTALTUNGEN (${events.length}):`);
          for (const ev of events) {
            parts.push(`- ${ev.name} | ${ev.dateBegin}${ev.dateEnd ? ` bis ${ev.dateEnd}` : ''} | ${ev.location ?? 'Kein Ort'}${ev.seatsAvailable ? ` | ${ev.seatsAvailable} Plätze frei` : ''}`);
          }
        }
        if (employees.length > 0) {
          parts.push(`\nMITARBEITER (${employees.length}):`);
          for (const e of employees) {
            parts.push(`- ${e.name}${e.jobTitle ? ` — ${e.jobTitle}` : ''}${e.department ? ` (${e.department})` : ''}`);
          }
        }
        break;
      }

      case 'builder': {
        const [summary] = await Promise.all([
          adapter.getSummary().catch(() => null),
        ]);
        if (summary) {
          parts.push(`\nDATEN-ÜBERBLICK FÜR DASHBOARD-WIDGETS:`);
          parts.push(`- Verfügbare Kontakte: ${summary.totalContacts}`);
          parts.push(`- Offene Deals: ${summary.openDeals}`);
          parts.push(`- Pipeline-Umsatz: ${summary.revenuePipeline} ${summary.pipelineCurrency}`);
          parts.push(`- Überfällige Rechnungen: ${summary.overdueInvoices}`);
        }
        break;
      }
    }
  } catch (err: any) {
    console.error(`[loadCrmBriefing] Error for ${agentType}:`, err?.message);
    return null;
  }

  return parts.length > 1 ? parts.join('\n') : null;
}

/**
 * Lädt die letzten E-Mails als Briefing für Agenten mit Mail-Zugang.
 * sekretariat: 10 Mails, orchestrator/backoffice: 5 Mails
 */
async function loadMailBriefing(agentType: AgentType, tenantId: string): Promise<string | null> {
  // Only these agents get mail context
  const mailLimits: Partial<Record<AgentType, number>> = {
    sekretariat: 10,
    orchestrator: 5,
    backoffice: 5,
  };
  const limit = mailLimits[agentType];
  if (!limit) return null;

  let mailAdapter: MailAdapter | null = null;
  try {
    const [intg] = await db
      .select()
      .from(integrations)
      .where(
        and(
          eq(integrations.tenantId, tenantId),
          eq(integrations.provider, 'email'),
          eq(integrations.status, 'active'),
        ),
      )
      .limit(1);
    if (!intg) return null;
    mailAdapter = createMailAdapter({
      encrypted: intg.credentialsEncrypted,
      iv: intg.credentialsIv,
      tag: intg.credentialsTag,
    } as any);
  } catch {
    return null;
  }
  if (!mailAdapter) return null;

  try {
    const emails = await mailAdapter.getRecentEmails(limit, 'INBOX');
    if (emails.length === 0) return null;

    const parts: string[] = [`\nDEIN E-MAIL-BRIEFING (letzte ${emails.length} Mails):`];
    for (const e of emails) {
      const readFlag = e.read ? '' : ' [UNGELESEN]';
      parts.push(`- ${e.date.substring(0, 16)} | Von: ${e.from} | Betreff: ${e.subject}${readFlag}`);
      if (e.snippet) {
        parts.push(`  → ${e.snippet.substring(0, 120)}...`);
      }
    }
    return parts.join('\n');
  } catch (err: any) {
    console.error(`[loadMailBriefing] Error for ${agentType}:`, err?.message);
    return null;
  }
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
 * WICHTIG: tenantId wird mitgeprüft um Cross-Tenant-Zugriff zu verhindern.
 */
export async function loadConversation(
  conversationId: string,
  tenantId: string,
): Promise<{ agentType: string; messages: ChatMessage[] } | null> {
  const [conv] = await db
    .select()
    .from(agentConversations)
    .where(
      and(
        eq(agentConversations.id, conversationId),
        eq(agentConversations.tenantId, tenantId),
      ),
    )
    .limit(1);

  if (!conv) return null;

  return {
    agentType: conv.agentType,
    messages: conv.messages as ChatMessage[],
  };
}
