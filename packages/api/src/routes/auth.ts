import { Hono } from 'hono';
import { z } from 'zod';
import { getEnv } from '../lib/env.js';
import { authMiddleware } from '../middleware/auth.js';

const auth = new Hono();

// POST /auth/device/code — Start Device Flow (CLI Login)
auth.post('/device/code', async (c) => {
  const env = getEnv();

  const response = await fetch(
    `${env.KEYCLOAK_URL}/realms/${env.KEYCLOAK_REALM}/protocol/openid-connect/auth/device`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.KEYCLOAK_CLIENT_ID,
        client_secret: env.KEYCLOAK_CLIENT_SECRET,
      }),
    },
  );

  if (!response.ok) {
    return c.json({ error: 'Failed to start device flow' }, 500);
  }

  const data = await response.json();
  return c.json({
    device_code: data.device_code,
    user_code: data.user_code,
    verification_uri: data.verification_uri,
    verification_uri_complete: data.verification_uri_complete,
    expires_in: data.expires_in,
    interval: data.interval,
  });
});

// POST /auth/device/token — Poll for token after browser confirmation
auth.post('/device/token', async (c) => {
  const env = getEnv();
  const body = await c.req.json();
  const { device_code } = z.object({ device_code: z.string() }).parse(body);

  const response = await fetch(
    `${env.KEYCLOAK_URL}/realms/${env.KEYCLOAK_REALM}/protocol/openid-connect/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        client_id: env.KEYCLOAK_CLIENT_ID,
        client_secret: env.KEYCLOAK_CLIENT_SECRET,
        device_code,
      }),
    },
  );

  const data = await response.json();

  if (!response.ok) {
    return c.json({ error: data.error, error_description: data.error_description }, response.status as 400 | 401 | 403 | 500);
  }

  return c.json({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in,
    token_type: data.token_type,
  });
});

// POST /auth/refresh — Refresh access token
auth.post('/refresh', async (c) => {
  const env = getEnv();
  const body = await c.req.json();
  const { refresh_token } = z.object({ refresh_token: z.string() }).parse(body);

  const response = await fetch(
    `${env.KEYCLOAK_URL}/realms/${env.KEYCLOAK_REALM}/protocol/openid-connect/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: env.KEYCLOAK_CLIENT_ID,
        client_secret: env.KEYCLOAK_CLIENT_SECRET,
        refresh_token,
      }),
    },
  );

  const data = await response.json();
  if (!response.ok) {
    return c.json({ error: 'Token refresh failed' }, 401);
  }

  return c.json({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in,
  });
});

// POST /auth/logout — Invalidate session
auth.post('/logout', async (c) => {
  const env = getEnv();
  const body = await c.req.json();
  const { refresh_token } = z.object({ refresh_token: z.string() }).parse(body);

  await fetch(
    `${env.KEYCLOAK_URL}/realms/${env.KEYCLOAK_REALM}/protocol/openid-connect/logout`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.KEYCLOAK_CLIENT_ID,
        client_secret: env.KEYCLOAK_CLIENT_SECRET,
        refresh_token,
      }),
    },
  );

  return c.json({ ok: true });
});

// GET /auth/me — Current user profile + tenant info
auth.get('/me', authMiddleware, async (c) => {
  const user = c.get('user');
  return c.json({ user });
});

export default auth;
