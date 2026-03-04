/**
 * Agent Tool Executor
 *
 * Executes real tool calls made by agents via OpenAI Function Calling.
 * Currently supports CRM tools (search contacts, get invoices, get deals)
 * and widget tools (publish widget to dashboard menu).
 *
 * All CRM data is fetched from the tenant's active integration (Odoo, HubSpot, etc.).
 */

import { db } from '../db/index.js';
import { integrations, widgets, agentConversations } from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { createAdapter } from '../integrations/registry.js';
import type { CRMAdapter } from '../integrations/types.js';
import type { AgentType, AgentContext } from './types.js';

/**
 * OpenAI Function definitions for agents that have CRM access.
 */
export const CRM_TOOLS: Array<{
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}> = [
  {
    type: 'function',
    function: {
      name: 'search_crm_contacts',
      description: 'CRM-Kontakte durchsuchen (Name, E-Mail, Telefon). Gibt eine Liste von Kontakten zurück.',
      parameters: {
        type: 'object',
        properties: {
          search: { type: 'string', description: 'Suchbegriff (Name, E-Mail, Firma)' },
          limit: { type: 'number', description: 'Max. Anzahl Ergebnisse (default 10)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_crm_deals',
      description: 'Offene Deals/Angebote aus dem CRM abrufen. Zeigt Titel, Wert, Phase und Wahrscheinlichkeit.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Max. Anzahl Ergebnisse (default 20)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_crm_invoices',
      description: 'Rechnungen aus dem CRM abrufen. Zeigt Betrag, Status, Fälligkeitsdatum.',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', description: 'Filter: open, paid, overdue (default: alle)' },
          limit: { type: 'number', description: 'Max. Anzahl Ergebnisse (default 20)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_crm_summary',
      description: 'Zusammenfassung des CRM: Anzahl Kontakte, offene Deals, Pipeline-Umsatz, überfällige Rechnungen.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
];

/**
 * Orchestrator tools for Lena: ask agents + status checking.
 * ask_agent calls a sub-agent in the background and returns its response to Lena.
 * Lena always stays the responding agent — no handoff.
 */
export const ORCHESTRATOR_TOOLS: Array<{
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}> = [
  {
    type: 'function',
    function: {
      name: 'ask_agent',
      description: 'Stelle einem Agenten eine Frage oder gib ihm eine Aufgabe. Du bekommst seine Antwort zurück und kannst sie dem Kunden zusammenfassen. Der Kunde sieht nur DEINE Antwort, nicht die des Agenten direkt.',
      parameters: {
        type: 'object',
        properties: {
          agent: {
            type: 'string',
            enum: ['sekretariat', 'backoffice', 'finance', 'marketing', 'support', 'builder'],
            description: 'Der Agent-Typ (marie=sekretariat, tom=backoffice, clara=finance, marco=marketing, alex=support, nico=builder)',
          },
          task: {
            type: 'string',
            description: 'Die konkrete Frage oder Aufgabe für den Agenten',
          },
        },
        required: ['agent', 'task'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'check_agent_status',
      description: 'Zeigt die letzten Aktivitäten und Konversationen aller Agenten an. Nutze dieses Tool wenn der Kunde fragt was die Agenten gerade machen, wie weit sie sind, oder ob sie arbeiten.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
];

/**
 * Widget/Dashboard tools for Nico (Builder agent).
 */
export const WIDGET_TOOLS: Array<{
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}> = [
  {
    type: 'function',
    function: {
      name: 'publish_widget_to_menu',
      description: 'Ein generiertes Widget als eigenen Menüpunkt im Dashboard veröffentlichen. Das Widget wird in der Sidebar als neuer Eintrag sichtbar.',
      parameters: {
        type: 'object',
        properties: {
          widget_id: { type: 'string', description: 'ID des Widgets das veröffentlicht werden soll' },
          menu_label: { type: 'string', description: 'Bezeichnung im Menü (z.B. "Zutatenrechner")' },
        },
        required: ['widget_id', 'menu_label'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_widgets',
      description: 'Alle generierten Widgets des Kunden auflisten mit Status (draft/published).',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
];

/**
 * Get the CRM adapter for a tenant (if they have an active integration).
 */
async function getCrmAdapter(tenantId: string): Promise<CRMAdapter | null> {
  const [intg] = await db
    .select()
    .from(integrations)
    .where(and(eq(integrations.tenantId, tenantId), eq(integrations.status, 'active')))
    .limit(1);

  if (!intg) return null;

  try {
    return createAdapter(intg.provider as any, {
      encrypted: intg.credentialsEncrypted,
      iv: intg.credentialsIv,
      tag: intg.credentialsTag,
    } as any);
  } catch (err: any) {
    console.error('[tool-executor] Failed to create CRM adapter:', err?.message);
    return null;
  }
}

/**
 * Execute a tool call and return the result as a string (for OpenAI).
 */
export async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  tenantId: string,
  agentContext?: AgentContext,
): Promise<string> {
  try {
    switch (toolName) {
      case 'ask_agent': {
        const targetAgent = args.agent as AgentType;
        const task = args.task as string;
        if (!targetAgent || !task) {
          return JSON.stringify({ error: 'agent und task sind erforderlich.' });
        }
        if (targetAgent === 'orchestrator') {
          return JSON.stringify({ error: 'Kann nicht an den Orchestrator fragen.' });
        }
        if (!agentContext) {
          return JSON.stringify({ error: 'Kein Agent-Kontext verfügbar.' });
        }
        const agentNames: Record<string, string> = {
          sekretariat: 'Marie', backoffice: 'Tom', finance: 'Clara',
          marketing: 'Marco', support: 'Alex', builder: 'Nico',
        };
        console.log(`[ask_agent] Frage an ${agentNames[targetAgent] ?? targetAgent}: ${task}`);
        const { runAgent } = await import('./runner.js');
        try {
          const timeout = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), 15000),
          );
          const result = await Promise.race([
            runAgent(agentContext, task, undefined, targetAgent),
            timeout,
          ]);
          console.log(`[ask_agent] ${agentNames[targetAgent]} antwortete (${result.message.length} Zeichen)`);
          return JSON.stringify({
            agent: targetAgent,
            agentName: agentNames[targetAgent] ?? targetAgent,
            response: result.message,
          });
        } catch (err: any) {
          console.error(`[ask_agent] ${targetAgent} error:`, err?.message);
          return JSON.stringify({
            agent: targetAgent,
            agentName: agentNames[targetAgent] ?? targetAgent,
            error: err?.message ?? 'Timeout/Fehler',
          });
        }
      }

      case 'check_agent_status': {
        const agentNames: Record<string, string> = {
          sekretariat: 'Marie', backoffice: 'Tom', finance: 'Clara',
          marketing: 'Marco', support: 'Alex', builder: 'Nico',
        };
        const statuses: Array<{ agent: string; name: string; lastActivity: string | null; lastMessage: string | null }> = [];
        for (const [type, name] of Object.entries(agentNames)) {
          const [latest] = await db
            .select()
            .from(agentConversations)
            .where(
              and(
                eq(agentConversations.tenantId, tenantId),
                eq(agentConversations.agentType, type),
              ),
            )
            .orderBy(desc(agentConversations.createdAt))
            .limit(1);
          if (latest) {
            const msgs = (latest.messages as Array<{ role: string; content: string }>) ?? [];
            const lastAssistant = [...msgs].reverse().find(m => m.role === 'assistant');
            statuses.push({
              agent: type,
              name,
              lastActivity: latest.createdAt?.toISOString() ?? null,
              lastMessage: lastAssistant?.content?.substring(0, 150) ?? null,
            });
          } else {
            statuses.push({ agent: type, name, lastActivity: null, lastMessage: null });
          }
        }
        return JSON.stringify({ agents: statuses });
      }

      case 'search_crm_contacts': {
        const adapter = await getCrmAdapter(tenantId);
        if (!adapter) return JSON.stringify({ error: 'Keine CRM-Integration verbunden. Bitte zuerst unter "Integrationen" ein CRM anbinden.' });
        const contacts = await adapter.getContacts(
          (args.limit as number) ?? 10,
          (args.search as string) ?? undefined,
        );
        return JSON.stringify({ contacts, count: contacts.length });
      }

      case 'get_crm_deals': {
        const adapter = await getCrmAdapter(tenantId);
        if (!adapter) return JSON.stringify({ error: 'Keine CRM-Integration verbunden.' });
        const deals = await adapter.getDeals((args.limit as number) ?? 20);
        return JSON.stringify({ deals, count: deals.length });
      }

      case 'get_crm_invoices': {
        const adapter = await getCrmAdapter(tenantId);
        if (!adapter) return JSON.stringify({ error: 'Keine CRM-Integration verbunden.' });
        const invoices = await adapter.getInvoices(
          (args.limit as number) ?? 20,
          (args.status as string) ?? undefined,
        );
        return JSON.stringify({ invoices, count: invoices.length });
      }

      case 'get_crm_summary': {
        const adapter = await getCrmAdapter(tenantId);
        if (!adapter) return JSON.stringify({ error: 'Keine CRM-Integration verbunden.' });
        const summary = await adapter.getSummary();
        return JSON.stringify(summary);
      }

      case 'publish_widget_to_menu': {
        const widgetId = args.widget_id as string;
        const menuLabel = args.menu_label as string;
        if (!widgetId || !menuLabel) {
          return JSON.stringify({ error: 'widget_id und menu_label sind erforderlich.' });
        }
        const [widget] = await db
          .select()
          .from(widgets)
          .where(and(eq(widgets.id, widgetId), eq(widgets.tenantId, tenantId)))
          .limit(1);
        if (!widget) return JSON.stringify({ error: 'Widget nicht gefunden.' });

        await db.update(widgets).set({
          status: 'published',
          config: { ...(widget.config as Record<string, unknown> ?? {}), menuLabel, showInSidebar: true },
          updatedAt: new Date(),
        }).where(eq(widgets.id, widgetId));

        return JSON.stringify({
          success: true,
          message: `Widget "${widget.title}" wurde als "${menuLabel}" im Dashboard-Menü veröffentlicht. Der Kunde sieht es jetzt in der Sidebar.`,
          widgetId,
          menuLabel,
        });
      }

      case 'list_widgets': {
        const result = await db
          .select({ id: widgets.id, title: widgets.title, status: widgets.status, description: widgets.description })
          .from(widgets)
          .where(eq(widgets.tenantId, tenantId));
        return JSON.stringify({ widgets: result, count: result.length });
      }

      default:
        return JSON.stringify({ error: `Tool "${toolName}" ist nicht implementiert.` });
    }
  } catch (err: any) {
    console.error(`[tool-executor] Error executing ${toolName}:`, err?.message);
    return JSON.stringify({ error: `Fehler bei ${toolName}: ${err?.message ?? 'Unbekannt'}` });
  }
}

/**
 * Get the tools available for a specific agent type.
 */
export function getToolsForAgent(agentType: string): typeof CRM_TOOLS {
  switch (agentType) {
    case 'finance':
      return [...CRM_TOOLS];
    case 'sekretariat':
      return [CRM_TOOLS[0]]; // only search_crm_contacts
    case 'marketing':
      return [CRM_TOOLS[0]]; // only search_crm_contacts
    case 'backoffice':
      return [CRM_TOOLS[0], CRM_TOOLS[3]]; // search + summary
    case 'builder':
      return [...WIDGET_TOOLS, CRM_TOOLS[3]]; // widget tools + crm summary
    case 'orchestrator':
      return [...ORCHESTRATOR_TOOLS, ...CRM_TOOLS]; // orchestrator + CRM access
    case 'support':
      return [CRM_TOOLS[3]]; // only summary
    default:
      return [];
  }
}
