import { randomBytes, randomUUID } from 'node:crypto';
import {
  createArrivalNoteWriter,
  createGuestMemoryReader,
  createHousekeepingNotePipeline,
  createStayNotesReader,
  createNoteFiler,
  createRepairDesk,
  createRepairReplier,
  createWorkOrderDrafter,
  createReplyLearner,
  createReportSummaryWriter,
  createRateReviewer,
  createRevenueBriefWriter,
  createIdScanReader,
  createSupplierInvoiceReader,
  createInboxPipeline,
  createRequestReader,
  createTranslator,
  type HotelContext,
  type MetaProvider,
  type UsageStore,
} from '@orbit/ai';
import {
  createActivityService,
  createArrivalNoteService,
  createGuestMemoryService,
  createBillingService,
  createContactService,
  createGuestService,
  createHotelService,
  createHousekeepingService,
  createRevenueService,
  createIdScanService,
  createInboxService,
  createInvoiceService,
  createSupplierInvoiceService,
  createPendingActionService,
  createRatesService,
  createReportService,
  createRegistrationService,
  createSettingsService,
  createKnockOnService,
  createMailboxService,
  currentEntries,
  endedEntries,
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
import { createBillReader } from './bills';
import { renderInvoicePdf } from './pdf/invoice-pdf';
import { errorBody, handleError } from './http';
import { activityRoutes } from './routes/activity';
import { arrivalNoteRoutes, createArrivalNoteDrafter } from './routes/arrival-notes';
import { agentRoutes } from './routes/agent';
import { billingRoutes } from './routes/billing';
import { contactRoutes } from './routes/contacts';
import { bookingRoutes } from './routes/bookings';
import { guestRoutes } from './routes/guests';
import { housekeepingRoutes } from './routes/housekeeping';
import { revenueRoutes } from './routes/revenue';
import type { WeatherSource } from './weather';
import { idScanRoutes } from './routes/id-scans';
import { inboxRoutes } from './routes/inbox';
import { invoiceRoutes } from './routes/invoices';
import { supplierInvoiceRoutes } from './routes/supplier-invoices';
import { overviewRoutes } from './routes/overview';
import { pendingActionRoutes } from './routes/pending-actions';
import { knockOnRoutes } from './routes/knock-ons';
import { mailboxRoutes } from './routes/mailbox';
import { registrationRoutes } from './routes/registration';
import { reportRoutes } from './routes/reports';
import { roomRoutes } from './routes/rooms';
import { settingsRoutes } from './routes/settings';
import { type UsageReport, usageRoutes } from './routes/usage';

export interface AppDeps {
  repos: Repositories;
  ai: MetaProvider | null;
  usage: UsageStore & { monthToDateByFeature?: UsageReport };
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
  usage,
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
  const settings = createSettingsService({ repos, clock });
  const inbox = createInboxService({ repos, hotel, clock, newId });
  const mailbox = createMailboxService({ repos, clock, newId });
  const revenue = createRevenueService({ repos, defaults: pricingConfig, clock, newId });
  const activity = createActivityService({ repos });
  const contacts = createContactService({ repos, clock, newId });
  const invoices = createInvoiceService({
    repos,
    pricing: pricingConfig,
    inbox,
    renderPdf: renderInvoicePdf,
    clock,
    newId,
  });
  const bills = createSupplierInvoiceService({
    repos,
    pricing: pricingConfig,
    scanMinutes: hotelPolicy.idScanMinutes,
    clock,
    newId,
    newToken: newScanToken,
  });
  const billReader =
    ai &&
    createBillReader(
      createSupplierInvoiceReader({
        model: ai.agent,
        modelId: ai.agentModelId,
        vision: ai.vision ?? null,
        visionModelId: ai.visionModelId ?? null,
        usage,
      }),
      bills,
      { mailbox, inbox },
    );
  const actions = createPendingActionService({
    repos,
    rates,
    hotel,
    billing,
    registrations,
    guests,
    settings,
    inbox,
    events: revenue,
    contacts,
    invoices,
    bills,
    readBill:
      billReader &&
      ((attachmentId, inquiryId) => billReader.readAttachment(attachmentId, inquiryId, 'agent')),
    clock,
    newId,
  });
  const knockOns = createKnockOnService({ repos, hotel, policy: hotelPolicy, clock });
  const staff = createStaffService({ repos, newId });
  /** The forecast at the hotel, when it has coordinates and one loads. */
  const forecast = async () => {
    const { coordinates } = await settings.getProfile();
    return weather && coordinates ? weather.forecast(coordinates, getHotelTimeZone()) : null;
  };
  const rateOutlook = async (days: number) => revenue.outlook(days, await forecast());
  // Notices whose last day has passed are left out, so the agent no longer mentions them.
  const hotelContext = async (): Promise<HotelContext> => ({
    profile: currentEntries(await settings.getProfile(), hotelToday(clock())),
    policy: hotelPolicy,
    pricing: await rates.getPricing(),
  });
  const translator =
    ai &&
    createTranslator({
      model: ai.translate,
      modelId: ai.translateModelId,
      usage,
    });
  const desk =
    ai &&
    createRepairDesk({ model: ai.agent, modelId: ai.agentModelId, draftModel: ai.draft, usage });
  const repairReply =
    desk &&
    createRepairReplier({
      desk,
      repair: (taskId) => contacts.repair(taskId),
      contact: (contactId) => contacts.get(contactId),
      hotel: () => settings.getProfile(),
      today: () => hotelToday(clock()),
      dayOf: (at) => hotelToday(at),
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
      today: () => hotelToday(clock()),
      translator,
      ...(repairReply && { repairReply: (inquiry) => repairReply(inquiry) }),
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
  const arrivalNotes = createArrivalNoteService({ repos, clock });
  const memories = createGuestMemoryService({ repos, clock });
  const memoryReader =
    ai && createGuestMemoryReader({ model: ai.agent, modelId: ai.agentModelId, usage });
  /** A guest's memory, read first when their history changed and AI is on. */
  const remember = async (guestId: string) => {
    const source = memoryReader && (await memories.sourceToRead(guestId));
    return source && memoryReader
      ? memories.save(guestId, source, await memoryReader.read(source))
      : memories.get(guestId);
  };
  const draftArrivalNote =
    ai &&
    createArrivalNoteDrafter({
      hotel,
      writer: createArrivalNoteWriter({ model: ai.draft, usage, hotelContext }),
      forecast,
      country: async () => (await settings.getProfile()).country,
      remembered: async (guestId) => (await remember(guestId)).items.map((i) => i.text),
      today: () => hotelToday(clock()),
    });
  const draftWorkOrder =
    desk &&
    createWorkOrderDrafter({
      desk,
      repair: (taskId) => contacts.repair(taskId),
      contact: (contactId) => contacts.get(contactId),
      hotel: () => settings.getProfile(),
      today: () => hotelToday(clock()),
    });
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
  const requestReader =
    ai && createRequestReader({ model: ai.agent, modelId: ai.agentModelId, usage });
  app.route(
    '/api',
    bookingRoutes(
      repos,
      hotel,
      requestReader && ((text) => requestReader.read(text, hotelToday(clock()))),
    ),
  );
  app.route('/api', billingRoutes(billing));
  app.route('/api', invoiceRoutes({ invoices, identify: (id) => staff.identify(id) }));
  app.route('/api', supplierInvoiceRoutes({ bills, reader: billReader }));
  app.route(
    '/api',
    reportRoutes({
      reports,
      summary:
        ai && createReportSummaryWriter({ model: ai.agent, modelId: ai.agentModelId, usage }),
      currency: async () => (await rates.getPricing()).currency,
      today: () => hotelToday(clock()),
    }),
  );
  app.route('/api', registrationRoutes(registrations));
  app.route(
    '/api',
    idScanRoutes({
      scans,
      read:
        ai?.vision && ai.visionModelId
          ? createIdScanReader({ model: ai.vision, modelId: ai.visionModelId, usage })
          : null,
    }),
  );
  app.route('/api', activityRoutes(activity));
  app.route(
    '/api',
    guestRoutes({
      repos,
      guests,
      memories,
      reader: memoryReader,
    }),
  );
  app.route('/api', overviewRoutes(repos, hotel));
  app.route(
    '/api',
    pendingActionRoutes(actions, (id) => staff.identify(id)),
  );
  app.route('/api', knockOnRoutes(knockOns));
  app.route(
    '/api',
    arrivalNoteRoutes({
      arrivalNotes,
      hotel,
      inbox,
      draft: draftArrivalNote,
      identify: (id) => staff.identify(id),
    }),
  );
  app.route('/api', mailboxRoutes({ inbox, mailbox }));
  app.route(
    '/api',
    inboxRoutes({
      inbox,
      hotel,
      pipeline,
      translator,
      learner: ai && createReplyLearner({ model: ai.agent, modelId: ai.agentModelId, usage }),
      actions,
      hotelEntries: async () => (await hotelContext()).profile.entries,
      today: () => hotelToday(clock()),
      identify: (id) => staff.identify(id),
    }),
  );
  app.route('/api', housekeepingRoutes({ housekeeping, notes, stays, desk }));
  app.route(
    '/api',
    contactRoutes({
      contacts,
      inbox,
      draftWorkOrder,
      identify: (id) => staff.identify(id),
    }),
  );
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
      relocations: (roomId) => knockOns.relocationsFor(roomId),
      hotelContext,
      endedNotices: async () => endedEntries(await settings.getProfile(), hotelToday(clock())),
      inbox,
      draftReply: pipeline ? (id) => pipeline.draft(id) : null,
      activity,
      events: revenue,
      contacts,
      arrivalNotesDue: (date) => arrivalNotes.due(date),
      // The agent asked about the guest: worth a reading if the history changed.
      guestMemory: remember,
      invoices,
      bills,
      // The agent's drafts are signed by the reception; the confirming staff member sends them.
      draftArrivalNote: draftArrivalNote && ((bookingId) => draftArrivalNote(bookingId, null)),
      draftWorkOrder:
        draftWorkOrder && ((taskId, contactId) => draftWorkOrder(taskId, contactId, null)),
      clock,
      usage,
    }),
  );
  app.route(
    '/api',
    settingsRoutes({
      settings,
      staff,
      rates,
      filer: ai && createNoteFiler({ model: ai.agent, modelId: ai.agentModelId, usage }),
      today: () => hotelToday(clock()),
    }),
  );
  app.route(
    '/api',
    revenueRoutes({
      revenue,
      rates,
      staff,
      outlook: rateOutlook,
      forecast,
      brief: ai && createRevenueBriefWriter({ model: ai.agent, modelId: ai.agentModelId, usage }),
      reviewer: ai && createRateReviewer({ model: ai.agent, modelId: ai.agentModelId, usage }),
    }),
  );
  app.route('/api', usageRoutes({ usage, clock }));

  app.notFound((c) => c.json(errorBody('not_found', 'Route not found'), 404));
  app.onError(handleError);
  return app;
}
