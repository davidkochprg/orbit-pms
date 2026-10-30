import {
  type ActivityService,
  type BillingService,
  type ContactService,
  DomainError,
  type HotelService,
  type HousekeepingService,
  type InboxService,
  type PendingActionService,
  type RegistrationService,
  type ReportService,
} from '@orbit/domain';
import {
  type AgentBookingRow,
  type AgentRoomStatusResult,
  type AgentTaskCreatedResult,
  type AgentTaskStatusResult,
  auditActorSchema,
  type Booking,
  type BookingSummary,
  bookingPatchSchema,
  bookingSearchSchema,
  chargePatchSchema,
  type Contact,
  contactProposalSchema,
  createHoldInputSchema,
  currencySchema,
  type Guest,
  type GuestBook,
  guestPatchSchema,
  type HousekeepingBoard,
  housekeepingTaskStatusSchema,
  type Inquiry,
  isoDateSchema,
  type LocalEvent,
  localEventBodySchema,
  newChargeBodySchema,
  newPaymentBodySchema,
  newStayGuestBodySchema,
  newTaskBodySchema,
  type PendingAction,
  type PendingActionInput,
  hotelInfoDraftSchema,
  type Relocation,
  type RevenueOutlook,
  adjustRatesBodySchema,
  quoteInputSchema,
  roomOptionSchema,
  roomOptionsQuerySchema,
  reportQuerySchema,
  replyProposalSchema,
  reportSchema,
  roomBodySchema,
  roomStatusSchema,
  stayGuestPatchSchema,
  tradeSchema,
} from '@orbit/shared';
import { type JSONValue, tool } from 'ai';
import { compactOutlook } from './outlook';
import { amountsInText, checkDraftPrices } from './price-guard';
import { z } from 'zod';

export interface ToolDeps {
  hotel: HotelService;
  billing: BillingService;
  reports: ReportService;
  actions: PendingActionService;
  housekeeping: HousekeepingService;
  registrations: RegistrationService;
  /** Lists rooms with their IDs, so names like "104" can be resolved. */
  listRooms: () => Promise<
    { id: string; name: string; kind: string; roomTypeId: string; status: string }[]
  >;
  /** Room type names, so "a King room" can be matched to its rooms. */
  listRoomTypes: () => Promise<{ id: string; name: string }[]>;
  /** The next nights with suggested rates, with the forecast when there is one. */
  rateOutlook: (days: number) => Promise<RevenueOutlook>;
  /** Stays booked into a room that is out of order, with a free room for each. */
  relocations?: (roomId: string) => Promise<Relocation[]>;
  /** Guest conversations by email and through OTAs. */
  inbox: Pick<InboxService, 'list' | 'get'>;
  /**
   * Writes a conversation's reply draft with the hotel's rooms and exact prices, checked against
   * the quotes; null when drafting is not configured.
   */
  draftReply: ((inquiryId: string) => Promise<Inquiry>) | null;
  activity: Pick<ActivityService, 'list'>;
  getGuest: (guestId: string) => Promise<Guest | null>;
  /** Every booking of one guest. */
  guestBookings: (guestId: string) => Promise<Booking[]>;
  listEvents: () => Promise<LocalEvent[]>;
  /** Amounts the hotel facts state, e.g. a fee, which a reply may repeat. */
  statedAmounts: () => Promise<number[]>;
  /** Suppliers and contractors, and who was asked to fix a repair. */
  contacts: Pick<ContactService, 'list' | 'repair' | 'askToRepair'>;
}

export interface ToolError {
  error: { code: string; message: string };
}

/** Domain errors go back to the model as data so it can explain them and try something else. */
async function safely<T>(run: () => Promise<T>): Promise<T | ToolError> {
  try {
    return await run();
  } catch (err) {
    if (err instanceof DomainError) return { error: { code: err.code, message: err.message } };
    throw err;
  }
}

/**
 * Free rooms as the model sees them: the full quotes go to the app's availability card, the model
 * gets each room's total to name the best fit.
 */
function optionsForModel({ output }: { output: unknown }): { type: 'json'; value: JSONValue } {
  const options = z.array(roomOptionSchema).safeParse(output);
  if (!options.success) return { type: 'json', value: output as JSONValue };
  return {
    type: 'json',
    value: options.data.map(({ quote, roomType, ...room }) => ({
      ...room,
      roomType: { id: roomType.id, name: roomType.name, description: roomType.description },
      nights: quote.nights,
      total: quote.total,
      currency: quote.currency,
    })),
  };
}

/** The daily series is for the app's chart; the model gets the totals and slices. */
function reportForModel({ output }: { output: unknown }): { type: 'json'; value: JSONValue } {
  const report = reportSchema.extend({ currency: currencySchema }).safeParse(output);
  if (!report.success) return { type: 'json', value: output as JSONValue };
  const { days: _, ...rest } = report.data;
  return { type: 'json', value: rest };
}

function compact(s: BookingSummary): AgentBookingRow {
  const b = s.booking;
  return {
    bookingId: b.id,
    guestId: b.guestId,
    guestName: s.guestName,
    roomName: s.roomName,
    roomId: b.roomId,
    checkIn: b.checkIn,
    checkOut: b.checkOut,
    status: b.status,
    adults: b.adults,
    childAges: b.childAges,
    total: b.priceSnapshot?.total ?? null,
  };
}

/**
 * Who is in the room and what the guest book still needs. Document numbers and addresses stay
 * out of the model's context; it only learns whether they are recorded.
 */
function compactGuestBook(book: GuestBook) {
  return {
    partySize: book.partySize,
    missing: book.missing,
    extra: book.extra,
    guests: book.guests.map((g) => ({
      stayGuestId: g.id,
      name: g.name,
      primary: g.primary,
      nationality: g.nationality,
      dateOfBirth: g.dateOfBirth,
      documentType: g.documentType,
      hasDocumentNumber: g.documentNumber !== null,
      hasAddress: g.address !== null,
      missing: g.missing,
    })),
  };
}

/** How many characters of a message the model sees in a conversation list. */
const PREVIEW = 160;

/** A conversation as a list row: who, what they asked for, and where it stands. */
function compactConversation(i: Inquiry) {
  const last = i.messages.at(-1);
  const r = i.parsed;
  return {
    inquiryId: i.id,
    senderName: i.senderName ?? i.senderAddress ?? 'Guest',
    subject: i.subject,
    channel: i.partner ?? i.channel,
    status: i.status,
    unread: i.unread,
    lastMessageAt: i.lastMessageAt,
    lastFrom: last?.direction === 'out' ? 'hotel' : 'guest',
    preview: last ? last.body.replace(/\s+/g, ' ').slice(0, PREVIEW) : null,
    request:
      r && r.checkIn && r.checkOut
        ? { checkIn: r.checkIn, checkOut: r.checkOut, adults: r.adults, childAges: r.childAges }
        : null,
    bookingId: i.bookingId,
  };
}

/** A whole conversation: messages, the request as read, the rooms on offer and the draft. */
function conversationDetail(i: Inquiry) {
  return {
    ...compactConversation(i),
    senderAddress: i.senderAddress,
    request: i.parsed,
    messages: i.messages.map((m) => ({
      from: m.direction === 'out' ? (m.author ?? 'hotel') : 'guest',
      sentAt: m.sentAt,
      body: m.body,
    })),
    roomOptions: (i.suggestion?.options ?? []).map((o) => ({
      roomId: o.roomId,
      roomName: o.roomName,
      roomTypeName: o.roomTypeName,
      total: o.quote.total,
      currency: o.quote.currency,
    })),
    draft: i.suggestion?.draft ?? null,
    note: i.suggestion?.note ?? i.processingError ?? null,
  };
}

function compactBoard(board: HousekeepingBoard) {
  return {
    date: board.date,
    rooms: board.rooms.map((r) => ({
      roomId: r.room.id,
      roomName: r.room.name,
      status: r.room.status,
      occupancy: r.occupancy,
      guestName: r.guestName,
      urgent: r.urgent,
      effort: r.effort,
      cues: r.cues,
      openTasks: r.openTasks.map((t) => ({
        taskId: t.id,
        type: t.type,
        status: t.status,
        notes: t.notes,
      })),
    })),
  };
}

/** What a mutating tool returns: a proposal for the user to confirm, not a result. */
export interface ProposalResult {
  pendingActionId: string;
  summary: string;
  status: 'awaiting_confirmation';
}

function toProposal(action: PendingAction): ProposalResult {
  return { pendingActionId: action.id, summary: action.summary, status: 'awaiting_confirmation' };
}

const bookingIdSchema = z.object({ bookingId: z.string().describe('Booking ID, e.g. "bk_012".') });
const chargeRefSchema = bookingIdSchema.extend({
  chargeId: z.string().describe('The chargeId of an extra on the bill, from getBill.'),
});
const stayGuestRefSchema = bookingIdSchema.extend({
  stayGuestId: z.string().describe('The stayGuestId of a person, from getGuestBook.'),
});
const inquiryIdSchema = z.object({
  inquiryId: z.string().describe('Conversation ID, e.g. "inq_4".'),
});
const dateInputSchema = z.object({
  date: isoDateSchema.optional().describe('Defaults to today.'),
});

/** The names of tools that propose changes instead of executing them. */
export const proposalToolNames = [
  'createHold',
  'confirmBooking',
  'cancelBooking',
  'moveBooking',
  'changeDates',
  'updateBooking',
  'addCharge',
  'recordPayment',
  'checkIn',
  'checkOut',
  'updateCharge',
  'removeCharge',
  'addToGuestBook',
  'updateGuestBook',
  'removeFromGuestBook',
  'updateGuestProfile',
  'adjustRates',
  'saveHotelInfo',
  'removeHotelInfo',
  'sendReply',
  'holdFromConversation',
  'declineConversation',
  'addLocalEvent',
  'removeLocalEvent',
  'updateRoom',
  'saveContact',
  'removeContact',
] as const;

/** Tools that change data straight away: housekeeping is low-risk and reversible (ADR 0006). */
export const directToolNames = [
  'setRoomStatus',
  'createHousekeepingTask',
  'setTaskStatus',
  'recordRepairContact',
] as const;

/** A contact as the model sees it: the ID to use, and how to reach them. */
const compactContact = (c: Contact) => ({
  contactId: c.id,
  name: c.name,
  person: c.person,
  trades: c.trades,
  phone: c.phone,
  email: c.email,
  notes: c.notes,
});

/**
 * Agent tools: thin wrappers over the same domain services the REST API uses. Read tools and
 * housekeeping changes run immediately; every other change returns a pending action for the user
 * to confirm.
 */
export function createAgentTools({
  hotel,
  billing,
  reports,
  actions,
  housekeeping,
  registrations,
  listRooms,
  listRoomTypes,
  rateOutlook,
  relocations,
  inbox,
  draftReply,
  activity,
  getGuest,
  guestBookings,
  listEvents,
  statedAmounts,
  contacts,
}: ToolDeps) {
  const propose = (input: PendingActionInput) =>
    safely(async () => toProposal(await actions.propose(input)));
  const roomName = async (roomId: string) =>
    (await listRooms()).find((r) => r.id === roomId)?.name ?? roomId;

  return {
    listRooms: tool({
      description:
        'List all rooms with their IDs, names, kind, room type (ID and name) and housekeeping status.',
      inputSchema: z.object({}),
      execute: async () => {
        const types = new Map((await listRoomTypes()).map((t) => [t.id, t.name]));
        return (await listRooms()).map((r) => ({
          ...r,
          roomTypeName: types.get(r.roomTypeId) ?? r.roomTypeId,
        }));
      },
    }),
    searchBookings: tool({
      description: 'Find bookings by guest name, room name, date range and/or status.',
      inputSchema: bookingSearchSchema,
      execute: (search) => safely(async () => (await hotel.searchBookings(search)).map(compact)),
    }),
    getBooking: tool({
      description: 'Full details of one booking: guest, room, price breakdown and allowed actions.',
      inputSchema: bookingIdSchema,
      execute: ({ bookingId }) => safely(() => hotel.getBookingDetail(bookingId)),
    }),
    checkAvailability: tool({
      description:
        'Rooms that are free for the whole stay and fit the party, cheapest first, each with its exact total including add-ons. Staff see them as a card with prices and a hold button.',
      inputSchema: roomOptionsQuerySchema.omit({ excludeBookingId: true }),
      execute: (query) => safely(() => hotel.roomOptions(query)),
      toModelOutput: optionsForModel,
    }),
    quote: tool({
      description:
        'Exact price for a stay in a room or room type, with line items. Repeat the lines and total verbatim.',
      inputSchema: quoteInputSchema,
      execute: (input) => safely(() => hotel.quoteStay(input)),
    }),
    getArrivals: tool({
      description: 'Guests arriving on a date.',
      inputSchema: dateInputSchema,
      execute: ({ date }) =>
        safely(async () => (await hotel.getDayOverview(date)).arrivals.map(compact)),
    }),
    getDepartures: tool({
      description: 'Guests leaving on a date.',
      inputSchema: dateInputSchema,
      execute: ({ date }) =>
        safely(async () => (await hotel.getDayOverview(date)).departures.map(compact)),
    }),
    getDailyBrief: tool({
      description:
        'Summary of a day: occupancy tonight, turnovers, rooms to prepare for arrivals, holds needing a decision, broken rooms, open maintenance, arriving or in-house stays still missing IDs in the guest book, unanswered messages and short gaps between stays worth discounting.',
      inputSchema: dateInputSchema,
      execute: ({ date }) => safely(() => hotel.getDailyBrief(date)),
    }),
    createHold: tool({
      description:
        'Propose a hold (tentative booking) for a room. Needs a free room from checkAvailability. The user must confirm.',
      inputSchema: createHoldInputSchema,
      execute: (input) => propose({ kind: 'create_hold', input }),
    }),
    confirmBooking: tool({
      description: 'Propose confirming a hold. The user must confirm.',
      inputSchema: bookingIdSchema,
      execute: (input) => propose({ kind: 'confirm_booking', input }),
    }),
    cancelBooking: tool({
      description: 'Propose cancelling a hold or confirmed booking. The user must confirm.',
      inputSchema: bookingIdSchema,
      execute: (input) => propose({ kind: 'cancel_booking', input }),
    }),
    checkIn: tool({
      description:
        'Propose checking in a guest arriving today. The summary says how many guests still need an ID in the guest book; if any, mention that staff can scan them from the booking, now or later. The user must confirm.',
      inputSchema: bookingIdSchema,
      execute: (input) => propose({ kind: 'check_in', input }),
    }),
    checkOut: tool({
      description:
        'Propose checking out an in-house guest. The summary says what is still due; mention it. The user must confirm.',
      inputSchema: bookingIdSchema,
      execute: (input) => propose({ kind: 'check_out', input }),
    }),
    moveBooking: tool({
      description:
        'Propose moving a booking to another room for the same dates. The user must confirm.',
      inputSchema: bookingIdSchema.extend({
        roomId: z.string().describe('Target room ID, e.g. "rm_201".'),
      }),
      execute: (input) => propose({ kind: 'move_booking', input }),
    }),
    changeDates: tool({
      description:
        'Propose new dates for a booking in the same room, e.g. to extend by a night. The user must confirm.',
      inputSchema: bookingIdSchema.extend({ checkIn: isoDateSchema, checkOut: isoDateSchema }),
      execute: (input) => propose({ kind: 'change_dates', input }),
    }),
    updateBooking: tool({
      description:
        'Propose editing a booking: party (adults, childAges), add-ons (wellness, dogs, extraBeds; send all three), source or notes, and optionally room and dates in the same step. Only send the fields that change. Re-priced when the stay changes. The user must confirm.',
      inputSchema: bookingPatchSchema.extend(bookingIdSchema.shape),
      execute: (input) => propose({ kind: 'update_booking', input }),
    }),
    getReport: tool({
      description:
        'Performance for a period of nights [from, to): occupancy, ADR, RevPAR, room/add-on/extras revenue, city tax, guest nights, arrivals, average stay, cancellations, by booking source and room type, payments by method, departed guests who still owe, and a daily series. Occupancy is a fraction (0.5 = 50%). For "last month" use the first of that month to the first of this month. Compare periods by calling it twice. Repeat figures verbatim.',
      inputSchema: reportQuerySchema,
      execute: (query) =>
        safely(async () => ({
          ...(await reports.getReport(query)),
          currency: (await billing.pricing()).currency,
        })),
      toModelOutput: reportForModel,
    }),
    getRateOutlook: tool({
      description:
        "The next nights with occupancy on the books, how full that weekday usually ends up, the current rate change and the suggested one (percent on top of the season, for every room type) with its reasons: demand, local events and the weather forecast. Also expected no-shows per night and the arrivals of the next week most likely not to come, with why. Suggestions come from the hotel's rules; never work out a rate yourself. Repeat percentages verbatim.",
      inputSchema: z.object({
        days: z.number().int().min(7).max(90).default(30).describe('Nights from tonight.'),
      }),
      execute: ({ days }) => safely(async () => compactOutlook(await rateOutlook(days))),
    }),
    adjustRates: tool({
      description:
        "Propose changing nights' rates by a percent on top of their season, for every room type, e.g. +15 or -10; 0 goes back to the season rate. Use the suggested percents from getRateOutlook unless the user names one. Tonight or later only. The user must confirm.",
      inputSchema: adjustRatesBodySchema,
      execute: (input) => propose({ kind: 'adjust_rates', input }),
    }),
    saveHotelInfo: tool({
      description:
        'Propose saving a note about the hotel in Knowledge, for answering guests later. File it in the folder it belongs in (policies: house rules and terms; rooms: rooms, beds, check-in and check-out; food; wellness: sauna, spa, pool; activities: things to do nearby; getting_here: directions, parking, transport; services: front desk, Wi-Fi and anything else) with two to four short lowercase tags. Use it when staff tell you to remember something, or tell you about a temporary notice such as "the sauna is closed until Friday" (until: its last day, YYYY-MM-DD; null if it always applies). A note with the title of an existing one replaces it: keep what that note says and its tags, and change only what is new. A temporary notice gets its own title, e.g. "Sauna closed", never the title of a lasting entry. Never for room prices, availability or one guest\'s booking. The user must confirm.',
      inputSchema: hotelInfoDraftSchema,
      execute: (input) =>
        propose({ kind: 'save_hotel_info', input: { ...input, source: 'agent' } }),
    }),
    removeHotelInfo: tool({
      description:
        'Propose deleting a note from Knowledge by its exact title, e.g. a notice that no longer applies. The user must confirm.',
      inputSchema: z.object({ title: z.string().describe('The exact title of the note.') }),
      execute: (input) => propose({ kind: 'remove_hotel_info', input }),
    }),
    listConversations: tool({
      description:
        'Guest conversations in the inbox (email and OTAs), latest first, without archived ones: who wrote, what they ask for, where it stands (new, quoted, replied, converted, declined) and the start of the last message.',
      inputSchema: z.object({
        unreadOnly: z.boolean().default(false),
        query: z
          .string()
          .optional()
          .describe('Part of the sender, subject or a message, e.g. a guest name.'),
      }),
      execute: ({ unreadOnly, query }) =>
        safely(async () => {
          const q = query?.trim().toLowerCase();
          return (await inbox.list())
            .filter((i) => !i.archivedAt && (!unreadOnly || i.unread))
            .filter(
              (i) =>
                !q ||
                [i.senderName, i.senderAddress, i.subject, ...i.messages.map((m) => m.body)].some(
                  (t) => t?.toLowerCase().includes(q),
                ),
            )
            .slice(0, 30)
            .map(compactConversation);
        }),
    }),
    getConversation: tool({
      description:
        'One conversation in full: every message, the request as read (dates, party, wishes), the rooms on offer with their exact totals, and the current reply draft.',
      inputSchema: inquiryIdSchema,
      execute: ({ inquiryId }) =>
        safely(async () => conversationDetail(await inbox.get(inquiryId))),
    }),
    draftReply: tool({
      description:
        "Write the reply draft for a conversation, in the guest's language, with the rooms free now and their exact prices; staff also see it in the inbox. Use it before sendReply when a guest asks for a stay or prices, and send its text (edited only as staff ask).",
      inputSchema: inquiryIdSchema,
      execute: ({ inquiryId }) =>
        safely(async () => {
          if (!draftReply) {
            return { error: { code: 'not_configured', message: 'Reply drafts are not set up.' } };
          }
          const { draft, roomOptions, note } = conversationDetail(await draftReply(inquiryId));
          return { inquiryId, draft, roomOptions, note };
        }),
    }),
    sendReply: tool({
      description:
        "Propose sending a reply in a conversation, in the guest's language. Any price in it must be a total from the conversation's room options (getConversation or draftReply). Signed by the staff member who confirms. The user must confirm.",
      inputSchema: replyProposalSchema,
      execute: (input) =>
        safely(async () => {
          const conversation = await inbox.get(input.inquiryId);
          const { unexpected } = checkDraftPrices(
            input.body,
            conversation.suggestion?.options ?? [],
            [...(await statedAmounts()), ...amountsInText(conversation.suggestion?.draft ?? '')],
          );
          if (unexpected.length > 0) {
            return {
              error: {
                code: 'unquoted_price',
                message: `The reply states amounts no quote for this conversation produced (${unexpected.join(', ')}). Use draftReply, or the totals from its room options.`,
              },
            };
          }
          return propose({ kind: 'send_reply', input });
        }),
    }),
    holdFromConversation: tool({
      description:
        "Propose holding a room for a conversation's booking request, for the dates and party it asks for; the hold is linked to the conversation. Use a roomId from its room options. If it already has a hold, that hold moves to this room. The user must confirm.",
      inputSchema: inquiryIdSchema.extend({
        roomId: z.string().describe('Room ID from the room options, e.g. "rm_201".'),
      }),
      execute: (input) => propose({ kind: 'hold_inquiry', input }),
    }),
    declineConversation: tool({
      description:
        "Propose marking a conversation's request as declined, e.g. spam or a stay the hotel can't offer. It sends nothing to the guest. The user must confirm.",
      inputSchema: inquiryIdSchema,
      execute: (input) => propose({ kind: 'decline_inquiry', input }),
    }),
    getActivity: tool({
      description:
        'Who changed what and when, newest first: every change by staff or Orbit. Pass subjectId for one booking, guest, room or conversation (e.g. "who cancelled bk_12?"), or actor "agent" for what Orbit did.',
      inputSchema: z.object({
        subjectId: z.string().optional().describe('A booking, guest, room or conversation ID.'),
        actor: auditActorSchema.optional(),
        limit: z.number().int().min(1).max(50).default(20),
      }),
      execute: (query) =>
        safely(async () =>
          (await activity.list(query)).map((item) => ({
            at: item.createdAt,
            by: item.actor === 'agent' ? 'Orbit' : (item.byName ?? 'staff'),
            action: item.action,
            subject: item.subject?.label ?? item.subjectId,
            subjectId: item.subjectId,
            details: item.payload,
          })),
        ),
    }),
    getGuest: tool({
      description:
        "A guest's profile (email, phone, language, notes) and every stay they booked, newest first.",
      inputSchema: z.object({ guestId: z.string().describe('Guest ID, e.g. "gst_12".') }),
      execute: ({ guestId }) =>
        safely(async () => {
          const guest = await getGuest(guestId);
          if (!guest) throw new DomainError('not_found', `Guest ${guestId} not found`);
          const rooms = new Map((await listRooms()).map((r) => [r.id, r.name]));
          const stays = (await guestBookings(guestId))
            .sort((a, b) => b.checkIn.localeCompare(a.checkIn))
            .map((b) => ({
              bookingId: b.id,
              guestId: guest.id,
              guestName: guest.name,
              roomId: b.roomId,
              roomName: rooms.get(b.roomId) ?? b.roomId,
              checkIn: b.checkIn,
              checkOut: b.checkOut,
              status: b.status,
              total: b.priceSnapshot?.total ?? null,
            }));
          return { ...guest, guestId: guest.id, guestName: guest.name, stays };
        }),
    }),
    getLocalEvents: tool({
      description:
        'Local events that raise or lower demand on the rate outlook, with their IDs, nights and impact.',
      inputSchema: z.object({}),
      execute: () => safely(listEvents),
    }),
    addLocalEvent: tool({
      description:
        'Propose adding a local event (a festival, a race, a trade fair) so the rate outlook weighs it: its first and last night, both included, and its impact on demand. A manager must confirm.',
      inputSchema: localEventBodySchema,
      execute: (input) => propose({ kind: 'add_local_event', input }),
    }),
    removeLocalEvent: tool({
      description:
        'Propose removing a local event by its ID from getLocalEvents. A manager must confirm.',
      inputSchema: z.object({ eventId: z.string() }),
      execute: (input) => propose({ kind: 'remove_local_event', input }),
    }),
    updateRoom: tool({
      description:
        'Propose renaming a room or changing its room type, kind or floor. Send only the fields that change; room types come from listRooms. A manager must confirm.',
      inputSchema: roomBodySchema.partial().extend({ roomId: z.string() }),
      execute: (input) => propose({ kind: 'update_room', input }),
    }),
    getBill: tool({
      description:
        "A booking's bill: stay lines, city tax and extras, payments and refunds, and the balance still owed (negative: owed to the guest). Repeat amounts verbatim.",
      inputSchema: bookingIdSchema,
      execute: ({ bookingId }) => safely(() => billing.getFolio(bookingId)),
    }),
    addCharge: tool({
      description:
        "Propose posting an extra to a confirmed or in-house booking's bill, e.g. sauna, minibar or dinner, at the unit price the staff member gives. Never invent a price: ask if none was given. VAT bracket: reduced for food and accommodation, none for items outside VAT, otherwise standard. The user must confirm.",
      inputSchema: newChargeBodySchema.extend(bookingIdSchema.shape),
      execute: (input) => propose({ kind: 'add_charge', input }),
    }),
    recordPayment: tool({
      description:
        'Propose recording money received for a booking (kind "payment") or paid back (kind "refund"), by cash, card or bank transfer. Use getBill first when the staff member says "the balance" or "the rest". The user must confirm.',
      inputSchema: newPaymentBodySchema.extend(bookingIdSchema.shape),
      execute: (input) => propose({ kind: 'record_payment', input }),
    }),
    updateCharge: tool({
      description:
        "Propose correcting an extra on a booking's bill: its label, quantity, unit price or VAT bracket. Send only what changes. Get the chargeId from getBill. The user must confirm.",
      inputSchema: chargePatchSchema.extend(chargeRefSchema.shape),
      execute: (input) => propose({ kind: 'update_charge', input }),
    }),
    removeCharge: tool({
      description:
        "Propose removing an extra from a booking's bill, e.g. one posted by mistake. Get the chargeId from getBill. Stay lines and city tax are not extras and can't be removed. The user must confirm.",
      inputSchema: chargeRefSchema,
      execute: (input) => propose({ kind: 'remove_charge', input }),
    }),
    getGuestBook: tool({
      description:
        "Everyone staying in a booking's room and what each still needs for the guest book (nationality, date of birth, ID document, home address for guests from abroad). Document numbers and addresses are not shown, only whether they are recorded. For who still needs an ID today across the hotel, use getDailyBrief.",
      inputSchema: bookingIdSchema,
      execute: ({ bookingId }) =>
        safely(async () => compactGuestBook(await registrations.getGuestBook(bookingId))),
    }),
    addToGuestBook: tool({
      description:
        "Propose adding a companion to a booking's guest book, with whatever ID details the staff member gives. Only up to the booking's party size. The user must confirm.",
      inputSchema: newStayGuestBodySchema.omit({ scanId: true }).extend(bookingIdSchema.shape),
      execute: (input) => propose({ kind: 'add_stay_guest', input }),
    }),
    updateGuestBook: tool({
      description:
        "Propose recording or correcting a person's guest-book details: nationality (two-letter code), dateOfBirth, documentType, documentNumber, address, or a companion's name. Send only what the staff member gave; never invent ID details. The country of an ID card or passport is the holder's nationality (a Czech ID card means CZ). The main guest's name is changed with updateGuestProfile. The user must confirm.",
      inputSchema: stayGuestPatchSchema.omit({ scanId: true }).extend(stayGuestRefSchema.shape),
      execute: (input) => propose({ kind: 'update_stay_guest', input }),
    }),
    removeFromGuestBook: tool({
      description:
        "Propose taking a companion off a booking's guest book, e.g. someone who didn't come. The main guest stays. The user must confirm.",
      inputSchema: stayGuestRefSchema,
      execute: (input) => propose({ kind: 'remove_stay_guest', input }),
    }),
    updateGuestProfile: tool({
      description:
        "Propose editing a guest's profile: name, email, phone, language (cs, de, en, pl) or notes such as preferences and allergies. Send only what changes. The guestId comes from searchBookings or getBooking. The user must confirm.",
      inputSchema: guestPatchSchema.extend({
        guestId: z.string().describe('Guest ID, e.g. "gst_012".'),
      }),
      execute: (input) => propose({ kind: 'update_guest', input }),
    }),
    getHousekeeping: tool({
      description:
        "The housekeeping board for today: every room's status (clean, dirty, inspected, out_of_order), whether it is occupied, arriving, leaving or free, the guest, whether it must be ready for an arrival, its cleaning effort (light, standard or heavy; null when nothing is left to clean) with short cues why, and its open tasks with their taskId. Rooms come in the order to clean them.",
      inputSchema: z.object({}),
      execute: () => safely(async () => compactBoard(await housekeeping.board())),
    }),
    setRoomStatus: tool({
      description:
        "Set a room's housekeeping status: clean, dirty, inspected or out_of_order. This takes effect immediately, without a confirm card, and is logged; say that it is done. An out-of-order room must be marked dirty before it can be clean or inspected. For out_of_order the result lists `relocations`: stays still booked in the room, each with a free room (toRoomId) that fits; offer to move them by proposing moveBooking for each, and name any stay with no free room (toRoomId null).",
      inputSchema: z.object({
        roomId: z.string().describe('Room ID, e.g. "rm_104".'),
        status: roomStatusSchema,
      }),
      execute: ({ roomId, status }) =>
        safely(async () => {
          const before = (await listRooms()).find((r) => r.id === roomId);
          const room = await housekeeping.setRoomStatus(roomId, status, 'agent');
          const moves =
            room.status === 'out_of_order' && relocations ? await relocations(room.id) : [];
          const result: AgentRoomStatusResult = {
            done: true,
            roomId: room.id,
            roomName: room.name,
            from: before ? roomStatusSchema.parse(before.status) : room.status,
            status: room.status,
            ...(moves.length > 0 && { relocations: moves }),
          };
          return result;
        }),
    }),
    createHousekeepingTask: tool({
      description:
        'Create a housekeeping task for a room: "maintenance" for something to repair (notes must say what, and trade who fixes it: plumbing, electrical, heating, appliances, internet, locks, pests, building, cleaning or supplies), "turnover" or "stayover" for cleaning. This takes effect immediately, without a confirm card, and is logged; say that it is done. After a repair, offer to find who can fix it with getRepair.',
      inputSchema: newTaskBodySchema,
      execute: (input) =>
        safely(async () => {
          const task = await housekeeping.createTask(input, 'agent');
          const result: AgentTaskCreatedResult = {
            done: true,
            roomName: await roomName(task.roomId),
            task,
          };
          return result;
        }),
    }),
    setTaskStatus: tool({
      description:
        'Move a housekeeping task to open, in_progress or done, e.g. when a repair is finished. The taskId comes from getHousekeeping or getDailyBrief. This takes effect immediately and is logged; say that it is done.',
      inputSchema: z.object({
        taskId: z.string().describe('Task ID, e.g. "hk_012".'),
        status: housekeepingTaskStatusSchema,
      }),
      execute: ({ taskId, status }) =>
        safely(async () => {
          const { status: from } = await housekeeping.getTask(taskId);
          const task = await housekeeping.setTaskStatus(taskId, status, 'agent');
          const result: AgentTaskStatusResult = {
            done: true,
            roomName: await roomName(task.roomId),
            from,
            task,
          };
          return result;
        }),
    }),
    listContacts: tool({
      description:
        "The hotel's suppliers and contractors: their contactId, name, who to ask for, trades (what they fix or supply), phone, email and notes. Pass a trade to list only those.",
      inputSchema: z.object({ trade: tradeSchema.optional() }),
      execute: ({ trade }) =>
        safely(async () =>
          (await contacts.list())
            .filter((c) => !trade || c.trades.includes(trade))
            .map(compactContact),
        ),
    }),
    getRepair: tool({
      description:
        'A repair task with who can fix it: contacts for its trade (the one asked last time first) with their phone and email, who was already asked, and when the room is free to work in (freeFrom to freeUntil; guestName is who stays until freeFrom). The app shows it as a card where staff call or email them, and the email is drafted there, so name the contact and their phone and do not write the email yourself. The taskId comes from getHousekeeping or createHousekeepingTask.',
      inputSchema: z.object({ taskId: z.string().describe('Task ID, e.g. "hk_012".') }),
      execute: ({ taskId }) => safely(() => contacts.repair(taskId)),
    }),
    recordRepairContact: tool({
      description:
        'Record that staff asked a contact to fix a repair, e.g. "I called the plumber about 203": the task moves to in progress with that contact. This takes effect immediately and is logged; say that it is done.',
      inputSchema: z.object({
        taskId: z.string().describe('Task ID, e.g. "hk_012".'),
        contactId: z.string().describe('The contactId, from listContacts or getRepair.'),
      }),
      execute: ({ taskId, contactId }) =>
        safely(async () => {
          const task = await contacts.askToRepair(taskId, contactId, 'agent');
          return { done: true, roomName: await roomName(task.roomId), task };
        }),
    }),
    saveContact: tool({
      description:
        "Propose adding a supplier or contractor (leave out contactId; name and trades are required) or changing one (send its contactId and only the fields that change; an empty string clears a field). language is the language to write to them in (cs, de, en, pl); a new contact gets the hotel's when left out. The user must confirm.",
      inputSchema: contactProposalSchema,
      execute: (input) => propose({ kind: 'save_contact', input }),
    }),
    removeContact: tool({
      description:
        'Propose deleting a supplier or contractor by its contactId from listContacts. The user must confirm.',
      inputSchema: z.object({ contactId: z.string() }),
      execute: (input) => propose({ kind: 'remove_contact', input }),
    }),
  };
}

export type AgentTools = ReturnType<typeof createAgentTools>;
