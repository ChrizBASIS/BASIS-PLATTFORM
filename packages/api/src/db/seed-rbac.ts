/**
 * RBAC Seed Data — System Roles & Permissions
 *
 * Vordefinierte Rollen:
 *   owner    — Vollzugriff, kann Rollen verwalten, Tenant löschen
 *   admin    — Fast alles, kann keine Rollen erstellen/löschen
 *   manager  — Projekte, Agenten, Team verwalten
 *   member   — Standard-Zugang, kann Agenten nutzen
 *   viewer   — Nur lesen, kein Schreibzugriff
 *
 * Resources: tenant, project, deployment, agent, sandbox, team, role, billing, gdpr, token_usage
 * Actions:   create, read, update, delete, manage
 */

export const SYSTEM_PERMISSIONS = [
  // Tenant
  { resource: 'tenant', action: 'read', description: 'Tenant-Infos einsehen' },
  { resource: 'tenant', action: 'update', description: 'Tenant-Einstellungen ändern' },
  { resource: 'tenant', action: 'delete', description: 'Tenant löschen (DSGVO Art. 17)' },

  // Projects
  { resource: 'project', action: 'create', description: 'Projekte erstellen' },
  { resource: 'project', action: 'read', description: 'Projekte einsehen' },
  { resource: 'project', action: 'update', description: 'Projekte bearbeiten' },
  { resource: 'project', action: 'delete', description: 'Projekte löschen' },

  // Deployments
  { resource: 'deployment', action: 'create', description: 'Deployments auslösen' },
  { resource: 'deployment', action: 'read', description: 'Deployment-Status einsehen' },

  // Agents
  { resource: 'agent', action: 'read', description: 'Agenten nutzen (Chat)' },
  { resource: 'agent', action: 'manage', description: 'Agenten-Config ändern (an/aus, Limits)' },

  // Sandbox / Build Mode
  { resource: 'sandbox', action: 'create', description: 'Sandbox-Sessions starten' },
  { resource: 'sandbox', action: 'read', description: 'Sandbox-Sessions einsehen' },
  { resource: 'sandbox', action: 'manage', description: 'Sandbox publizieren/verwerfen' },

  // Team
  { resource: 'team', action: 'read', description: 'Team-Mitglieder einsehen' },
  { resource: 'team', action: 'manage', description: 'Mitglieder einladen/entfernen' },

  // Roles
  { resource: 'role', action: 'read', description: 'Rollen einsehen' },
  { resource: 'role', action: 'manage', description: 'Rollen erstellen/bearbeiten/löschen' },

  // Billing
  { resource: 'billing', action: 'read', description: 'Rechnungen/Plan einsehen' },
  { resource: 'billing', action: 'manage', description: 'Plan ändern, Zahlungsmethode' },

  // GDPR
  { resource: 'gdpr', action: 'read', description: 'DSGVO-Export anfordern' },
  { resource: 'gdpr', action: 'manage', description: 'DSGVO-Löschung auslösen' },

  // Token Usage
  { resource: 'token_usage', action: 'read', description: 'Token-Verbrauch einsehen' },
] as const;

export type PermissionKey = `${(typeof SYSTEM_PERMISSIONS)[number]['resource']}:${(typeof SYSTEM_PERMISSIONS)[number]['action']}`;

export const SYSTEM_ROLES = {
  owner: {
    name: 'Owner',
    slug: 'owner',
    description: 'Vollzugriff — Inhaber des Tenants',
    permissions: '*', // all permissions
  },
  admin: {
    name: 'Admin',
    slug: 'admin',
    description: 'Verwaltung — alles außer Rollen-Management und Tenant-Löschung',
    permissions: SYSTEM_PERMISSIONS
      .filter((p) => !(p.resource === 'role' && p.action === 'manage') && !(p.resource === 'tenant' && p.action === 'delete'))
      .map((p) => `${p.resource}:${p.action}`),
  },
  manager: {
    name: 'Manager',
    slug: 'manager',
    description: 'Projekte, Agenten, Team verwalten',
    permissions: [
      'tenant:read',
      'project:create', 'project:read', 'project:update',
      'deployment:create', 'deployment:read',
      'agent:read', 'agent:manage',
      'sandbox:create', 'sandbox:read', 'sandbox:manage',
      'team:read', 'team:manage',
      'role:read',
      'billing:read',
      'gdpr:read',
      'token_usage:read',
    ],
  },
  member: {
    name: 'Mitglied',
    slug: 'member',
    description: 'Standard — Agenten nutzen, Projekte einsehen',
    permissions: [
      'tenant:read',
      'project:read',
      'deployment:read',
      'agent:read',
      'sandbox:create', 'sandbox:read',
      'team:read',
      'role:read',
      'billing:read',
      'token_usage:read',
    ],
  },
  viewer: {
    name: 'Betrachter',
    slug: 'viewer',
    description: 'Nur Lesezugriff',
    permissions: [
      'tenant:read',
      'project:read',
      'deployment:read',
      'agent:read',
      'sandbox:read',
      'team:read',
      'role:read',
      'token_usage:read',
    ],
  },
} as const;
