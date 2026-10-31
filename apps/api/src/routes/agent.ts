import {
  amountsInText,
  buildSystemPrompt,
  contextNote,
  createAgentTools,
  createSpeechInput,
  type HotelContext,
  hotelFacts,
  type MetaProvider,
  runAgent,
  speechKeywords,
  tokenCostMicroUsd,
  TranscriptionError,
  type UsageStore,
} from '@orbit/ai';
import {
  addDays,
  type ActivityService,
  type BillingService,
  type ContactService,
  DomainError,
  getHotelTimeZone,
  hotelToday,
  type HotelService,
  type HousekeepingService,
  type InboxService,
  type PendingActionService,
  type RegistrationService,
  type ReportService,
  type Repositories,
  type RevenueService,
} from '@orbit/domain';
import {
  type AgentContext,
  type ArrivalNote,
  type ArrivalNotes,
  type HotelInfoEntry,
  type Inquiry,
  type Relocation,
  type RevenueOutlook,
  type AgentMessageMetadata,
  agentMessageMetadataSchema,
  agentRequestSchema,
} from '@orbit/shared';
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  toUIMessageStream,
  type UIMessage,
  validateUIMessages,
} from 'ai';
import { Hono } from 'hono';
import { readRecording } from '../audio';
import { errorBody } from '../http';
import type { AiGate } from '../ai-gate';
import type { AiLimiter } from '../limits';
import { validate } from '../validate';

export interface AgentRouteDeps {
  ai: MetaProvider | null;
  repos: Repositories;
  hotel: HotelService;
  billing: BillingService;
  reports: ReportService;
  actions: PendingActionService;
  housekeeping: HousekeepingService;
  registrations: RegistrationService;
  /** The next nights with suggested rates and the forecast. */
  rateOutlook: (days: number) => Promise<RevenueOutlook>;
  /** Stays booked into a room that is out of order, with a free room for each. */
  relocations: (roomId: string) => Promise<Relocation[]>;
  /** Read for every turn, so edits in Settings apply to the next message. */
  hotelContext: () => Promise<HotelContext>;
  /** Notices whose last day has passed, for the agent only. */
  endedNotices: () => Promise<HotelInfoEntry[]>;
  inbox: InboxService;
  /** The inbox pipeline's guarded reply draft; null when AI drafts are off. */
  draftReply: ((inquiryId: string) => Promise<Inquiry>) | null;
  activity: ActivityService;
  events: Pick<RevenueService, 'listEvents'>;
  contacts: Pick<ContactService, 'list' | 'repair' | 'askToRepair'>;
  /** Guests arriving on a day who haven't heard from the hotel. */
  arrivalNotesDue: (date?: string) => Promise<ArrivalNotes>;
  /** Writes the note before a stay; null when AI drafts are off. */
  draftArrivalNote: ((bookingId: string) => Promise<ArrivalNote>) | null;
  limiter: AiLimiter;
  gate: AiGate;
  clock: () => Date;
  usage: UsageStore;
}

/** Only the most recent messages are sent, so long chats don't grow the cost of every turn. */
const MAX_HISTORY = 20;

/** `POST /api/agent`: streams one agent turn as an AI SDK UI message stream (SSE). */
export function agentRoutes({
  ai,
  repos,
  hotel,
  billing,
  reports,
  actions,
  housekeeping,
  registrations,
  rateOutlook,
  relocations,
  hotelContext,
  endedNotices,
  inbox,
  draftReply,
  activity,
  events,
  contacts,
  arrivalNotesDue,
  draftArrivalNote,
  limiter,
  clock,
  usage,
  gate,
}: AgentRouteDeps) {
  const tools = createAgentTools({
    hotel,
    billing,
    reports,
    actions,
    housekeeping,
    registrations,
    listRooms: () => repos.rooms.listRooms(),
    listRoomTypes: () => repos.rooms.listRoomTypes(),
    rateOutlook,
    relocations,
    inbox,
    draftReply,
    activity,
    getGuest: (id) => repos.guests.getGuest(id),
    guestBookings: (guestId) => repos.bookings.listBookings({ guestId }),
    listEvents: () => events.listEvents(),
    // Fees the profile states may be repeated in a reply, as in the inbox's own drafts.
    statedAmounts: async () => amountsInText(hotelFacts(await hotelContext())),
    contacts,
    mailLabels: () => repos.mail.listLabels(),
    arrivalNotesDue,
    draftArrivalNote,
  });

  /** What the staff member was looking at, from the hotel's own data; null if it is gone. */
  async function describeContext(context: AgentContext): Promise<string | null> {
    try {
      switch (context.kind) {
        case 'booking': {
          const { booking, guest, room } = await hotel.getBookingDetail(context.id);
          return contextNote({
            kind: 'booking',
            bookingId: booking.id,
            guestName: guest.name,
            roomName: room.name,
            checkIn: booking.checkIn,
            checkOut: booking.checkOut,
            status: booking.status,
          });
        }
        case 'guest': {
          const guest = await repos.guests.getGuest(context.id);
          return guest
            ? contextNote({
                kind: 'guest',
                guestId: guest.id,
                name: guest.name,
                email: guest.email,
                language: guest.language,
              })
            : null;
        }
        case 'inquiry': {
          const inquiry = await repos.inquiries.getInquiry(context.id);
          if (!inquiry) return null;
          return contextNote({
            kind: 'inquiry',
            inquiryId: inquiry.id,
            senderName: inquiry.senderName,
            senderAddress: inquiry.senderAddress,
            request: inquiry.parsed,
            lastMessage: inquiry.messages.findLast((m) => m.direction === 'in')?.body ?? null,
          });
        }
      }
    } catch (err) {
      if (err instanceof DomainError) return null;
      throw err;
    }
  }

  /** Puts what each question was asked about in front of it, for the model only. */
  async function withContext(messages: UIMessage<AgentMessageMetadata>[]) {
    const notes = new Map<string, Promise<string | null>>();
    return Promise.all(
      messages.map(async (m) => {
        const context = m.role === 'user' ? m.metadata?.context : undefined;
        if (!context) return m;
        const key = `${context.kind}:${context.id}`;
        if (!notes.has(key)) notes.set(key, describeContext(context));
        const note = await notes.get(key);
        return note
          ? { ...m, parts: [{ type: 'text' as const, text: `[${note}]` }, ...m.parts] }
          : m;
      }),
    );
  }

  const speech = ai?.transcription
    ? createSpeechInput({ transcription: ai.transcription, usage })
    : null;

  /** Guests staying from yesterday to two weeks out and the rooms, to listen for by name. */
  async function keywords(): Promise<string[]> {
    const today = hotelToday(clock());
    const [bookings, guests, rooms] = await Promise.all([
      repos.bookings.listBookings({ from: addDays(today, -1), to: addDays(today, 14) }),
      repos.guests.listGuests(),
      repos.rooms.listRooms(),
    ]);
    const staying = new Set(bookings.filter((b) => b.status !== 'cancelled').map((b) => b.guestId));
    return speechKeywords(
      guests.filter((g) => staying.has(g.id)).map((g) => g.name),
      rooms.map((r) => r.name),
    );
  }

  return new Hono()
    .post('/agent/transcribe', async (c) => {
      if (!speech) {
        return c.json(errorBody('ai_not_configured', 'Voice input is not configured.'), 503);
      }
      const recording = await readRecording(c);
      if ('error' in recording) return recording.error;
      const blocked = await gate(c.req.header('x-forwarded-for'));
      if (blocked) return c.json(errorBody('demo_limit', blocked), 429);
      try {
        return c.json({ text: await speech.transcribe(recording.wav, await keywords()) });
      } catch (err) {
        if (err instanceof TranscriptionError) {
          return c.json(
            errorBody('transcription_failed', `Transcription failed: ${err.message}`),
            502,
          );
        }
        throw err;
      }
    })
    .post('/agent', validate('json', agentRequestSchema), async (c) => {
      if (!ai) {
        return c.json(
          errorBody('ai_not_configured', 'The AI agent is not configured on this server.'),
          503,
        );
      }
      const blocked = await gate(c.req.header('x-forwarded-for'));
      if (blocked) return c.json(errorBody('demo_limit', blocked), 429);

      let messages: UIMessage<AgentMessageMetadata>[];
      try {
        messages = await validateUIMessages<UIMessage<AgentMessageMetadata>>({
          messages: c.req.valid('json').messages,
          tools,
          metadataSchema: agentMessageMetadataSchema.optional(),
        });
      } catch (err) {
        return c.json(
          errorBody('invalid_messages', err instanceof Error ? err.message : 'Invalid messages'),
          400,
        );
      }

      const result = runAgent({
        model: ai.agent,
        system: buildSystemPrompt({
          hotel: await hotelContext(),
          today: hotelToday(clock()),
          timezone: getHotelTimeZone(),
          endedNotices: await endedNotices(),
        }),
        messages: await convertToModelMessages(await withContext(messages.slice(-MAX_HISTORY)), {
          tools,
        }),
        tools,
        abortSignal: c.req.raw.signal,
        onUsage: async (tokens) => {
          limiter.recordTokens(tokens.input + tokens.output);
          await usage.record({
            feature: 'agent',
            model: ai.agentModelId,
            tokens,
            audioSeconds: 0,
            costMicroUsd: tokenCostMicroUsd(tokens),
          });
        },
      });

      return createUIMessageStreamResponse({
        stream: toUIMessageStream({
          stream: result.stream,
          tools,
          originalMessages: messages,
          onError: () => 'The agent hit an error. Please try again.',
        }),
      });
    });
}
