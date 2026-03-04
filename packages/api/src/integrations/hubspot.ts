/**
 * HubSpot CRM Adapter — REST API v3
 *
 * Security:
 * - Read-only (GET requests only)
 * - Private App access token (never OAuth with user tokens)
 * - Credentials never logged or returned in errors
 */

import type {
  CRMAdapter,
  CRMContact,
  CRMDeal,
  CRMInvoice,
  CRMActivity,
  CRMSummary,
  HubSpotCredentials,
} from './types.js';

const BASE = 'https://api.hubapi.com';

export class HubSpotAdapter implements CRMAdapter {
  provider = 'hubspot' as const;
  private token: string;

  constructor(credentials: HubSpotCredentials) {
    this.token = credentials.accessToken;
  }

  private async get(path: string, params?: Record<string, string>): Promise<any> {
    const url = new URL(`${BASE}${path}`);
    if (params) {
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    }

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      // NEVER include token in error
      throw new Error(`HubSpot API error: ${res.status} ${res.statusText}`);
    }

    return res.json();
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.get('/crm/v3/objects/contacts', { limit: '1' });
      return true;
    } catch {
      return false;
    }
  }

  async getContacts(limit = 50, _search?: string): Promise<CRMContact[]> {
    // NOTE: HubSpot search requires POST, not GET — using list endpoint for now.
    // TODO: Implement POST-based search when needed.
    const data = await this.get('/crm/v3/objects/contacts', {
      limit: String(limit),
      properties: 'firstname,lastname,email,phone,company',
    });

    return (data.results ?? []).map((r: any) => ({
      externalId: r.id,
      name: `${r.properties?.firstname ?? ''} ${r.properties?.lastname ?? ''}`.trim() || 'Unbekannt',
      email: r.properties?.email || undefined,
      phone: r.properties?.phone || undefined,
      company: r.properties?.company || undefined,
    }));
  }

  async getDeals(limit = 50): Promise<CRMDeal[]> {
    const data = await this.get('/crm/v3/objects/deals', {
      limit: String(limit),
      properties: 'dealname,amount,dealstage,closedate',
    });

    return (data.results ?? []).map((r: any) => ({
      externalId: r.id,
      title: r.properties?.dealname ?? '',
      value: r.properties?.amount ? parseFloat(r.properties.amount) : 0,
      currency: 'EUR',
      stage: r.properties?.dealstage ?? 'unknown',
      expectedClose: r.properties?.closedate || undefined,
    }));
  }

  async getInvoices(_limit = 50, _status?: string): Promise<CRMInvoice[]> {
    // HubSpot has no native invoice object in CRM — use Commerce API or skip
    // Return empty for now — most HubSpot users handle invoices elsewhere
    return [];
  }

  async getActivities(_since?: Date, limit = 20): Promise<CRMActivity[]> {
    const data = await this.get('/crm/v3/objects/tasks', {
      limit: String(limit),
      properties: 'hs_task_subject,hs_task_body,hs_task_type,hs_timestamp',
    });

    return (data.results ?? []).map((r: any) => ({
      externalId: r.id,
      type: r.properties?.hs_task_type ?? 'task',
      description: r.properties?.hs_task_subject ?? '',
      date: r.properties?.hs_timestamp ?? new Date().toISOString(),
    }));
  }

  async getSummary(): Promise<CRMSummary> {
    const [contacts, deals] = await Promise.all([
      this.get('/crm/v3/objects/contacts', { limit: '0' }),
      this.get('/crm/v3/objects/deals', { limit: '100', properties: 'amount,dealstage' }),
    ]);

    const dealList = deals.results ?? [];
    const pipeline = dealList.reduce(
      (sum: number, d: any) => sum + (d.properties?.amount ? parseFloat(d.properties.amount) : 0),
      0,
    );

    return {
      totalContacts: contacts.total ?? 0,
      openDeals: dealList.length,
      revenuePipeline: pipeline,
      pipelineCurrency: 'EUR',
      overdueInvoices: 0,
      recentActivities: 0,
      lastSynced: new Date().toISOString(),
    };
  }
}
