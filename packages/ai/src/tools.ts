import {
  type BillingService,
  DomainError,
  type HotelService,
  type PendingActionService,
  type ReportService,
} from '@orbit/domain';
import {
  availabilityQuerySchema,
  type BookingSummary,
  bookingPatchSchema,
  bookingSearchSchema,
  createHoldInputSchema,
  isoDateSchema,
  newChargeBodySchema,
  newPaymentBodySchema,
  type PendingAction,
  type PendingActionInput,
  quoteInputSchema,
  reportQuerySchema,
} from '@orbit/shared';
import { tool } from 'ai';
import { z } from 'zod';

export interface ToolDeps {
  hotel: HotelService;
  billing: BillingService;
  reports: ReportService;
  actions: PendingActionService;
  /** Lists rooms with their IDs, so names like "104" can be resolved. */
  listRooms: () => Promise<
    { id: string; name: string; kind: string; roomTypeId: string; status: string }[]
  >;
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

function compact(s: BookingSummary) {
  const b = s.booking;
  return {
    bookingId: b.id,
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
] as const;

/**
 * Agent tools: thin wrappers over the same domain service the REST API uses. Read tools run
 * immediately; mutating tools return a pending action for the user to confirm.
 */
export function createAgentTools({ hotel, billing, reports, actions, listRooms }: ToolDeps) {
  const propose = (input: PendingActionInput) =>
    safely(async () => toProposal(await actions.propose(input)));

  return {
    listRooms: tool({
      description: 'List all rooms with their IDs, names, kind, room type and housekeeping status.',
      inputSchema: z.object({}),
      execute: () => listRooms(),
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
      description: 'Rooms that are free for the whole stay and fit the party, cheapest first.',
      inputSchema: availabilityQuerySchema,
      execute: (query) => safely(() => hotel.findAvailableRooms(query)),
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
        'Summary of a day: occupancy tonight, turnovers, rooms to prepare for arrivals, holds needing a decision, broken rooms, open maintenance, unanswered messages and short gaps between stays worth discounting.',
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
        safely(async () => {
          // The daily series is for charts; the model gets the totals and slices.
          const { days: _, ...report } = await reports.getReport(query);
          return report;
        }),
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
  };
}

export type AgentTools = ReturnType<typeof createAgentTools>;
