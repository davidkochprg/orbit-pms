import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import { migrate as migratePostgres } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { acquireLock } from './lock';
import { migrationsFolder, repoRoot } from './paths';
import * as schema from './schema';

export type Schema = typeof schema;
export type Db = PgDatabase<PgQueryResultHKT, Schema>;

export interface DbHandle {
  db: Db;
  driver: 'pglite' | 'postgres';
  migrate(): Promise<void>;
  close(): Promise<void>;
}

export const DEFAULT_LOCAL_DATABASE_URL = 'file:./.data/orbit';

/**
 * `postgres://…` connects to a real Postgres (Neon in production). Anything else is a local PGlite
 * data directory, e.g. `file:./.data/orbit`, resolved from the repository root.
 */
export function createDb(url: string = DEFAULT_LOCAL_DATABASE_URL): DbHandle {
  if (/^postgres(ql)?:\/\//.test(url)) {
    const client = postgres(url, { max: 5, onnotice: () => {} });
    const db = drizzlePostgres(client, { schema });
    return {
      db,
      driver: 'postgres',
      migrate: () => migratePostgres(db, { migrationsFolder }),
      close: () => client.end(),
    };
  }

  const dir = url === 'memory://' ? undefined : path.resolve(repoRoot, url.replace(/^file:/, ''));
  let release = () => {};
  if (dir) {
    mkdirSync(dir, { recursive: true });
    release = acquireLock(`${dir}.lock`);
    process.once('exit', release);
  }
  const client = new PGlite(dir);
  const db = drizzlePglite(client, { schema });
  return {
    db,
    driver: 'pglite',
    migrate: () => migratePglite(db, { migrationsFolder }),
    close: async () => {
      await client.close();
      release();
    },
  };
}
