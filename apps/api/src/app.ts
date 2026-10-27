import { randomUUID } from 'node:crypto';
import type { MetaProvider, UsageStore } from '@orbit/ai';
import {
  createHotelService,
  createPendingActionService,
  hotelPolicy,
  pricingConfig,
  type Repositories,
} from '@orbit/domain';
import type { Health } from '@orbit/shared';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { errorBody, handleError } from './http';
import { type AiLimitsConfig, createAiLimiter } from './limits';
import { agentRoutes } from './routes/agent';
import { bookingRoutes } from './routes/bookings';
import { guestRoutes } from './routes/guests';
import { overviewRoutes } from './routes/overview';
import { pendingActionRoutes } from './routes/pending-actions';
import { roomRoutes } from './routes/rooms';
import { type UsageReport, usageRoutes } from './routes/usage';

export interface AppDeps {
  repos: Repositories;
  ai: MetaProvider | null;
  limits?: AiLimitsConfig;
  usage: UsageStore & { monthToDateByFeature?: UsageReport };
  monthlyBudgetUsd?: number;
  clock?: () => Date;
  newId?: (prefix: string) => string;
  log?: boolean;
}

const defaultNewId = (prefix: string) => `${prefix}_${randomUUID().slice(0, 8)}`;

export function createApp({
  repos,
  ai,
  limits = { perIpPerHour: 20, dailyTokenBudget: 500_000 },
  usage,
  monthlyBudgetUsd = 100,
  clock = () => new Date(),
  newId = defaultNewId,
  log = false,
}: AppDeps) {
  const hotel = createHotelService({
    repos,
    pricing: pricingConfig,
    policy: hotelPolicy,
    clock,
    newId,
  });
  const actions = createPendingActionService({ repos, hotel, clock, newId });
  const limiter = createAiLimiter(limits, clock);
  const app = new Hono();
  if (log) app.use(logger());

  app.get('/health', (c) => c.json<Health>({ status: 'ok', ai: { configured: ai !== null } }));
  app.route('/api', roomRoutes(repos));
  app.route('/api', bookingRoutes(repos, hotel));
  app.route('/api', guestRoutes(repos));
  app.route('/api', overviewRoutes(repos, hotel));
  app.route('/api', pendingActionRoutes(actions));
  const budget = { usage, monthlyBudgetMicroUsd: Math.round(monthlyBudgetUsd * 1_000_000) };
  app.route('/api', agentRoutes({ ai, repos, hotel, actions, limiter, clock, ...budget }));
  app.route('/api', usageRoutes({ ...budget, clock }));

  app.notFound((c) => c.json(errorBody('not_found', 'Route not found'), 404));
  app.onError(handleError);
  return app;
}
