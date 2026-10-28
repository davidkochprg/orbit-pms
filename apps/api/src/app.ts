import { randomBytes, randomUUID } from 'node:crypto';
import {
  createHousekeepingNotePipeline,
  createIdScanReader,
  createInboxPipeline,
  type HotelContext,
  type MetaProvider,
  type UsageStore,
} from '@orbit/ai';
import {
  createActivityService,
  createBillingService,
  createGuestService,
  createHotelService,
  createHousekeepingService,
  createIdScanService,
  createInboxService,
  createPendingActionService,
  createRatesService,
  createReportService,
  createRegistrationService,
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
import { activityRoutes } from './routes/activity';
import { agentRoutes } from './routes/agent';
import { billingRoutes } from './routes/billing';
import { bookingRoutes } from './routes/bookings';
import { guestRoutes } from './routes/guests';
import { housekeepingRoutes } from './routes/housekeeping';
import { idScanRoutes } from './routes/id-scans';
import { inboxRoutes } from './routes/inbox';
import { overviewRoutes } from './routes/overview';
import { pendingActionRoutes } from './routes/pending-actions';
import { registrationRoutes } from './routes/registration';
import { reportRoutes } from './routes/reports';
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
/** 144 random bits: the only key to a phone scan link. */
const newScanToken = () => randomBytes(18).toString('base64url');

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
  const billing = createBillingService({ repos, pricing: pricingConfig, clock, newId });
  const reports = createReportService({ repos, pricing: pricingConfig });
  const registrations = createRegistrationService({ repos, policy: hotelPolicy, clock, newId });
  const scans = createIdScanService({ repos, policy: hotelPolicy, clock, newToken: newScanToken });
  const guests = createGuestService({ repos, newId });
  const housekeeping = createHousekeepingService({ repos, clock, newId });
  const actions = createPendingActionService({
    repos,
    hotel,
    billing,
    registrations,
    guests,
    clock,
    newId,
  });
  const settings = createSettingsService({ repos });
  const staff = createStaffService({ repos, newId });
  const rates = createRatesService({ repos, defaults: pricingConfig, newId });
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
      ai: { configured: ai !== null, voice: ai?.transcription != null, vision: ai?.vision != null },
    }),
  );
  app.route('/api', roomRoutes(repos));
  app.route('/api', bookingRoutes(repos, hotel));
  app.route('/api', billingRoutes(billing));
  app.route('/api', reportRoutes(reports));
  app.route('/api', registrationRoutes(registrations));
  app.route(
    '/api',
    idScanRoutes({
      scans,
      read:
        ai?.vision && ai.visionModelId
          ? createIdScanReader({ model: ai.vision, modelId: ai.visionModelId, usage })
          : null,
      gate,
    }),
  );
  app.route('/api', activityRoutes(createActivityService({ repos })));
  app.route('/api', guestRoutes(repos, guests));
  app.route('/api', overviewRoutes(repos, hotel));
  app.route('/api', pendingActionRoutes(actions));
  app.route('/api', inboxRoutes({ inbox, hotel, pipeline, gate }));
  app.route('/api', housekeepingRoutes({ housekeeping, notes, gate }));
  app.route(
    '/api',
    agentRoutes({
      ai,
      repos,
      hotel,
      billing,
      reports,
      actions,
      housekeeping,
      registrations,
      hotelContext,
      limiter,
      gate,
      clock,
      usage,
    }),
  );
  app.route('/api', settingsRoutes({ settings, staff, rates }));
  app.route('/api', usageRoutes({ usage, monthlyBudgetMicroUsd, clock }));

  app.notFound((c) => c.json(errorBody('not_found', 'Route not found'), 404));
  app.onError(handleError);
  return app;
}
