import type {
  AuditLogEntry,
  Booking,
  Charge,
  Guest,
  HotelProfile,
  HousekeepingTask,
  IdScan,
  Inquiry,
  LocalEvent,
  PendingAction,
  Payment,
  PricingConfig,
  Room,
  RoomType,
  SavedStayReading,
  StaffMember,
  StayGuest,
} from '@orbit/shared';
import { rangesOverlap } from './dates';
import type { BillingFilter, Repositories } from './repositories';

/**
 * A conversation that started with one message from the guest, for tests. `body` is that
 * message; anything else can be overridden.
 */
export function conversation(overrides: Partial<Inquiry> & { id: string; body?: string }): Inquiry {
  const { body = 'Do you have a room?', ...rest } = overrides;
  const receivedAt = rest.receivedAt ?? '2026-05-09T10:00:00.000Z';
  return {
    channel: 'email',
    partner: null,
    subject: null,
    senderName: null,
    senderAddress: null,
    receivedAt,
    lastMessageAt: receivedAt,
    messages: [
      {
        id: `msg_${rest.id}`,
        inquiryId: rest.id,
        direction: 'in',
        body,
        sentAt: receivedAt,
        author: null,
        translation: null,
      },
    ],
    unread: true,
    archivedAt: null,
    parsed: null,
    suggestion: null,
    status: 'new',
    bookingId: null,
    processedAt: null,
    processingError: null,
    ...rest,
  };
}

export interface MemoryState {
  roomTypes: RoomType[];
  rooms: Room[];
  guests: Guest[];
  bookings: Booking[];
  audit: AuditLogEntry[];
  inquiries: Inquiry[];
  pendingActions: PendingAction[];
  tasks: HousekeepingTask[];
  profile: HotelProfile | null;
  pricing: PricingConfig | null;
  staff: StaffMember[];
  charges: Charge[];
  payments: Payment[];
  stayGuests: StayGuest[];
  idScans: IdScan[];
  stayReadings: SavedStayReading[];
  events: LocalEvent[];
}

function inBilling<T extends { bookingId: string }>(
  item: T,
  day: string,
  { bookingId, from, to }: BillingFilter,
): boolean {
  return (
    (!bookingId || item.bookingId === bookingId) && (!from || day >= from) && (!to || day < to)
  );
}

// State is plain JSON, so a JSON round-trip is a full deep copy.
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/**
 * In-memory repositories for tests. `transaction` rolls state back if the callback throws.
 */
export function createMemoryRepositories(
  initial: Partial<MemoryState> = {},
  now: () => Date = () => new Date(),
): Repositories & { state: MemoryState } {
  const state: MemoryState = {
    roomTypes: [],
    rooms: [],
    guests: [],
    bookings: [],
    audit: [],
    inquiries: [],
    pendingActions: [],
    tasks: [],
    profile: null,
    pricing: null,
    staff: [],
    charges: [],
    payments: [],
    stayGuests: [],
    idScans: [],
    stayReadings: [],
    events: [],
    ...clone(initial),
  };

  const repos: Repositories & { state: MemoryState } = {
    state,
    rooms: {
      listRoomTypes: () => Promise.resolve([...state.roomTypes]),
      listRooms: () => Promise.resolve([...state.rooms]),
      getRoom: (id) => Promise.resolve(state.rooms.find((r) => r.id === id) ?? null),
      // In memory every step runs to completion, so there is nothing to lock.
      lockRoom: () => Promise.resolve(),
      setRoomStatus: (id, status) => {
        state.rooms = state.rooms.map((r) => (r.id === id ? { ...r, status } : r));
        return Promise.resolve();
      },
      createRoomType: (roomType) => {
        state.roomTypes.push(roomType);
        return Promise.resolve();
      },
      updateRoomType: (roomType) => {
        state.roomTypes = state.roomTypes.map((t) => (t.id === roomType.id ? roomType : t));
        return Promise.resolve();
      },
      createRoom: (room) => {
        state.rooms.push(room);
        return Promise.resolve();
      },
      updateRoom: (room) => {
        state.rooms = state.rooms.map((r) => (r.id === room.id ? room : r));
        return Promise.resolve();
      },
    },
    bookings: {
      listBookings: (filter = {}) =>
        Promise.resolve(
          state.bookings.filter(
            (b) =>
              (!filter.from ||
                !filter.to ||
                rangesOverlap(b, { checkIn: filter.from, checkOut: filter.to })) &&
              (!filter.status || filter.status.includes(b.status)) &&
              (!filter.guestId || b.guestId === filter.guestId) &&
              (!filter.roomId || b.roomId === filter.roomId),
          ),
        ),
      getBooking: (id) => Promise.resolve(state.bookings.find((b) => b.id === id) ?? null),
      createBooking: (booking) => {
        state.bookings.push(booking);
        return Promise.resolve();
      },
      updateBooking: (booking) => {
        state.bookings = state.bookings.map((b) => (b.id === booking.id ? booking : b));
        return Promise.resolve();
      },
    },
    guests: {
      listGuests: () => Promise.resolve([...state.guests]),
      getGuest: (id) => Promise.resolve(state.guests.find((g) => g.id === id) ?? null),
      createGuest: (guest) => {
        state.guests.push(guest);
        return Promise.resolve();
      },
      updateGuest: (guest) => {
        state.guests = state.guests.map((g) => (g.id === guest.id ? guest : g));
        return Promise.resolve();
      },
    },
    audit: {
      append: (entry) => {
        const saved = {
          ...entry,
          id: `audit_${state.audit.length + 1}`,
          createdAt: now().toISOString(),
        };
        state.audit.push(saved);
        return Promise.resolve(saved);
      },
      list: ({ subjectId, actor, limit = 50 } = {}) =>
        Promise.resolve(
          state.audit
            .filter(
              (e) => (!subjectId || e.subjectId === subjectId) && (!actor || e.actor === actor),
            )
            .reverse()
            .slice(0, limit),
        ),
    },
    inquiries: {
      listInquiries: () =>
        Promise.resolve(
          [...state.inquiries].sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt)),
        ),
      getInquiry: (id) => Promise.resolve(state.inquiries.find((i) => i.id === id) ?? null),
      createInquiry: (inquiry) => {
        state.inquiries.push(inquiry);
        return Promise.resolve();
      },
      updateInquiry: (inquiry) => {
        // Messages are stored by addMessage and updateMessage, as in the database.
        state.inquiries = state.inquiries.map((i) =>
          i.id === inquiry.id ? { ...inquiry, messages: i.messages } : i,
        );
        return Promise.resolve();
      },
      addMessage: (message) => {
        state.inquiries = state.inquiries.map((i) =>
          i.id === message.inquiryId ? { ...i, messages: [...i.messages, message] } : i,
        );
        return Promise.resolve();
      },
      updateMessage: (message) => {
        state.inquiries = state.inquiries.map((i) =>
          i.id === message.inquiryId
            ? { ...i, messages: i.messages.map((m) => (m.id === message.id ? message : m)) }
            : i,
        );
        return Promise.resolve();
      },
    },
    pendingActions: {
      create: (action) => {
        state.pendingActions.push(action);
        return Promise.resolve();
      },
      get: (id) => Promise.resolve(state.pendingActions.find((a) => a.id === id) ?? null),
      update: (action) => {
        state.pendingActions = state.pendingActions.map((a) => (a.id === action.id ? action : a));
        return Promise.resolve();
      },
      resolveIfPending: (action) => {
        const stored = state.pendingActions.find((a) => a.id === action.id);
        if (stored?.status !== 'pending') return Promise.resolve(false);
        state.pendingActions = state.pendingActions.map((a) => (a.id === action.id ? action : a));
        return Promise.resolve(true);
      },
    },
    housekeeping: {
      listTasks: (filter = {}) =>
        Promise.resolve(
          state.tasks
            .filter(
              (t) =>
                (!filter.roomId || t.roomId === filter.roomId) &&
                (!filter.status || filter.status.includes(t.status)),
            )
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
        ),
      getTask: (id) => Promise.resolve(state.tasks.find((t) => t.id === id) ?? null),
      createTask: (task) => {
        state.tasks.push(task);
        return Promise.resolve();
      },
      updateTask: (task) => {
        state.tasks = state.tasks.map((t) => (t.id === task.id ? task : t));
        return Promise.resolve();
      },
    },
    settings: {
      getProfile: () => Promise.resolve(state.profile && clone(state.profile)),
      saveProfile: (profile) => {
        state.profile = clone(profile);
        return Promise.resolve();
      },
      getPricing: () => Promise.resolve(state.pricing && clone(state.pricing)),
      savePricing: (pricing) => {
        state.pricing = clone(pricing);
        return Promise.resolve();
      },
    },
    staff: {
      list: () =>
        Promise.resolve(
          [...state.staff].sort(
            (a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name),
          ),
        ),
      get: (id) => Promise.resolve(state.staff.find((s) => s.id === id) ?? null),
      create: (member) => {
        state.staff.push(member);
        return Promise.resolve();
      },
      update: (member) => {
        state.staff = state.staff.map((s) => (s.id === member.id ? member : s));
        return Promise.resolve();
      },
    },
    billing: {
      listCharges: (filter = {}) =>
        Promise.resolve(state.charges.filter((c) => inBilling(c, c.postedOn, filter))),
      getCharge: (id) => Promise.resolve(state.charges.find((c) => c.id === id) ?? null),
      createCharge: (charge) => {
        state.charges.push(charge);
        return Promise.resolve();
      },
      updateCharge: (charge) => {
        state.charges = state.charges.map((c) => (c.id === charge.id ? charge : c));
        return Promise.resolve();
      },
      deleteCharge: (id) => {
        state.charges = state.charges.filter((c) => c.id !== id);
        return Promise.resolve();
      },
      listPayments: (filter = {}) =>
        Promise.resolve(state.payments.filter((p) => inBilling(p, p.paidOn, filter))),
      createPayment: (payment) => {
        state.payments.push(payment);
        return Promise.resolve();
      },
    },
    stayGuests: {
      listByBooking: (bookingId) =>
        Promise.resolve(
          state.stayGuests
            .filter((s) => s.bookingId === bookingId)
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
        ),
      latestRegistered: (guestId, exceptBookingId) =>
        Promise.resolve(
          state.stayGuests
            .filter(
              (s) =>
                s.guestId === guestId && s.bookingId !== exceptBookingId && s.registeredAt !== null,
            )
            .sort((a, b) => b.registeredAt!.localeCompare(a.registeredAt!))[0] ?? null,
        ),
      save: (stayGuest) => {
        state.stayGuests = [...state.stayGuests.filter((s) => s.id !== stayGuest.id), stayGuest];
        return Promise.resolve();
      },
      delete: (id) => {
        state.stayGuests = state.stayGuests.filter((s) => s.id !== id);
        return Promise.resolve();
      },
    },
    idScans: {
      get: (id) => Promise.resolve(state.idScans.find((s) => s.id === id) ?? null),
      save: (scan) => {
        state.idScans = [...state.idScans.filter((s) => s.id !== scan.id), scan];
        return Promise.resolve();
      },
      delete: (id) => {
        state.idScans = state.idScans.filter((s) => s.id !== id);
        return Promise.resolve();
      },
      deleteExpired: (at) => {
        state.idScans = state.idScans.filter((s) => s.expiresAt > at);
        return Promise.resolve();
      },
    },
    stayReadings: {
      list: (ids) => Promise.resolve(state.stayReadings.filter((r) => ids.includes(r.bookingId))),
      save: (reading) => {
        state.stayReadings = [
          ...state.stayReadings.filter((r) => r.bookingId !== reading.bookingId),
          reading,
        ];
        return Promise.resolve();
      },
    },
    events: {
      list: () =>
        Promise.resolve([...state.events].sort((a, b) => a.firstNight.localeCompare(b.firstNight))),
      create: (event) => {
        state.events.push(event);
        return Promise.resolve();
      },
      delete: (id) => {
        state.events = state.events.filter((e) => e.id !== id);
        return Promise.resolve();
      },
    },
    async transaction(fn) {
      const snapshot = clone({ ...state });
      try {
        return await fn(repos);
      } catch (err) {
        Object.assign(state, snapshot);
        throw err;
      }
    },
  };
  return repos;
}
