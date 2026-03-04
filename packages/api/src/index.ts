import 'dotenv/config';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { getEnv } from './lib/env.js';
import authRoutes from './routes/auth.js';
import tenantsRoutes from './routes/tenants.js';
import projectsRoutes from './routes/projects.js';
import agentsRoutes from './routes/agents.js';
import sandboxRoutes from './routes/sandbox.js';
import gdprRoutes from './routes/gdpr.js';
import { rolesRoutes } from './routes/roles.js';
import { supportRoutes } from './routes/support.js';
import { onboardingRoutes } from './routes/onboarding.js';
import { tokenUsageRoutes } from './routes/token-usage.js';
import { tenantProfileRoutes } from './routes/tenant-profile.js';

const app = new Hono();
const env = getEnv();

// Global middleware
app.use('*', logger());
app.use(
  '*',
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true,
  }),
);

// Health check
app.get('/health', (c) => c.json({ status: 'ok', version: '0.1.0' }));

// API routes
app.route('/api/v1/auth', authRoutes);
app.route('/api/v1/tenants', tenantsRoutes);
app.route('/api/v1/projects', projectsRoutes);
app.route('/api/v1/agents', agentsRoutes);
app.route('/api/v1/sandbox', sandboxRoutes);
app.route('/api/v1/gdpr', gdprRoutes);
app.route('/api/v1/roles', rolesRoutes);
app.route('/api/v1/support', supportRoutes);
app.route('/api/v1/onboarding', onboardingRoutes);
app.route('/api/v1/token-usage', tokenUsageRoutes);
app.route('/api/v1/tenant-profile', tenantProfileRoutes);

// 404 handler
app.notFound((c) => c.json({ error: 'Not Found' }, 404));

// Error handler
app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json({ error: 'Internal Server Error' }, 500);
});

// Start server
console.log(`🚀 BASIS Platform API starting on port ${env.PORT}`);
serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`✅ Server running at http://localhost:${info.port}`);
});

export default app;
