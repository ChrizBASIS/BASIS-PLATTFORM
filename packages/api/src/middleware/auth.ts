import { createMiddleware } from 'hono/factory';
import * as jose from 'jose';
import { getEnv } from '../lib/env.js';

export interface AuthUser {
  sub: string;
  email: string;
  name: string;
  tenantId?: string;
  role?: string;
}

declare module 'hono' {
  interface ContextVariableMap {
    user: AuthUser;
  }
}

export const authMiddleware = createMiddleware(async (c, next) => {
  const authorization = c.req.header('Authorization');

  if (!authorization?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized', message: 'Missing or invalid token' }, 401);
  }

  const token = authorization.slice(7);
  const env = getEnv();

  try {
    const JWKS = jose.createRemoteJWKSet(
      new URL(`${env.KEYCLOAK_URL}/realms/${env.KEYCLOAK_REALM}/protocol/openid-connect/certs`),
    );

    const { payload } = await jose.jwtVerify(token, JWKS, {
      issuer: `${env.KEYCLOAK_URL}/realms/${env.KEYCLOAK_REALM}`,
      audience: env.KEYCLOAK_CLIENT_ID,
    });

    c.set('user', {
      sub: payload.sub!,
      email: (payload as Record<string, unknown>).email as string,
      name: (payload as Record<string, unknown>).name as string,
      tenantId: (payload as Record<string, unknown>).tenant_id as string | undefined,
      role: (payload as Record<string, unknown>).role as string | undefined,
    });

    await next();
  } catch {
    return c.json({ error: 'Unauthorized', message: 'Invalid or expired token' }, 401);
  }
});
