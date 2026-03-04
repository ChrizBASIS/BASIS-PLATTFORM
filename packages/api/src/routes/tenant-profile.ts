import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.js';
import { tenantMiddleware } from '../middleware/tenant.js';
import { rbac } from '../middleware/rbac.js';
import { syncTenantYAML, getTenantYAML, generateTenantProfile } from '../lib/tenant-yaml.js';

const app = new Hono();

// GET /tenant-profile/yaml — Aktuelles YAML-Profil abrufen
app.get('/yaml', authMiddleware, tenantMiddleware, rbac('tenant', 'read'), async (c) => {
  const tenantId = c.get('tenantId');
  const yaml = await getTenantYAML(tenantId);

  if (!yaml) {
    return c.json({ error: 'Kein Profil vorhanden — bitte Onboarding abschließen' }, 404);
  }

  // Als YAML oder JSON zurückgeben je nach Accept-Header
  const accept = c.req.header('Accept') ?? '';
  if (accept.includes('text/yaml') || accept.includes('application/yaml')) {
    return new Response(yaml, {
      headers: { 'Content-Type': 'text/yaml; charset=utf-8' },
    });
  }

  return c.json({ yaml });
});

// GET /tenant-profile/json — Profil als strukturiertes JSON (für Dashboard)
app.get('/json', authMiddleware, tenantMiddleware, rbac('tenant', 'read'), async (c) => {
  const tenantId = c.get('tenantId');

  try {
    const profile = await generateTenantProfile(tenantId);
    return c.json({ profile });
  } catch (error: any) {
    if (error?.message?.includes('nicht gefunden')) {
      return c.json({ error: 'Kein Profil vorhanden — bitte Onboarding abschließen' }, 404);
    }
    return c.json({ error: error?.message ?? 'Fehler beim Laden des Profils' }, 500);
  }
});

// POST /tenant-profile/sync — YAML-Profil manuell aktualisieren
app.post('/sync', authMiddleware, tenantMiddleware, rbac('tenant', 'read'), async (c) => {
  const tenantId = c.get('tenantId');

  try {
    const { yaml, version } = await syncTenantYAML(tenantId);
    return c.json({ success: true, version, preview: yaml.slice(0, 500) + '...' });
  } catch (error: any) {
    return c.json({ error: error?.message ?? 'Sync fehlgeschlagen' }, 500);
  }
});

// GET /tenant-profile/download — YAML als Datei herunterladen
app.get('/download', authMiddleware, tenantMiddleware, rbac('tenant', 'read'), async (c) => {
  const tenantId = c.get('tenantId');

  // Erst sync, dann download
  const { yaml } = await syncTenantYAML(tenantId);

  return new Response(yaml, {
    headers: {
      'Content-Type': 'text/yaml; charset=utf-8',
      'Content-Disposition': `attachment; filename="tenant-profile.yaml"`,
    },
  });
});

export { app as tenantProfileRoutes };
