import type {
  AuditLogEntry,
  Booking,
  Charge,
  Guest,
  HotelProfile,
  HousekeepingTask,
  Inquiry,
  PendingAction,
  Payment,
  PricingConfig,
  Registration,
  Room,
  RoomType,
  StaffMember,
} from '@orbit/shared';
import { rangesOverlap } from './dates';
import type { BillingFilter, Repositories } from './repositories';

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
  registrations: Registration[];
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
    registrations: [],
    ...clone(initial),
  };

  const repos: Repositories & { state: MemoryState } = {
    state,
    rooms: {
      listRoomTypes: () => Promise.resolve([...state.roomTypes]),
      listRooms: () => Promise.resolve([...state.rooms]),
      getRoom: (id) => Promise.resolve(state.rooms.find((r) => r.id === id) ?? null),
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
          [...state.inquiries].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt)),
        ),
      getInquiry: (id) => Promise.resolve(state.inquiries.find((i) => i.id === id) ?? null),
      createInquiry: (inquiry) => {
        state.inquiries.push(inquiry);
        return Promise.resolve();
      },
      updateInquiry: (inquiry) => {
        state.inquiries = state.inquiries.map((i) => (i.id === inquiry.id ? inquiry : i));
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
    registrations: {
      get: (bookingId) =>
        Promise.resolve(state.registrations.find((r) => r.bookingId === bookingId) ?? null),
      listByGuest: (guestId) =>
        Promise.resolve(
          state.registrations
            .filter((r) => r.guestId === guestId)
            .sort((a, b) => b.registeredAt.localeCompare(a.registeredAt)),
        ),
      save: (registration) => {
        state.registrations = [
          ...state.registrations.filter((r) => r.bookingId !== registration.bookingId),
          registration,
        ];
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
