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
import { integrations, widgets, agentConversations, tokenUsage } from '../db/schema.js';
import { eq, and, desc, ne } from 'drizzle-orm';
import { createAdapter, createMailAdapter, createCalendarAdapter } from '../integrations/registry.js';
import type { CRMAdapter, MailAdapter, CalendarAdapter } from '../integrations/types.js';
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
  {
    type: 'function',
    function: {
      name: 'get_events',
      description: 'Veranstaltungen/Events aus Odoo abrufen. Zeigt Name, Datum, Ort, verfügbare Plätze.',
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
      name: 'get_products',
      description: 'Produkte/Dienstleistungen aus Odoo abrufen. Zeigt Name, Preis, Kategorie.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Max. Anzahl Ergebnisse (default 30)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_employees',
      description: 'Mitarbeiter aus Odoo abrufen. Zeigt Name, Position, Abteilung, Kontakt.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Max. Anzahl Ergebnisse (default 50)' },
        },
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
      name: 'generate_widget',
      description: 'Generiere ein neues Widget basierend auf einer Beschreibung. Das Widget wird als ENTWURF gespeichert und dem Kunden als Vorschau gezeigt. Der Kunde muss es erst bestätigen bevor es veröffentlicht wird.',
      parameters: {
        type: 'object',
        properties: {
          description: { type: 'string', description: 'Detaillierte Beschreibung des gewünschten Widgets' },
          widget_id: { type: 'string', description: 'Optional: ID eines bestehenden Widgets zum Überarbeiten' },
        },
        required: ['description'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'publish_widget_to_menu',
      description: 'Ein BEREITS GENERIERTES Widget (status=draft) als Menüpunkt im Dashboard veröffentlichen. NUR nutzen wenn der Kunde das Widget in der Vorschau gesehen und bestätigt hat!',
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
 * Mail tools for agents that need email access.
 * search_emails + read_email = read-only (for Lena, Tom)
 * draft_email = write (only for Marie)
 */
export const MAIL_TOOLS: Array<{
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
      name: 'search_emails',
      description: 'E-Mails im Postfach durchsuchen. Sucht in Betreff, Absender, Empfänger und Inhalt.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Suchbegriff (Name, Betreff, Schlüsselwort)' },
          folder: { type: 'string', description: 'Mail-Ordner (default: INBOX). Optionen: INBOX, Sent, Drafts, etc.' },
          limit: { type: 'number', description: 'Max. Anzahl Ergebnisse (default 10)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_email',
      description: 'Eine einzelne E-Mail vollständig lesen (inkl. Body). Nutze die ID aus search_emails.',
      parameters: {
        type: 'object',
        properties: {
          email_id: { type: 'string', description: 'UID der E-Mail (aus search_emails Ergebnis)' },
          folder: { type: 'string', description: 'Mail-Ordner (default: INBOX)' },
        },
        required: ['email_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'draft_email',
      description: 'E-Mail-Entwurf erstellen und im Entwürfe-Ordner speichern. Der Kunde sendet die Mail dann selbst aus seiner Mail-App (Mac Mail, Outlook, etc.). IMMER zuerst den Entwurf im Chat zeigen und fragen ob er passt!',
      parameters: {
        type: 'object',
        properties: {
          to: { type: 'string', description: 'Empfänger E-Mail-Adresse(n), kommasepariert' },
          subject: { type: 'string', description: 'Betreff der E-Mail' },
          body: { type: 'string', description: 'Inhalt der E-Mail (plain text)' },
          cc: { type: 'string', description: 'CC-Empfänger (optional)' },
          reply_to_message_id: { type: 'string', description: 'Message-ID der Original-Mail wenn es eine Antwort ist (optional)' },
        },
        required: ['to', 'subject', 'body'],
      },
    },
  },
];

/**
 * Calendar tools for agents that need calendar access.
 * list_calendars + get_calendar_events = read-only
 * create_calendar_event = write (Marie, Tom)
 */
export const CALENDAR_TOOLS: Array<{
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
      name: 'get_calendar_events',
      description: 'Kommende Termine aus dem Kalender abrufen. Zeigt Termine der nächsten N Tage.',
      parameters: {
        type: 'object',
        properties: {
          days: { type: 'number', description: 'Anzahl Tage in die Zukunft (default 7)' },
          calendar_id: { type: 'string', description: 'Kalender-ID (optional, default: Hauptkalender)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_calendar_events',
      description: 'Termine in einem bestimmten Zeitraum suchen.',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'Startdatum (ISO-Format, z.B. 2026-03-10)' },
          to: { type: 'string', description: 'Enddatum (ISO-Format, z.B. 2026-03-17)' },
          calendar_id: { type: 'string', description: 'Kalender-ID (optional)' },
        },
        required: ['from', 'to'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_calendar_event',
      description: 'Neuen Termin im Kalender erstellen. IMMER zuerst die Details im Chat zeigen und bestätigen lassen!',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Titel/Betreff des Termins' },
          start: { type: 'string', description: 'Startzeit (ISO-Format, z.B. 2026-03-10T14:00:00)' },
          end: { type: 'string', description: 'Endzeit (ISO-Format, z.B. 2026-03-10T15:00:00)' },
          description: { type: 'string', description: 'Beschreibung/Notizen (optional)' },
          location: { type: 'string', description: 'Ort (optional)' },
          all_day: { type: 'boolean', description: 'Ganztägig? (default false)' },
          attendees: { type: 'string', description: 'Teilnehmer E-Mail-Adressen, kommasepariert (optional)' },
        },
        required: ['title', 'start', 'end'],
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
    .where(and(
      eq(integrations.tenantId, tenantId),
      eq(integrations.status, 'active'),
      ne(integrations.provider, 'email'),
    ))
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
 * Get the Mail adapter for a tenant (if they have an active email integration).
 */
async function getMailAdapter(tenantId: string): Promise<MailAdapter | null> {
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

  try {
    return createMailAdapter({
      encrypted: intg.credentialsEncrypted,
      iv: intg.credentialsIv,
      tag: intg.credentialsTag,
    } as any);
  } catch (err: any) {
    console.error('[tool-executor] Failed to create Mail adapter:', err?.message);
    return null;
  }
}

/**
 * Get the Calendar adapter for a tenant (if they have an active calendar integration).
 */
async function getCalendarAdapter(tenantId: string): Promise<CalendarAdapter | null> {
  const [intg] = await db
    .select()
    .from(integrations)
    .where(
      and(
        eq(integrations.tenantId, tenantId),
        eq(integrations.provider, 'calendar'),
        eq(integrations.status, 'active'),
      ),
    )
    .limit(1);

  if (!intg) return null;

  try {
    return createCalendarAdapter({
      encrypted: intg.credentialsEncrypted,
      iv: intg.credentialsIv,
      tag: intg.credentialsTag,
    } as any);
  } catch (err: any) {
    console.error('[tool-executor] Failed to create Calendar adapter:', err?.message);
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

      case 'get_events': {
        const adapter = await getCrmAdapter(tenantId);
        if (!adapter) return JSON.stringify({ error: 'Keine CRM-Integration verbunden.' });
        if (!adapter.getEvents) return JSON.stringify({ error: 'Event-Modul nicht verfügbar für diesen CRM-Anbieter.' });
        const events = await adapter.getEvents((args.limit as number) ?? 20);
        return JSON.stringify({ events, count: events.length });
      }

      case 'get_products': {
        const adapter = await getCrmAdapter(tenantId);
        if (!adapter) return JSON.stringify({ error: 'Keine CRM-Integration verbunden.' });
        if (!adapter.getProducts) return JSON.stringify({ error: 'Produkt-Modul nicht verfügbar für diesen CRM-Anbieter.' });
        const products = await adapter.getProducts((args.limit as number) ?? 30);
        return JSON.stringify({ products, count: products.length });
      }

      case 'get_employees': {
        const adapter = await getCrmAdapter(tenantId);
        if (!adapter) return JSON.stringify({ error: 'Keine CRM-Integration verbunden.' });
        if (!adapter.getEmployees) return JSON.stringify({ error: 'Mitarbeiter-Modul nicht verfügbar für diesen CRM-Anbieter.' });
        const employees = await adapter.getEmployees((args.limit as number) ?? 50);
        return JSON.stringify({ employees, count: employees.length });
      }

      case 'generate_widget': {
        const description = args.description as string;
        if (!description) {
          return JSON.stringify({ error: 'description ist erforderlich.' });
        }
        const existingWidgetId = args.widget_id as string | undefined;
        let existingCode: string | undefined;
        let existingVersion = 1;
        if (existingWidgetId) {
          const [existing] = await db
            .select({ code: widgets.code, version: widgets.version })
            .from(widgets)
            .where(and(eq(widgets.id, existingWidgetId), eq(widgets.tenantId, tenantId)))
            .limit(1);
          existingCode = existing?.code;
          existingVersion = existing?.version ?? 1;
        }
        const { generateWidget } = await import('./widget-generator.js');
        const result = await generateWidget(description, existingCode);
        let widgetId: string;
        if (existingWidgetId && existingCode) {
          await db.update(widgets).set({
            code: result.code,
            description,
            title: result.title,
            version: existingVersion + 1,
            status: 'draft',
            updatedAt: new Date(),
          }).where(eq(widgets.id, existingWidgetId));
          widgetId = existingWidgetId;
        } else {
          const [newWidget] = await db.insert(widgets).values({
            tenantId,
            title: result.title,
            description,
            code: result.code,
            status: 'draft',
          }).returning();
          widgetId = newWidget.id;
        }
        // Track tokens
        await db.insert(tokenUsage).values({
          tenantId,
          agentType: 'builder',
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          model: 'gpt-4o-mini',
        });
        console.log(`[generate_widget] Widget "${result.title}" (${widgetId}) als Entwurf gespeichert`);
        return JSON.stringify({
          success: true,
          widgetId,
          title: result.title,
          status: 'draft',
          message: `Widget "${result.title}" wurde als Entwurf generiert. Der Kunde kann es in der Vorschau sehen. Sage dem Kunden er soll sich die Vorschau anschauen und wenn es passt, sagst du "veröffentlichen".`,
        });
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

        // Sync YAML after widget publish
        try {
          const { syncTenantYAML } = await import('../lib/tenant-yaml.js');
          await syncTenantYAML(tenantId);
        } catch (e: any) {
          console.error('[publish_widget] YAML sync failed:', e?.message);
        }

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

      // ─── Mail Tools ──────────────────────────────────────────────────────

      case 'search_emails': {
        const mailAdapter = await getMailAdapter(tenantId);
        if (!mailAdapter) return JSON.stringify({ error: 'Keine E-Mail-Integration verbunden. Bitte zuerst unter "Integrationen" ein E-Mail-Postfach anbinden.' });
        const query = args.query as string;
        if (!query) return JSON.stringify({ error: 'query ist erforderlich.' });
        const folder = (args.folder as string) ?? 'INBOX';
        const limit = (args.limit as number) ?? 10;
        const emails = await mailAdapter.searchEmails(query, folder, limit);
        return JSON.stringify({ emails, count: emails.length, folder });
      }

      case 'read_email': {
        const mailAdapter = await getMailAdapter(tenantId);
        if (!mailAdapter) return JSON.stringify({ error: 'Keine E-Mail-Integration verbunden.' });
        const emailId = args.email_id as string;
        if (!emailId) return JSON.stringify({ error: 'email_id ist erforderlich.' });
        const folder = (args.folder as string) ?? 'INBOX';
        const email = await mailAdapter.getEmail(emailId, folder);
        if (!email) return JSON.stringify({ error: `E-Mail mit ID ${emailId} nicht gefunden.` });
        return JSON.stringify(email);
      }

      case 'draft_email': {
        const mailAdapter = await getMailAdapter(tenantId);
        if (!mailAdapter) return JSON.stringify({ error: 'Keine E-Mail-Integration verbunden.' });
        const to = args.to as string;
        const subject = args.subject as string;
        const body = args.body as string;
        if (!to || !subject || !body) return JSON.stringify({ error: 'to, subject und body sind erforderlich.' });
        const result = await mailAdapter.draftEmail({
          to,
          subject,
          body,
          cc: (args.cc as string) || undefined,
          replyToMessageId: (args.reply_to_message_id as string) || undefined,
        });
        console.log(`[draft_email] Entwurf gespeichert: "${subject}" an ${to}`);
        return JSON.stringify({
          success: true,
          draftId: result.draftId,
          message: `E-Mail-Entwurf "${subject}" an ${to} wurde im Entwürfe-Ordner gespeichert. Der Kunde kann die Mail jetzt aus seiner Mail-App (Mac Mail, Outlook, etc.) senden.`,
        });
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
      return [...MAIL_TOOLS, CRM_TOOLS[0]]; // all mail tools + search_crm_contacts
    case 'marketing':
      return [CRM_TOOLS[0]]; // only search_crm_contacts
    case 'backoffice':
      return [MAIL_TOOLS[0], MAIL_TOOLS[1], CRM_TOOLS[0], CRM_TOOLS[3]]; // search + read emails + search contacts + summary
    case 'builder':
      return [...WIDGET_TOOLS, CRM_TOOLS[3], CRM_TOOLS[4], CRM_TOOLS[5], CRM_TOOLS[6]]; // widget tools + summary + events + products + employees
    case 'orchestrator':
      return [...ORCHESTRATOR_TOOLS, ...CRM_TOOLS, MAIL_TOOLS[0], MAIL_TOOLS[1]]; // orchestrator + CRM + read-only mail
    case 'support':
      return [CRM_TOOLS[3]]; // only summary
    default:
      return [];
  }
}
