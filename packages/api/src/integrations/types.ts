/**
 * CRM Integration Types — Unified Schema
 *
 * All CRM adapters normalize their data into these types.
 * Agents ONLY see this unified format, never raw CRM data.
 */

// ─── Supported Providers ─────────────────────────────────────────────────────
export type CRMProvider = 'odoo' | 'hubspot' | 'salesforce' | 'pipedrive' | 'custom';

// ─── Credential Schemas per Provider ─────────────────────────────────────────
export interface OdooCredentials {
  url: string;       // e.g. https://mycompany.odoo.com
  db: string;        // database name
  username: string;
  apiKey: string;    // NOT password — Odoo API key
}

export interface HubSpotCredentials {
  accessToken: string;  // Private app access token
}

export type CRMCredentials = OdooCredentials | HubSpotCredentials;

// ─── Unified CRM Data Types ─────────────────────────────────────────────────
export interface CRMContact {
  externalId: string;
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  tags?: string[];
  lastContact?: string;    // ISO date
}

export interface CRMDeal {
  externalId: string;
  title: string;
  value?: number;
  currency?: string;
  stage: string;
  contactName?: string;
  expectedClose?: string;  // ISO date
}

export interface CRMInvoice {
  externalId: string;
  number: string;
  amount: number;
  currency: string;
  status: 'draft' | 'open' | 'paid' | 'overdue' | 'cancelled';
  dueDate?: string;        // ISO date
  contactName?: string;
}

export interface CRMActivity {
  externalId: string;
  type: string;            // call, email, meeting, note, task
  description: string;
  contactName?: string;
  date: string;            // ISO date
}

export interface CRMEvent {
  externalId: string;
  name: string;
  dateBegin: string;       // ISO datetime
  dateEnd?: string;        // ISO datetime
  location?: string;
  description?: string;
  seats?: number;
  seatsAvailable?: number;
  state: 'draft' | 'confirm' | 'done' | 'cancel';
  organizerName?: string;
}

export interface CRMProduct {
  externalId: string;
  name: string;
  listPrice: number;
  currency: string;
  type: string;            // consu, service, product
  category?: string;
  active: boolean;
}

export interface CRMEmployee {
  externalId: string;
  name: string;
  jobTitle?: string;
  department?: string;
  email?: string;
  phone?: string;
}

export interface CRMSummary {
  totalContacts: number;
  openDeals: number;
  revenuePipeline: number;
  pipelineCurrency: string;
  overdueInvoices: number;
  recentActivities: number;
  lastSynced: string;      // ISO date
}

// ─── Adapter Interface ───────────────────────────────────────────────────────
export interface CRMAdapter {
  provider: CRMProvider;

  /** Test connection with stored credentials. Returns true if OK. */
  testConnection(): Promise<boolean>;

  /** Fetch contacts (read-only). */
  getContacts(limit?: number, search?: string): Promise<CRMContact[]>;

  /** Fetch deals/opportunities (read-only). */
  getDeals(limit?: number): Promise<CRMDeal[]>;

  /** Fetch invoices (read-only). */
  getInvoices(limit?: number, status?: string): Promise<CRMInvoice[]>;

  /** Fetch recent activities (read-only). */
  getActivities(since?: Date, limit?: number): Promise<CRMActivity[]>;

  /** Aggregated summary — this is what goes into the YAML. No PII. */
  getSummary(): Promise<CRMSummary>;

  /** Fetch events/veranstaltungen (read-only). */
  getEvents?(limit?: number): Promise<CRMEvent[]>;

  /** Fetch products/services (read-only). */
  getProducts?(limit?: number): Promise<CRMProduct[]>;

  /** Fetch employees (read-only). */
  getEmployees?(limit?: number): Promise<CRMEmployee[]>;
}

// ─── Adapter Factory Config ──────────────────────────────────────────────────
export interface AdapterConfig {
  provider: CRMProvider;
  baseUrl?: string;
  credentials: CRMCredentials;
}

// ─── Mail Integration Types ─────────────────────────────────────────────────

export interface MailCredentials {
  imapHost: string;       // e.g. imap.gmail.com
  imapPort: number;       // e.g. 993
  email: string;          // e.g. user@firma.at
  password: string;       // App-Passwort (NOT the real password)
  useTls?: boolean;       // default true
}

export interface MailMessage {
  id: string;             // IMAP UID as string
  from: string;
  to: string;
  subject: string;
  date: string;           // ISO date
  body: string;           // plain text body (or stripped HTML)
  snippet: string;        // first ~200 chars
  folder: string;         // e.g. INBOX, Sent
  read: boolean;
  hasAttachments: boolean;
}

export interface MailDraft {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  body: string;
  replyToMessageId?: string;
}

export interface MailAdapter {
  /** Test connection with stored credentials. Returns true if OK. */
  testConnection(): Promise<boolean>;

  /** Search emails by query string (IMAP SEARCH). */
  searchEmails(query: string, folder?: string, limit?: number): Promise<MailMessage[]>;

  /** Get a single email by UID. */
  getEmail(id: string, folder?: string): Promise<MailMessage | null>;

  /** Get recent emails (newest first). */
  getRecentEmails(limit?: number, folder?: string): Promise<MailMessage[]>;

  /** Save a draft email to the Drafts folder via IMAP APPEND. */
  draftEmail(draft: MailDraft): Promise<{ draftId: string }>;
}

// ─── Calendar Integration Types ─────────────────────────────────────────────

export interface CalendarCredentials {
  serverUrl: string;      // CalDAV server URL (e.g. https://apidata.googleusercontent.com/caldav/v2/)
  username: string;       // e.g. user@gmail.com
  password: string;       // App-Passwort
  authMethod: 'Basic' | 'Oauth';
  // OAuth fields (optional, only for Google etc.)
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  tokenUrl?: string;
}

export interface CalendarEvent {
  id: string;             // CalDAV UID or etag
  title: string;
  description?: string;
  location?: string;
  start: string;          // ISO datetime
  end: string;            // ISO datetime
  allDay: boolean;
  organizer?: string;
  attendees?: string[];   // email addresses
  status: 'confirmed' | 'tentative' | 'cancelled';
  calendarName?: string;
}

export interface CalendarEventInput {
  title: string;
  description?: string;
  location?: string;
  start: string;          // ISO datetime
  end: string;            // ISO datetime
  allDay?: boolean;
  attendees?: string[];   // email addresses
}

export interface CalendarAdapter {
  /** Test connection with stored credentials. Returns true if OK. */
  testConnection(): Promise<boolean>;

  /** List available calendars. */
  listCalendars(): Promise<Array<{ id: string; name: string; color?: string }>>;

  /** Get events in a date range. */
  getEvents(from: string, to: string, calendarId?: string): Promise<CalendarEvent[]>;

  /** Get upcoming events (next N days). */
  getUpcomingEvents(days?: number, calendarId?: string): Promise<CalendarEvent[]>;

  /** Create a new calendar event. */
  createEvent(event: CalendarEventInput, calendarId?: string): Promise<{ eventId: string }>;
}
