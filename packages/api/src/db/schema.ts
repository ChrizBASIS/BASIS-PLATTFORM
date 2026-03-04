import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  inet,
  bigserial,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

// ─── Tenants ────────────────────────────────────────────────────────────────────
export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').unique().notNull(),
  plan: text('plan').default('starter').notNull(),
  ownerId: uuid('owner_id').notNull(),
  stripeCustomerId: text('stripe_customer_id'),
  stripeSubscriptionId: text('stripe_subscription_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

// ─── Users ──────────────────────────────────────────────────────────────────────
export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  email: text('email').unique().notNull(),
  name: text('name').notNull(),
  language: text('language').default('de').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Roles ──────────────────────────────────────────────────────────────────────
export const roles = pgTable(
  'roles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description'),
    isSystem: boolean('is_system').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('roles_tenant_slug_idx').on(table.tenantId, table.slug)],
);

// ─── Permissions ────────────────────────────────────────────────────────────────
export const permissions = pgTable('permissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  resource: text('resource').notNull(),
  action: text('action').notNull(),
  description: text('description'),
});

// ─── Role ↔ Permission Mapping ──────────────────────────────────────────────────
export const rolePermissions = pgTable(
  'role_permissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    roleId: uuid('role_id').references(() => roles.id, { onDelete: 'cascade' }).notNull(),
    permissionId: uuid('permission_id').references(() => permissions.id, { onDelete: 'cascade' }).notNull(),
  },
  (table) => [uniqueIndex('role_permissions_idx').on(table.roleId, table.permissionId)],
);

// ─── Tenant Members (User ↔ Tenant ↔ Role) ─────────────────────────────────────
export const tenantMembers = pgTable(
  'tenant_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    roleId: uuid('role_id').references(() => roles.id).notNull(),
    invitedBy: uuid('invited_by').references(() => users.id),
    joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
    removedAt: timestamp('removed_at', { withTimezone: true }),
  },
  (table) => [uniqueIndex('tenant_members_idx').on(table.tenantId, table.userId)],
);

// ─── Projects ───────────────────────────────────────────────────────────────────
export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .references(() => tenants.id)
    .notNull(),
  name: text('name').notNull(),
  subdomain: text('subdomain').unique().notNull(),
  template: text('template').default('custom').notNull(),
  repoUrl: text('repo_url'),
  status: text('status').default('inactive').notNull(),
  coolifyAppId: text('coolify_app_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Deployments ────────────────────────────────────────────────────────────────
export const deployments = pgTable('deployments', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .references(() => projects.id)
    .notNull(),
  triggeredBy: uuid('triggered_by').references(() => users.id),
  status: text('status').default('pending').notNull(),
  commitSha: text('commit_sha'),
  logs: text('logs'),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
});

// ─── Environment Variables (encrypted) ──────────────────────────────────────────
export const envVars = pgTable(
  'env_vars',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .references(() => projects.id)
      .notNull(),
    key: text('key').notNull(),
    encryptedValue: text('encrypted_value').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('env_vars_project_key_idx').on(table.projectId, table.key)],
);

// ─── Agent Config (per Tenant) ──────────────────────────────────────────────────
export const agentConfig = pgTable(
  'agent_config',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => tenants.id)
      .notNull(),
    agentType: text('agent_type').notNull(),
    enabled: boolean('enabled').default(true).notNull(),
    dailyLimit: integer('daily_limit').default(50),
    config: jsonb('config'),
  },
  (table) => [uniqueIndex('agent_config_tenant_type_idx').on(table.tenantId, table.agentType)],
);

// ─── Agent Conversations ────────────────────────────────────────────────────────
export const agentConversations = pgTable('agent_conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .references(() => tenants.id)
    .notNull(),
  userId: uuid('user_id').references(() => users.id),
  agentType: text('agent_type').notNull(),
  messages: jsonb('messages').notNull(),
  summary: text('summary'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Agent Memory (long-term per Tenant) ────────────────────────────────────────
export const agentMemory = pgTable(
  'agent_memory',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => tenants.id)
      .notNull(),
    key: text('key').notNull(),
    value: jsonb('value').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('agent_memory_tenant_key_idx').on(table.tenantId, table.key)],
);

// ─── Sandbox Sessions ───────────────────────────────────────────────────────────
export const sandboxSessions = pgTable('sandbox_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .references(() => projects.id)
    .notNull(),
  userId: uuid('user_id').references(() => users.id),
  status: text('status').default('active').notNull(),
  branchName: text('branch_name'),
  previewUrl: text('preview_url'),
  changes: jsonb('changes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  closedAt: timestamp('closed_at', { withTimezone: true }),
});

// ─── Token Usage (per Tenant, per Agent, per Month) ────────────────────────────
export const tokenUsage = pgTable(
  'token_usage',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
    userId: uuid('user_id').references(() => users.id),
    agentType: text('agent_type').notNull(),
    inputTokens: integer('input_tokens').default(0).notNull(),
    outputTokens: integer('output_tokens').default(0).notNull(),
    model: text('model'),
    conversationId: uuid('conversation_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
);

// ─── Audit Log ──────────────────────────────────────────────────────────────────
export const auditLog = pgTable('audit_log', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  tenantId: uuid('tenant_id'),
  userId: uuid('user_id'),
  action: text('action').notNull(),
  resource: text('resource'),
  details: jsonb('details'),
  ipAddress: inet('ip_address'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
