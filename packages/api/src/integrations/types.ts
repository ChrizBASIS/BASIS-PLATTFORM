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
}

// ─── Adapter Factory Config ──────────────────────────────────────────────────
export interface AdapterConfig {
  provider: CRMProvider;
  baseUrl?: string;
  credentials: CRMCredentials;
}
