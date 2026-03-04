import { createMiddleware } from 'hono/factory';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';

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

  const [dbUser] = await db.select().from(users).where(eq(users.id, user.sub)).limit(1);

  if (!dbUser?.tenantId) {
    return c.json(
      { error: 'No tenant', message: 'User is not associated with any tenant' },
      403,
    );
  }

  c.set('tenantId', dbUser.tenantId);
  await next();
});
