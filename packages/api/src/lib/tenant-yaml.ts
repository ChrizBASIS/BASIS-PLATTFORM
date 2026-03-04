/**
 * Tenant YAML Profile Generator
 *
 * Erstellt und aktualisiert ein YAML-Profil pro Kunde.
 * Dieses Profil ist die "Single Source of Truth" für alle Agenten.
 *
 * Das YAML wird automatisch aktualisiert bei:
 * - Onboarding abgeschlossen
 * - Task-Status ändert sich
 * - Agent lernt etwas Neues (Memory-Update)
 * - Support-Session
 * - Konfig-Änderungen
 *
 * Format: tenant-{slug}.yaml im agent_memory als Schlüssel 'tenant_profile_yaml'
 */

import { db } from '../db/index.js';
import {
  tenants,
  users,
  tenantMembers,
  roles,
  onboardingProfiles,
  onboardingTasks,
  agentConfig,
  agentMemory,
  tokenUsage,
  projects,
  integrations,
} from '../db/schema.js';
import { eq, and, isNull, sql, gte } from 'drizzle-orm';

const AGENT_NAMES: Record<string, string> = {
  lena: 'Lena (Orchestrator)',
  marie: 'Marie (Sekretariat)',
  tom: 'Tom (Backoffice)',
  clara: 'Clara (Finance)',
  marco: 'Marco (Marketing)',
  alex: 'Alex (Support)',
  nico: 'Nico (Builder)',
};

interface TenantYAML {
  meta: {
    tenant_id: string;
    name: string;
    slug: string;
    plan: string;
    created: string;
    last_updated: string;
    version: number;
  };
  business: {
    industry: string;
    company_size: string;
    description: string;
  };
  team: Array<{
    name: string;
    email: string;
    role: string;
    joined: string;
  }>;
  workflows: Array<{
    category: string;
    name: string;
  }>;
  tasks: Array<{
    id: string;
    title: string;
    description: string | null;
    category: string;
    assigned_agent: string;
    current_process: string | null;
    priority: string;
    status: string;
  }>;
  agents: {
    enabled: string[];
    disabled: string[];
    task_summary: Record<string, {
      count: number;
      tasks: string[];
    }>;
  };
  token_usage: {
    current_month: number;
    limit: number;
    percentage: number;
  };
  projects: Array<{
    name: string;
    subdomain: string;
    status: string;
    template: string;
  }>;
  integrations: Array<{
    provider: string;
    label: string;
    status: string;
    last_synced: string | null;
  }>;
  crm_summary: Record<string, unknown> | null;
  context: Record<string, unknown>;
}

/**
 * Generiert das komplette YAML-Profil für einen Tenant.
 */
export async function generateTenantProfile(tenantId: string): Promise<TenantYAML> {
  // 1. Tenant-Daten
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!tenant) throw new Error(`Tenant ${tenantId} nicht gefunden`);

  // 2. Team-Mitglieder
  const members = await db
    .select({
      name: users.name,
      email: users.email,
      role: roles.name,
      joined: tenantMembers.joinedAt,
    })
    .from(tenantMembers)
    .innerJoin(users, eq(tenantMembers.userId, users.id))
    .innerJoin(roles, eq(tenantMembers.roleId, roles.id))
    .where(and(eq(tenantMembers.tenantId, tenantId), isNull(tenantMembers.removedAt)));

  // 3. Onboarding-Profil
  const [profile] = await db
    .select()
    .from(onboardingProfiles)
    .where(eq(onboardingProfiles.tenantId, tenantId))
    .limit(1);

  // 4. Tasks
  const tasks = profile
    ? await db
        .select()
        .from(onboardingTasks)
        .where(eq(onboardingTasks.profileId, profile.id))
        .orderBy(onboardingTasks.assignedAgent)
    : [];

  // 5. Agent-Config
  const configs = await db
    .select()
    .from(agentConfig)
    .where(eq(agentConfig.tenantId, tenantId));

  const enabled = configs.filter((c) => c.enabled).map((c) => c.agentType);
  const disabled = configs.filter((c) => !c.enabled).map((c) => c.agentType);
  // Default: alle enabled wenn keine Config
  const allAgents = ['orchestrator', 'sekretariat', 'backoffice', 'finance', 'marketing', 'support', 'builder'];
  const effectiveEnabled = enabled.length > 0 ? enabled : allAgents;

  // 6. Token-Usage diesen Monat
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const [usage] = await db
    .select({
      total: sql<number>`COALESCE(SUM(${tokenUsage.inputTokens}) + SUM(${tokenUsage.outputTokens}), 0)`,
    })
    .from(tokenUsage)
    .where(and(eq(tokenUsage.tenantId, tenantId), gte(tokenUsage.createdAt, monthStart)));

  const PLAN_LIMITS: Record<string, number> = { starter: 10_000, pro: 50_000, enterprise: 200_000 };
  const limit = PLAN_LIMITS[tenant.plan] ?? 50_000;
  const totalTokens = Number(usage?.total ?? 0);

  // 7. Projects
  const tenantProjects = await db
    .select()
    .from(projects)
    .where(eq(projects.tenantId, tenantId));

  // 8. Integrations (CRM)
  const tenantIntegrations = await db
    .select({
      provider: integrations.provider,
      label: integrations.label,
      status: integrations.status,
      lastSyncedAt: integrations.lastSyncedAt,
    })
    .from(integrations)
    .where(eq(integrations.tenantId, tenantId));

  // 9. Agent-Memory / zusätzlicher Kontext
  const contextMems = await db
    .select()
    .from(agentMemory)
    .where(eq(agentMemory.tenantId, tenantId));

  const context: Record<string, unknown> = {};
  for (const mem of contextMems) {
    if (!mem.key.startsWith('onboarding_tasks_') && mem.key !== 'tenant_profile_yaml') {
      context[mem.key] = mem.value;
    }
  }

  // Task-Summary pro Agent
  const taskSummary: Record<string, { count: number; tasks: string[] }> = {};
  for (const t of tasks) {
    const agentLabel = AGENT_NAMES[t.assignedAgent] ?? t.assignedAgent;
    if (!taskSummary[agentLabel]) taskSummary[agentLabel] = { count: 0, tasks: [] };
    taskSummary[agentLabel].count++;
    taskSummary[agentLabel].tasks.push(t.title);
  }

  // Version hochzählen
  const existingYaml = contextMems.find((m) => m.key === 'tenant_profile_yaml');
  const prevVersion = (existingYaml?.value as any)?.meta?.version ?? 0;

  return {
    meta: {
      tenant_id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      plan: tenant.plan,
      created: tenant.createdAt.toISOString(),
      last_updated: new Date().toISOString(),
      version: prevVersion + 1,
    },
    business: {
      industry: profile?.industry ?? 'unbekannt',
      company_size: profile?.companySize ?? 'unbekannt',
      description: profile?.businessDescription ?? '',
    },
    team: members.map((m) => ({
      name: m.name,
      email: m.email,
      role: m.role,
      joined: m.joined.toISOString(),
    })),
    workflows: (profile?.workflows as any[])?.map((w) => ({
      category: w.category ?? w.name,
      name: w.name ?? w.category,
    })) ?? [],
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      category: t.category,
      assigned_agent: AGENT_NAMES[t.assignedAgent] ?? t.assignedAgent,
      current_process: t.currentProcess,
      priority: t.priority,
      status: t.status,
    })),
    agents: {
      enabled: effectiveEnabled.map((a) => AGENT_NAMES[a] ?? a),
      disabled: disabled.map((a) => AGENT_NAMES[a] ?? a),
      task_summary: taskSummary,
    },
    token_usage: {
      current_month: totalTokens,
      limit,
      percentage: limit > 0 ? Math.round((totalTokens / limit) * 100) : 0,
    },
    projects: tenantProjects.map((p) => ({
      name: p.name,
      subdomain: p.subdomain,
      status: p.status,
      template: p.template,
    })),
    integrations: tenantIntegrations.map((i) => ({
      provider: i.provider,
      label: i.label ?? i.provider,
      status: i.status,
      last_synced: i.lastSyncedAt?.toISOString() ?? null,
    })),
    crm_summary: (context['crm_summary'] as Record<string, unknown>) ?? null,
    context,
  };
}

/**
 * Serialisiert das Profil als YAML-String.
 */
export function toYAMLString(profile: TenantYAML): string {
  const lines: string[] = [];

  lines.push('# ═══════════════════════════════════════════════════════════');
  lines.push(`# BASIS Kundenprofil: ${profile.meta.name}`);
  lines.push(`# Zuletzt aktualisiert: ${profile.meta.last_updated}`);
  lines.push(`# Version: ${profile.meta.version}`);
  lines.push('# ═══════════════════════════════════════════════════════════');
  lines.push('');

  lines.push('meta:');
  lines.push(`  tenant_id: "${profile.meta.tenant_id}"`);
  lines.push(`  name: "${profile.meta.name}"`);
  lines.push(`  slug: "${profile.meta.slug}"`);
  lines.push(`  plan: ${profile.meta.plan}`);
  lines.push(`  created: "${profile.meta.created}"`);
  lines.push(`  last_updated: "${profile.meta.last_updated}"`);
  lines.push(`  version: ${profile.meta.version}`);
  lines.push('');

  lines.push('business:');
  lines.push(`  industry: "${profile.business.industry}"`);
  lines.push(`  company_size: "${profile.business.company_size}"`);
  lines.push(`  description: "${esc(profile.business.description)}"`);
  lines.push('');

  lines.push('team:');
  if (profile.team.length === 0) {
    lines.push('  []');
  } else {
    for (const m of profile.team) {
      lines.push(`  - name: "${m.name}"`);
      lines.push(`    email: "${m.email}"`);
      lines.push(`    role: "${m.role}"`);
      lines.push(`    joined: "${m.joined}"`);
    }
  }
  lines.push('');

  lines.push('tasks:');
  if (profile.tasks.length === 0) {
    lines.push('  []');
  } else {
    for (const t of profile.tasks) {
      lines.push(`  - id: "${t.id}"`);
      lines.push(`    title: "${esc(t.title)}"`);
      lines.push(`    category: "${t.category}"`);
      lines.push(`    assigned_agent: "${t.assigned_agent}"`);
      lines.push(`    priority: ${t.priority}`);
      lines.push(`    status: ${t.status}`);
      if (t.description) lines.push(`    description: "${esc(t.description)}"`);
      if (t.current_process) lines.push(`    current_process: "${esc(t.current_process)}"`);
    }
  }
  lines.push('');

  lines.push('agents:');
  lines.push('  enabled:');
  for (const a of profile.agents.enabled) lines.push(`    - "${a}"`);
  if (profile.agents.disabled.length > 0) {
    lines.push('  disabled:');
    for (const a of profile.agents.disabled) lines.push(`    - "${a}"`);
  }
  lines.push('  task_summary:');
  for (const [agent, info] of Object.entries(profile.agents.task_summary)) {
    lines.push(`    "${agent}":`);
    lines.push(`      count: ${info.count}`);
    lines.push(`      tasks:`);
    for (const task of info.tasks) lines.push(`        - "${esc(task)}"`);
  }
  lines.push('');

  lines.push('token_usage:');
  lines.push(`  current_month: ${profile.token_usage.current_month}`);
  lines.push(`  limit: ${profile.token_usage.limit}`);
  lines.push(`  percentage: ${profile.token_usage.percentage}`);
  lines.push('');

  lines.push('projects:');
  if (profile.projects.length === 0) {
    lines.push('  []');
  } else {
    for (const p of profile.projects) {
      lines.push(`  - name: "${esc(p.name)}"`);
      lines.push(`    subdomain: "${p.subdomain}"`);
      lines.push(`    status: ${p.status}`);
      lines.push(`    template: ${p.template}`);
    }
  }
  lines.push('');

  lines.push('integrations:');
  if (profile.integrations.length === 0) {
    lines.push('  []');
  } else {
    for (const i of profile.integrations) {
      lines.push(`  - provider: ${i.provider}`);
      lines.push(`    label: "${esc(i.label)}"`);
      lines.push(`    status: ${i.status}`);
      lines.push(`    last_synced: ${i.last_synced ? `"${i.last_synced}"` : 'null'}`);
    }
  }
  lines.push('');

  if (profile.crm_summary) {
    lines.push('crm_summary:');
    for (const [k, v] of Object.entries(profile.crm_summary)) {
      lines.push(`  ${k}: ${typeof v === 'string' ? `"${esc(v)}"` : v}`);
    }
  }

  return lines.join('\n');
}

function esc(s: string): string {
  return s.replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

/**
 * Speichert/aktualisiert das YAML-Profil in der agent_memory Tabelle.
 * Alle Agenten können darauf zugreifen.
 */
export async function syncTenantYAML(tenantId: string): Promise<{ yaml: string; version: number }> {
  const profile = await generateTenantProfile(tenantId);
  const yamlStr = toYAMLString(profile);

  const key = 'tenant_profile_yaml';
  const existing = await db
    .select()
    .from(agentMemory)
    .where(and(eq(agentMemory.tenantId, tenantId), eq(agentMemory.key, key)))
    .limit(1);

  const value = {
    yaml: yamlStr,
    meta: profile.meta,
    generated_at: new Date().toISOString(),
  };

  if (existing.length > 0) {
    await db
      .update(agentMemory)
      .set({ value, updatedAt: new Date() })
      .where(eq(agentMemory.id, existing[0].id));
  } else {
    await db.insert(agentMemory).values({ tenantId, key, value });
  }

  return { yaml: yamlStr, version: profile.meta.version };
}

/**
 * Lädt das aktuelle YAML-Profil eines Tenants.
 */
export async function getTenantYAML(tenantId: string): Promise<string | null> {
  const [mem] = await db
    .select()
    .from(agentMemory)
    .where(and(eq(agentMemory.tenantId, tenantId), eq(agentMemory.key, 'tenant_profile_yaml')))
    .limit(1);

  if (!mem) return null;
  return (mem.value as any)?.yaml ?? null;
}
