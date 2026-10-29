import { createDb, createRepositories, createUsageStore } from '@orbit/db';
import { setHotelTimeZone } from '@orbit/domain';
import { createAi } from './ai';
import { createApp } from './app';
import { parseEnv } from './env';

/** The API wired to its database and Meta models from the environment, for every way it runs. */
export function createServer(source: Record<string, string | undefined>) {
  const env = parseEnv(source);
  setHotelTimeZone(env.HOTEL_TIMEZONE);
  const db = createDb(env.DATABASE_URL);
  const ai = createAi(env);
  const app = createApp({
    repos: createRepositories(db.db),
    ai,
    limits: {
      perIpPerHour: env.AI_RATE_LIMIT_PER_HOUR,
      dailyTokenBudget: env.AI_DAILY_TOKEN_BUDGET,
    },
    usage: createUsageStore(db.db),
    monthlyBudgetUsd: env.AI_MONTHLY_BUDGET_USD,
    accessCode: env.DEMO_ACCESS_CODE,
    log: true,
  });
  return { env, db, ai, app };
}
