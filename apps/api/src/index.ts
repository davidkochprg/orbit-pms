import { serve } from '@hono/node-server';
import { createDb, createRepositories, createUsageStore } from '@orbit/db';
import { setHotelTimeZone } from '@orbit/domain';
import { createAi } from './ai';
import { createApp } from './app';
import { parseEnv } from './env';

const env = parseEnv(process.env);
setHotelTimeZone(env.HOTEL_TIMEZONE);
const db = createDb(env.DATABASE_URL);
const ai = createAi(env);
const app = createApp({
  repos: createRepositories(db.db),
  ai,
  limits: { perIpPerHour: env.AI_RATE_LIMIT_PER_HOUR, dailyTokenBudget: env.AI_DAILY_TOKEN_BUDGET },
  usage: createUsageStore(db.db),
  monthlyBudgetUsd: env.AI_MONTHLY_BUDGET_USD,
  log: true,
});

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
