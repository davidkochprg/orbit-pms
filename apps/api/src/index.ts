import { serve } from '@hono/node-server';
import { createServer } from './server';

const { env, db, ai, app } = createServer(process.env);

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
