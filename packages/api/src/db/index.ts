import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';
import { getEnv } from '../lib/env.js';

const client = postgres(getEnv().DATABASE_URL);
export const db = drizzle(client, { schema });

export type Database = typeof db;
