import { serve } from '@hono/node-server';
import { createDb, createRepositories } from '@orbit/db';
import { createAi } from './ai';
import { createApp } from './app';
import { parseEnv } from './env';

const env = parseEnv(process.env);
const db = createDb(env.DATABASE_URL);
const ai = createAi(env);
const app = createApp({ repos: createRepositories(db.db), aiConfigured: ai !== null, log: true });

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(
    `api listening on http://localhost:${info.port} (db: ${db.driver}, ai: ${ai ? 'on' : 'off'})`,
  );
});

const shutdown = () => {
  server.close();
  void db.close().then(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
