import {
  type BillingService,
  DomainError,
  type HotelService,
  type HousekeepingService,
  type PendingActionService,
  type RegistrationService,
  type ReportService,
} from '@orbit/domain';
import {
  availabilityQuerySchema,
  type BookingSummary,
  bookingPatchSchema,
  bookingSearchSchema,
  chargePatchSchema,
  createHoldInputSchema,
  type GuestBook,
  guestPatchSchema,
  type HousekeepingBoard,
  housekeepingTaskStatusSchema,
  isoDateSchema,
  newChargeBodySchema,
  newPaymentBodySchema,
  newStayGuestBodySchema,
  newTaskBodySchema,
  type PendingAction,
  type PendingActionInput,
  quoteInputSchema,
  reportQuerySchema,
  roomStatusSchema,
  stayGuestPatchSchema,
} from '@orbit/shared';
import { tool } from 'ai';
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
] as const;

/** Tools that change data straight away: housekeeping is low-risk and reversible (ADR 0006). */
export const directToolNames = [
  'setRoomStatus',
  'createHousekeepingTask',
  'setTaskStatus',
] as const;

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
}: ToolDeps) {
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
        "Propose recording or correcting a person's guest-book details: nationality (two-letter code), dateOfBirth, documentType, documentNumber, address, or a companion's name. Send only what the staff member gave; never invent ID details. The main guest's name is changed with updateGuestProfile. The user must confirm.",
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
        "The housekeeping board for today: every room's status (clean, dirty, inspected, out_of_order), whether it is occupied, arriving, leaving or free, the guest, whether it must be ready for an arrival, and its open tasks with their taskId.",
      inputSchema: z.object({}),
      execute: () => safely(async () => compactBoard(await housekeeping.board())),
    }),
    setRoomStatus: tool({
      description:
        "Set a room's housekeeping status: clean, dirty, inspected or out_of_order. This takes effect immediately, without a confirm card, and is logged; say that it is done. An out-of-order room must be marked dirty before it can be clean or inspected.",
      inputSchema: z.object({
        roomId: z.string().describe('Room ID, e.g. "rm_104".'),
        status: roomStatusSchema,
      }),
      execute: ({ roomId, status }) =>
        safely(async () => {
          const room = await housekeeping.setRoomStatus(roomId, status, 'agent');
          return { done: true, roomId: room.id, roomName: room.name, status: room.status };
        }),
    }),
    createHousekeepingTask: tool({
      description:
        'Create a housekeeping task for a room: "maintenance" for something to repair (notes must say what), "turnover" or "stayover" for cleaning. This takes effect immediately, without a confirm card, and is logged; say that it is done.',
      inputSchema: newTaskBodySchema,
      execute: (input) =>
        safely(async () => ({
          done: true,
          task: await housekeeping.createTask(input, 'agent'),
        })),
    }),
    setTaskStatus: tool({
      description:
        'Move a housekeeping task to open, in_progress or done, e.g. when a repair is finished. The taskId comes from getHousekeeping or getDailyBrief. This takes effect immediately and is logged; say that it is done.',
      inputSchema: z.object({
        taskId: z.string().describe('Task ID, e.g. "hk_012".'),
        status: housekeepingTaskStatusSchema,
      }),
      execute: ({ taskId, status }) =>
        safely(async () => ({
          done: true,
          task: await housekeeping.setTaskStatus(taskId, status, 'agent'),
        })),
    }),
  };
}

export type AgentTools = ReturnType<typeof createAgentTools>;
