import { createMiddleware } from 'hono/factory';
import { db } from '../db/index.js';
import { tenantMembers } from '../db/schema.js';
import { eq, and, isNull } from 'drizzle-orm';

declare module 'hono' {
  interface ContextVariableMap {
    tenantId: string;
  }
}

export const tenantMiddleware = createMiddleware(async (c, next) => {
  const user = c.get('user');

  if (!user?.sub) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  // Resolve tenant via tenantMembers (RBAC model)
  const [membership] = await db
    .select({ tenantId: tenantMembers.tenantId })
    .from(tenantMembers)
    .where(and(eq(tenantMembers.userId, user.sub), isNull(tenantMembers.removedAt)))
    .limit(1);

  if (!membership?.tenantId) {
    return c.json(
      { error: 'No tenant', message: 'User is not associated with any tenant' },
      403,
    );
  }

  c.set('tenantId', membership.tenantId);
  await next();
});
