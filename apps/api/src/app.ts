import { randomBytes, randomUUID } from 'node:crypto';
import {
  createHousekeepingNotePipeline,
  createStayNotesReader,
  createRevenueBriefWriter,
  createIdScanReader,
  createInboxPipeline,
  createTranslator,
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
  createRevenueService,
  createIdScanService,
  createInboxService,
  createPendingActionService,
  createRatesService,
  createReportService,
  createRegistrationService,
  createSettingsService,
  createStaffService,
  getHotelTimeZone,
  hotelPolicy,
  hotelToday,
  pricingConfig,
  type Repositories,
} from '@orbit/domain';
import type { Health } from '@orbit/shared';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { createDemoAccess } from './access';
import { createAiGate } from './ai-gate';
import { errorBody, handleError } from './http';
import { type AiLimitsConfig, createAiLimiter } from './limits';
import { activityRoutes } from './routes/activity';
import { agentRoutes } from './routes/agent';
import { billingRoutes } from './routes/billing';
import { bookingRoutes } from './routes/bookings';
import { guestRoutes } from './routes/guests';
import { housekeepingRoutes } from './routes/housekeeping';
import { revenueRoutes } from './routes/revenue';
import type { WeatherSource } from './weather';
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
  /** When set, the API answers only browsers that entered this code. */
  accessCode?: string;
  clock?: () => Date;
  newId?: (prefix: string) => string;
  /** The forecast behind suggested rates; none by default, so tests never reach the network. */
  weather?: WeatherSource | null;
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
  accessCode,
  clock = () => new Date(),
  newId = defaultNewId,
  weather = null,
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
  const registrations = createRegistrationService({ repos, clock, newId });
  const scans = createIdScanService({ repos, policy: hotelPolicy, clock, newToken: newScanToken });
  const guests = createGuestService({ repos, newId });
  const housekeeping = createHousekeepingService({ repos, clock, newId });
  const rates = createRatesService({ repos, defaults: pricingConfig, newId });
  const actions = createPendingActionService({
    repos,
    rates,
    hotel,
    billing,
    registrations,
    guests,
    clock,
    newId,
  });
  const settings = createSettingsService({ repos });
  const staff = createStaffService({ repos, newId });
  const revenue = createRevenueService({ repos, defaults: pricingConfig, clock, newId });
  /** The outlook with the forecast at the hotel, when it has coordinates and one loads. */
  const rateOutlook = async (days: number) => {
    const { coordinates } = await settings.getProfile();
    const forecast =
      weather && coordinates ? await weather.forecast(coordinates, getHotelTimeZone()) : null;
    return revenue.outlook(days, forecast);
  };
  const hotelContext = async (): Promise<HotelContext> => ({
    profile: await settings.getProfile(),
    policy: hotelPolicy,
    pricing: await rates.getPricing(),
  });
  const inbox = createInboxService({ repos, hotel, clock, newId });
  const limiter = createAiLimiter(limits, clock);
  const monthlyBudgetMicroUsd = Math.round(monthlyBudgetUsd * 1_000_000);
  const { gate, withinBudget } = createAiGate({ limiter, usage, monthlyBudgetMicroUsd, clock });
  const translator =
    ai &&
    createTranslator({
      model: ai.translate,
      modelId: ai.translateModelId,
      usage,
      canSpend: withinBudget,
    });
  const pipeline =
    ai &&
    translator &&
    createInboxPipeline({
      model: ai.agent,
      draftModel: ai.draft,
      modelId: ai.agentModelId,
      hotel,
      inbox,
      hotelContext,
      usage,
      canSpend: withinBudget,
      today: () => hotelToday(clock()),
      translator,
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
  const stays =
    ai && createStayNotesReader({ model: ai.agent, modelId: ai.agentModelId, housekeeping, usage });
  const access = createDemoAccess({ code: accessCode, clock });
  const app = new Hono();
  if (log) app.use(logger());
  app.use('/api/*', access.guard);
  // Private data behind an access code: never let a shared cache keep a copy.
  app.use('/api/*', async (c, next) => {
    await next();
    if (!c.res.headers.has('cache-control')) c.header('cache-control', 'private, no-store');
  });

  app.get('/health', (c) =>
    c.json<Health>({
      status: 'ok',
      ai: { configured: ai !== null, voice: ai?.transcription != null, vision: ai?.vision != null },
      hotel: { timezone: getHotelTimeZone() },
    }),
  );
  app.route('/api', access.routes);
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
  app.route(
    '/api',
    inboxRoutes({
      inbox,
      hotel,
      pipeline,
      translator,
      gate,
      identify: (id) => staff.identify(id),
    }),
  );
  app.route('/api', housekeepingRoutes({ housekeeping, notes, stays, gate }));
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
      rateOutlook,
      hotelContext,
      limiter,
      gate,
      clock,
      usage,
    }),
  );
  app.route('/api', settingsRoutes({ settings, staff, rates }));
  app.route(
    '/api',
    revenueRoutes({
      revenue,
      rates,
      staff,
      outlook: rateOutlook,
      brief: ai && createRevenueBriefWriter({ model: ai.agent, modelId: ai.agentModelId, usage }),
      gate,
    }),
  );
  app.route('/api', usageRoutes({ usage, monthlyBudgetMicroUsd, clock }));

  app.notFound((c) => c.json(errorBody('not_found', 'Route not found'), 404));
  app.onError(handleError);
  return app;
}
