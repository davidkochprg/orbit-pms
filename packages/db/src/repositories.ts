import type {
  BookingFilter,
  BookingRepository,
  GuestRepository,
  Repositories,
  RoomRepository,
} from '@orbit/domain';
import type { Booking } from '@orbit/shared';
import { and, asc, eq, gt, inArray, lt, type SQL } from 'drizzle-orm';
import type { Db } from './client';
import { bookings, guests, rooms, roomTypes } from './schema';

type BookingRow = typeof bookings.$inferSelect;

function toBooking({ createdAt: _, holdExpiresAt, ...row }: BookingRow): Booking {
  return { ...row, holdExpiresAt: holdExpiresAt?.toISOString() ?? null };
}

function roomRepository(db: Db): RoomRepository {
  return {
    listRoomTypes: () => db.select().from(roomTypes).orderBy(asc(roomTypes.id)),
    listRooms: () => db.select().from(rooms).orderBy(asc(rooms.floor), asc(rooms.name)),
    async getRoom(id) {
      const [row] = await db.select().from(rooms).where(eq(rooms.id, id));
      return row ?? null;
    },
  };
}

function bookingRepository(db: Db): BookingRepository {
  return {
    async listBookings(filter: BookingFilter = {}) {
      const where: SQL[] = [];
      if (filter.to) where.push(lt(bookings.checkIn, filter.to));
      if (filter.from) where.push(gt(bookings.checkOut, filter.from));
      if (filter.status?.length) where.push(inArray(bookings.status, filter.status));
      if (filter.guestId) where.push(eq(bookings.guestId, filter.guestId));
      if (filter.roomId) where.push(eq(bookings.roomId, filter.roomId));
      const rows = await db
        .select()
        .from(bookings)
        .where(and(...where))
        .orderBy(asc(bookings.checkIn), asc(bookings.roomId));
      return rows.map(toBooking);
    },
    async getBooking(id) {
      const [row] = await db.select().from(bookings).where(eq(bookings.id, id));
      return row ? toBooking(row) : null;
    },
  };
}

function guestRepository(db: Db): GuestRepository {
  return {
    async listGuests() {
      const rows = await db.select().from(guests).orderBy(asc(guests.name));
      return rows.map(({ createdAt: _, ...g }) => g);
    },
    async getGuest(id) {
      const [row] = await db.select().from(guests).where(eq(guests.id, id));
      if (!row) return null;
      const { createdAt: _, ...guest } = row;
      return guest;
    },
  };
}

export function createRepositories(db: Db): Repositories {
  return {
    rooms: roomRepository(db),
    bookings: bookingRepository(db),
    guests: guestRepository(db),
  };
}
