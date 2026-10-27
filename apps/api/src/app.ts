import { randomUUID } from 'node:crypto';
import {
  createHousekeepingNotePipeline,
  createInboxPipeline,
  type HotelContext,
  type MetaProvider,
  type UsageStore,
} from '@orbit/ai';
import {
  createGuestService,
  createHotelService,
  createHousekeepingService,
  createInboxService,
  createPendingActionService,
  createSettingsService,
  createStaffService,
  hotelPolicy,
  hotelToday,
  pricingConfig,
  type Repositories,
} from '@orbit/domain';
import type { Health } from '@orbit/shared';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { createAiGate } from './ai-gate';
import { errorBody, handleError } from './http';
import { type AiLimitsConfig, createAiLimiter } from './limits';
import { agentRoutes } from './routes/agent';
import { bookingRoutes } from './routes/bookings';
import { guestRoutes } from './routes/guests';
import { housekeepingRoutes } from './routes/housekeeping';
import { inboxRoutes } from './routes/inbox';
import { overviewRoutes } from './routes/overview';
import { pendingActionRoutes } from './routes/pending-actions';
import { roomRoutes } from './routes/rooms';
import { settingsRoutes } from './routes/settings';
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
  limits = { perIpPerHour: 20, dailyTokenBudget: 2_000_000 },
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
  const settings = createSettingsService({ repos });
  const staff = createStaffService({ repos, newId });
  const hotelContext = async (): Promise<HotelContext> => ({
    profile: await settings.getProfile(),
    policy: hotelPolicy,
  });
  const inbox = createInboxService({ repos, hotel, clock, newId });
  const limiter = createAiLimiter(limits, clock);
  const monthlyBudgetMicroUsd = Math.round(monthlyBudgetUsd * 1_000_000);
  const { gate, withinBudget } = createAiGate({ limiter, usage, monthlyBudgetMicroUsd, clock });
  const pipeline =
    ai &&
    createInboxPipeline({
      model: ai.agent,
      modelId: ai.agentModelId,
      hotel,
      inbox,
      hotelContext,
      usage,
      canSpend: withinBudget,
      today: () => hotelToday(clock()),
    });
  const housekeeping = createHousekeepingService({ repos, clock, newId });
  const notes =
    ai &&
    createHousekeepingNotePipeline({
      model: ai.agent,
      modelId: ai.agentModelId,
      transcription: ai.transcription,
      housekeeping,
      listRooms: () => repos.rooms.listRooms(),
      usage,
    });
  const app = new Hono();
  if (log) app.use(logger());

  app.get('/health', (c) =>
    c.json<Health>({
      status: 'ok',
      ai: { configured: ai !== null, voice: ai?.transcription != null },
    }),
  );
  app.route('/api', roomRoutes(repos));
  app.route('/api', bookingRoutes(repos, hotel));
  app.route('/api', guestRoutes(repos, createGuestService({ repos, newId })));
  app.route('/api', overviewRoutes(repos, hotel));
  app.route('/api', pendingActionRoutes(actions));
  app.route('/api', inboxRoutes({ inbox, hotel, pipeline, gate }));
  app.route('/api', housekeepingRoutes({ housekeeping, notes, gate }));
  app.route(
    '/api',
    agentRoutes({ ai, repos, hotel, actions, hotelContext, limiter, gate, clock, usage }),
  );
  app.route('/api', settingsRoutes({ settings, staff }));
  app.route('/api', usageRoutes({ usage, monthlyBudgetMicroUsd, clock }));

  app.notFound((c) => c.json(errorBody('not_found', 'Route not found'), 404));
  app.onError(handleError);
  return app;
}
