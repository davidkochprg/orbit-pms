import { randomUUID } from 'node:crypto';
import type {
  AuditRepository,
  BookingFilter,
  BookingRepository,
  GuestRepository,
  InquiryRepository,
  PendingActionRepository,
  Repositories,
  RoomRepository,
} from '@orbit/domain';
import {
  type AuditLogEntry,
  type Booking,
  type Inquiry,
  type PendingAction,
  pendingActionSchema,
} from '@orbit/shared';
import { and, asc, desc, eq, gt, inArray, lt, type SQL } from 'drizzle-orm';
import type { Db } from './client';
import { auditLog, bookings, guests, inquiries, pendingActions, rooms, roomTypes } from './schema';

type BookingRow = typeof bookings.$inferSelect;
type AuditRow = typeof auditLog.$inferSelect;

function toBooking({ createdAt: _, holdExpiresAt, ...row }: BookingRow): Booking {
  return { ...row, holdExpiresAt: holdExpiresAt?.toISOString() ?? null };
}

function toAuditEntry({ seq: _, ...row }: AuditRow): AuditLogEntry {
  return { ...row, createdAt: row.createdAt.toISOString() };
}

function roomRepository(db: Db): RoomRepository {
  return {
    listRoomTypes: () => db.select().from(roomTypes).orderBy(asc(roomTypes.id)),
    listRooms: () => db.select().from(rooms).orderBy(asc(rooms.floor), asc(rooms.name)),
    async getRoom(id) {
      const [row] = await db.select().from(rooms).where(eq(rooms.id, id));
      return row ?? null;
    },
    async setRoomStatus(id, status) {
      await db.update(rooms).set({ status }).where(eq(rooms.id, id));
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
    async createBooking({ holdExpiresAt, ...booking }) {
      await db
        .insert(bookings)
        .values({ ...booking, holdExpiresAt: holdExpiresAt ? new Date(holdExpiresAt) : null });
    },
    async updateBooking({ id, holdExpiresAt, ...booking }) {
      await db
        .update(bookings)
        .set({ ...booking, holdExpiresAt: holdExpiresAt ? new Date(holdExpiresAt) : null })
        .where(eq(bookings.id, id));
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
    async createGuest(guest) {
      await db.insert(guests).values(guest);
    },
  };
}

function auditRepository(db: Db): AuditRepository {
  return {
    async append(entry) {
      const [row] = await db
        .insert(auditLog)
        .values({ id: `audit_${randomUUID()}`, ...entry })
        .returning();
      if (!row) throw new Error('Audit insert returned no row');
      return toAuditEntry(row);
    },
    async list({ subjectId, limit = 50 } = {}) {
      const rows = await db
        .select()
        .from(auditLog)
        .where(subjectId ? eq(auditLog.subjectId, subjectId) : undefined)
        .orderBy(desc(auditLog.seq))
        .limit(limit);
      return rows.map(toAuditEntry);
    },
  };
}

type InquiryRow = typeof inquiries.$inferSelect;

function toInquiry(row: InquiryRow): Inquiry {
  return {
    ...row,
    receivedAt: row.receivedAt.toISOString(),
    processedAt: row.processedAt?.toISOString() ?? null,
  };
}

function toInquiryRow(inquiry: Inquiry): InquiryRow {
  return {
    ...inquiry,
    receivedAt: new Date(inquiry.receivedAt),
    processedAt: inquiry.processedAt ? new Date(inquiry.processedAt) : null,
  };
}

function inquiryRepository(db: Db): InquiryRepository {
  return {
    async listInquiries() {
      const rows = await db.select().from(inquiries).orderBy(desc(inquiries.receivedAt));
      return rows.map(toInquiry);
    },
    async getInquiry(id) {
      const [row] = await db.select().from(inquiries).where(eq(inquiries.id, id));
      return row ? toInquiry(row) : null;
    },
    async createInquiry(inquiry) {
      await db.insert(inquiries).values(toInquiryRow(inquiry));
    },
    async updateInquiry(inquiry) {
      const { id, ...row } = toInquiryRow(inquiry);
      await db.update(inquiries).set(row).where(eq(inquiries.id, id));
    },
  };
}

type PendingRow = typeof pendingActions.$inferSelect;

function toPendingAction(row: PendingRow): PendingAction {
  // Validated on read: kind and input are stored as separate columns.
  return pendingActionSchema.parse({
    ...row,
    createdAt: row.createdAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
  });
}

function toPendingRow(action: PendingAction): PendingRow {
  return {
    id: action.id,
    kind: action.kind,
    input: action.input,
    summary: action.summary,
    status: action.status,
    bookingId: action.bookingId,
    error: action.error,
    createdAt: new Date(action.createdAt),
    resolvedAt: action.resolvedAt ? new Date(action.resolvedAt) : null,
  };
}

function pendingActionRepository(db: Db): PendingActionRepository {
  return {
    async create(action) {
      await db.insert(pendingActions).values(toPendingRow(action));
    },
    async get(id) {
      const [row] = await db.select().from(pendingActions).where(eq(pendingActions.id, id));
      return row ? toPendingAction(row) : null;
    },
    async update(action) {
      const { id, ...row } = toPendingRow(action);
      await db.update(pendingActions).set(row).where(eq(pendingActions.id, id));
    },
  };
}

export function createRepositories(db: Db): Repositories {
  return {
    rooms: roomRepository(db),
    bookings: bookingRepository(db),
    guests: guestRepository(db),
    audit: auditRepository(db),
    inquiries: inquiryRepository(db),
    pendingActions: pendingActionRepository(db),
    transaction: (fn) => db.transaction((tx) => fn(createRepositories(tx))),
  };
}
