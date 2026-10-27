import type { AuditLogEntry, Booking, Guest, Room, RoomType } from '@orbit/shared';
import { rangesOverlap } from './dates';
import type { Repositories } from './repositories';

export interface MemoryState {
  roomTypes: RoomType[];
  rooms: Room[];
  guests: Guest[];
  bookings: Booking[];
  audit: AuditLogEntry[];
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
      updateBooking: (booking) => {
        state.bookings = state.bookings.map((b) => (b.id === booking.id ? booking : b));
        return Promise.resolve();
      },
    },
    guests: {
      listGuests: () => Promise.resolve([...state.guests]),
      getGuest: (id) => Promise.resolve(state.guests.find((g) => g.id === id) ?? null),
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
      list: ({ subjectId, limit = 50 } = {}) =>
        Promise.resolve(
          state.audit
            .filter((e) => !subjectId || e.subjectId === subjectId)
            .reverse()
            .slice(0, limit),
        ),
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
