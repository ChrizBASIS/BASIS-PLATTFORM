/**
 * Odoo CRM Adapter — XML-RPC via /jsonrpc endpoint
 *
 * Security:
 * - Read-only by default (search_read only)
 * - Credentials never logged or returned in errors
 * - No raw customer data persisted
 * - API key auth (not session) — works with Odoo SaaS
 */

import type {
  CRMAdapter,
  CRMContact,
  CRMDeal,
  CRMInvoice,
  CRMActivity,
  CRMSummary,
  CRMEvent,
  CRMProduct,
  CRMEmployee,
  OdooCredentials,
} from './types.js';

export class OdooAdapter implements CRMAdapter {
  provider = 'odoo' as const;
  private url: string;
  private db: string;
  private uid: number | null = null;
  private username: string;
  private apiKey: string;

  constructor(credentials: OdooCredentials) {
    this.url = credentials.url.replace(/\/$/, '');
    this.db = credentials.db;
    this.username = credentials.username;
    this.apiKey = credentials.apiKey;
  }

  // ─── JSON-RPC Helper (XML-RPC services via /jsonrpc endpoint) ─────────────
  private async jsonrpc(service: string, method: string, args: unknown[], retries = 2): Promise<any> {
    const res = await fetch(`${this.url}/jsonrpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'call',
        id: Date.now(),
        params: { service, method, args },
      }),
      signal: AbortSignal.timeout(15_000),
    });

    // Retry on 429 rate limit
    if (res.status === 429 && retries > 0) {
      const wait = Math.min(2000 * (3 - retries), 5000);
      console.warn(`[OdooAdapter] 429 rate limit — retrying in ${wait}ms`);
      await new Promise((r) => setTimeout(r, wait));
      return this.jsonrpc(service, method, args, retries - 1);
    }

    if (!res.ok) {
      throw new Error(`Odoo API error: ${res.status}`);
    }

    const data = await res.json();
    if (data.error) {
      const errData = data.error.data;
      console.error('[OdooAdapter] RPC error detail:', {
        message: data.error.message,
        code: errData?.name ?? errData?.exception_type,
        debug: errData?.debug?.slice(0, 200),
      });
      throw new Error(`Odoo RPC error: ${data.error.message ?? 'Unknown'}`);
    }

    return data.result;
  }

  // ─── Authentication (XML-RPC — works with API keys on Odoo SaaS) ──────────
  private async authenticate(): Promise<number> {
    if (this.uid) return this.uid;

    const uid = await this.jsonrpc('common', 'authenticate', [
      this.db, this.username, this.apiKey, {},
    ]);

    if (!uid || uid === false) {
      throw new Error('Odoo authentication failed — check credentials');
    }

    this.uid = uid as number;
    return this.uid;
  }

  // ─── Search/Read Helper (read-only, XML-RPC execute_kw) ────────────────────
  private async searchRead(
    model: string,
    domain: unknown[] = [],
    fields: string[] = [],
    limit = 50,
    order = 'id desc',
  ): Promise<any[]> {
    const uid = await this.authenticate();

    return this.jsonrpc('object', 'execute_kw', [
      this.db, uid, this.apiKey,
      model, 'search_read',
      [domain],
      { fields, limit, order },
    ]) ?? [];
  }

  // ─── CRMAdapter Interface ──────────────────────────────────────────────────

  async testConnection(): Promise<boolean> {
    try {
      await this.authenticate();
      return true;
    } catch (err: any) {
      console.error('[OdooAdapter] testConnection failed:', err?.message);
      return false;
    }
  }

  async getContacts(limit = 50, search?: string): Promise<CRMContact[]> {
    const domain: unknown[] = [['customer_rank', '>', 0]];
    if (search) {
      domain.push(['name', 'ilike', `%${search}%`]);
    }

    const records = await this.searchRead(
      'res.partner',
      domain,
      ['name', 'email', 'phone', 'company_name', 'category_id', 'write_date'],
      limit,
    );

    return records.map((r: any) => ({
      externalId: String(r.id),
      name: r.name ?? '',
      email: r.email || undefined,
      phone: r.phone || undefined,
      company: r.company_name || undefined,
      tags: r.category_id?.map?.((t: any) => String(t)) ?? [],
      lastContact: r.write_date || undefined,
    }));
  }

  async getDeals(limit = 50): Promise<CRMDeal[]> {
    const records = await this.searchRead(
      'crm.lead',
      [['type', '=', 'opportunity']],
      ['name', 'expected_revenue', 'stage_id', 'partner_id', 'date_deadline'],
      limit,
    );

    return records.map((r: any) => ({
      externalId: String(r.id),
      title: r.name ?? '',
      value: r.expected_revenue ?? 0,
      currency: 'EUR',
      stage: r.stage_id?.[1] ?? 'Unknown',
      contactName: r.partner_id?.[1] || undefined,
      expectedClose: r.date_deadline || undefined,
    }));
  }

  async getInvoices(limit = 50, status?: string): Promise<CRMInvoice[]> {
    const domain: unknown[] = [['move_type', '=', 'out_invoice']];
    if (status === 'overdue') {
      domain.push(['payment_state', '!=', 'paid']);
      domain.push(['invoice_date_due', '<', new Date().toISOString().split('T')[0]]);
    } else if (status === 'open') {
      domain.push(['payment_state', '!=', 'paid']);
    }

    const records = await this.searchRead(
      'account.move',
      domain,
      ['name', 'amount_total', 'currency_id', 'payment_state', 'invoice_date_due', 'partner_id'],
      limit,
    );

    return records.map((r: any) => {
      const now = new Date();
      const due = r.invoice_date_due ? new Date(r.invoice_date_due) : null;
      const isOverdue = due && due < now && r.payment_state !== 'paid';

      return {
        externalId: String(r.id),
        number: r.name ?? '',
        amount: r.amount_total ?? 0,
        currency: r.currency_id?.[1] ?? 'EUR',
        status: r.payment_state === 'paid' ? 'paid'
          : isOverdue ? 'overdue'
          : r.payment_state === 'not_paid' ? 'open'
          : 'draft',
        dueDate: r.invoice_date_due || undefined,
        contactName: r.partner_id?.[1] || undefined,
      };
    });
  }

  async getActivities(since?: Date, limit = 20): Promise<CRMActivity[]> {
    const domain: unknown[] = [];
    if (since) {
      domain.push(['date_deadline', '>=', since.toISOString().split('T')[0]]);
    }

    const records = await this.searchRead(
      'mail.activity',
      domain,
      ['activity_type_id', 'summary', 'res_name', 'date_deadline'],
      limit,
      'date_deadline desc',
    );

    return records.map((r: any) => ({
      externalId: String(r.id),
      type: r.activity_type_id?.[1] ?? 'task',
      description: r.summary ?? '',
      contactName: r.res_name || undefined,
      date: r.date_deadline ?? new Date().toISOString().split('T')[0],
    }));
  }

  async getSummary(): Promise<CRMSummary> {
    // Sequential to avoid Odoo SaaS 429 rate limit
    const contacts = await this.searchRead('res.partner', [['customer_rank', '>', 0]], ['id'], 1000);
    const deals = await this.searchRead('crm.lead', [['type', '=', 'opportunity'], ['active', '=', true]], ['expected_revenue'], 500);
    const invoices = await this.searchRead('account.move', [
      ['move_type', '=', 'out_invoice'],
      ['payment_state', '!=', 'paid'],
      ['invoice_date_due', '<', new Date().toISOString().split('T')[0]],
    ], ['id'], 500);
    const activities = await this.searchRead('mail.activity', [], ['id'], 100);

    const pipeline = deals.reduce((sum: number, d: any) => sum + (d.expected_revenue ?? 0), 0);

    return {
      totalContacts: contacts.length,
      openDeals: deals.length,
      revenuePipeline: pipeline,
      pipelineCurrency: 'EUR',
      overdueInvoices: invoices.length,
      recentActivities: activities.length,
      lastSynced: new Date().toISOString(),
    };
  }

  async getEvents(limit = 20): Promise<CRMEvent[]> {
    const records = await this.searchRead(
      'event.event',
      [],
      ['name', 'date_begin', 'date_end', 'address_id', 'note', 'seats_max', 'seats_available', 'stage_id', 'organizer_id'],
      limit,
      'date_begin asc',
    );

    return records.map((r: any) => ({
      externalId: String(r.id),
      name: r.name ?? '',
      dateBegin: r.date_begin ?? '',
      dateEnd: r.date_end || undefined,
      location: r.address_id?.[1] || undefined,
      description: r.note ? String(r.note).replace(/<[^>]*>/g, '').substring(0, 200) : undefined,
      seats: r.seats_max ?? undefined,
      seatsAvailable: r.seats_available ?? undefined,
      state: r.stage_id?.[1]?.toLowerCase()?.includes('done') ? 'done'
        : r.stage_id?.[1]?.toLowerCase()?.includes('cancel') ? 'cancel'
        : 'confirm',
      organizerName: r.organizer_id?.[1] || undefined,
    }));
  }

  async getProducts(limit = 30): Promise<CRMProduct[]> {
    const records = await this.searchRead(
      'product.template',
      [['sale_ok', '=', true]],
      ['name', 'list_price', 'type', 'categ_id', 'active'],
      limit,
      'name asc',
    );

    return records.map((r: any) => ({
      externalId: String(r.id),
      name: r.name ?? '',
      listPrice: r.list_price ?? 0,
      currency: 'EUR',
      type: r.type ?? 'consu',
      category: r.categ_id?.[1] || undefined,
      active: r.active ?? true,
    }));
  }

  async getEmployees(limit = 50): Promise<CRMEmployee[]> {
    const records = await this.searchRead(
      'hr.employee',
      [],
      ['name', 'job_title', 'department_id', 'work_email', 'work_phone'],
      limit,
      'name asc',
    );

    return records.map((r: any) => ({
      externalId: String(r.id),
      name: r.name ?? '',
      jobTitle: r.job_title || undefined,
      department: r.department_id?.[1] || undefined,
      email: r.work_email || undefined,
      phone: r.work_phone || undefined,
    }));
  }
}
