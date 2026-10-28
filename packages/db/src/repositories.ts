import { randomUUID } from 'node:crypto';
import type {
  AuditRepository,
  BillingFilter,
  BillingRepository,
  BookingFilter,
  BookingRepository,
  GuestRepository,
  HousekeepingRepository,
  InquiryRepository,
  PendingActionRepository,
  IdScanRepository,
  StayGuestRepository,
  Repositories,
  RoomRepository,
  SettingsRepository,
  StaffRepository,
} from '@orbit/domain';
import {
  type AuditLogEntry,
  type Booking,
  type Charge,
  hotelProfileSchema,
  type HousekeepingTask,
  type Inquiry,
  type PendingAction,
  type Payment,
  type IdScan,
  type StayGuest,
  pendingActionSchema,
  pricingConfigSchema,
} from '@orbit/shared';
import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  lt,
  lte,
  ne,
  type SQL,
} from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import type { Db } from './client';
import {
  auditLog,
  bookings,
  charges,
  guests,
  hotelProfile,
  housekeepingTasks,
  inquiries,
  payments,
  pendingActions,
  pricing,
  idScans,
  stayGuests,
  rooms,
  roomTypes,
  staff,
} from './schema';

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
    async createRoomType(roomType) {
      await db.insert(roomTypes).values(roomType);
    },
    async updateRoomType({ id, ...roomType }) {
      await db.update(roomTypes).set(roomType).where(eq(roomTypes.id, id));
    },
    async createRoom(room) {
      await db.insert(rooms).values(room);
    },
    async updateRoom({ id, ...room }) {
      await db.update(rooms).set(room).where(eq(rooms.id, id));
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
    async updateGuest({ id, ...guest }) {
      await db.update(guests).set(guest).where(eq(guests.id, id));
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
    async list({ subjectId, actor, limit = 50 } = {}) {
      const rows = await db
        .select()
        .from(auditLog)
        .where(
          and(
            subjectId ? eq(auditLog.subjectId, subjectId) : undefined,
            actor ? eq(auditLog.actor, actor) : undefined,
          ),
        )
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

type TaskRow = typeof housekeepingTasks.$inferSelect;

function toTask(row: TaskRow): HousekeepingTask {
  return { ...row, createdAt: row.createdAt.toISOString() };
}

function housekeepingRepository(db: Db): HousekeepingRepository {
  return {
    async listTasks(filter = {}) {
      const where: SQL[] = [];
      if (filter.roomId) where.push(eq(housekeepingTasks.roomId, filter.roomId));
      if (filter.status) where.push(inArray(housekeepingTasks.status, filter.status));
      const rows = await db
        .select()
        .from(housekeepingTasks)
        .where(and(...where))
        .orderBy(asc(housekeepingTasks.createdAt), asc(housekeepingTasks.id));
      return rows.map(toTask);
    },
    async getTask(id) {
      const [row] = await db.select().from(housekeepingTasks).where(eq(housekeepingTasks.id, id));
      return row ? toTask(row) : null;
    },
    async createTask(task) {
      await db.insert(housekeepingTasks).values({ ...task, createdAt: new Date(task.createdAt) });
    },
    async updateTask({ id, ...task }) {
      await db
        .update(housekeepingTasks)
        .set({ ...task, createdAt: new Date(task.createdAt) })
        .where(eq(housekeepingTasks.id, id));
    },
  };
}

function staffRepository(db: Db): StaffRepository {
  const columns = {
    id: staff.id,
    name: staff.name,
    email: staff.email,
    role: staff.role,
    active: staff.active,
  };
  return {
    list: () => db.select(columns).from(staff).orderBy(desc(staff.active), asc(staff.name)),
    async get(id) {
      const [row] = await db.select(columns).from(staff).where(eq(staff.id, id));
      return row ?? null;
    },
    async create(member) {
      await db.insert(staff).values(member);
    },
    async update({ id, ...member }) {
      await db.update(staff).set(member).where(eq(staff.id, id));
    },
  };
}

const PROFILE_ID = 'hotel';
const PRICING_ID = 'hotel';

function settingsRepository(db: Db): SettingsRepository {
  return {
    async getProfile() {
      const [row] = await db.select().from(hotelProfile).where(eq(hotelProfile.id, PROFILE_ID));
      // Validated on read: the column is plain JSON and the prompts are built from it.
      return row ? hotelProfileSchema.parse(row.profile) : null;
    },
    async saveProfile(profile) {
      await db
        .insert(hotelProfile)
        .values({ id: PROFILE_ID, profile })
        .onConflictDoUpdate({
          target: hotelProfile.id,
          set: { profile, updatedAt: new Date() },
        });
    },
    async getPricing() {
      const [row] = await db.select().from(pricing).where(eq(pricing.id, PRICING_ID));
      // Validated on read, like the profile: every quote is computed from it.
      return row ? pricingConfigSchema.parse(row.config) : null;
    },
    async savePricing(config) {
      await db
        .insert(pricing)
        .values({ id: PRICING_ID, config })
        .onConflictDoUpdate({ target: pricing.id, set: { config, updatedAt: new Date() } });
    },
  };
}

function toCharge({ createdAt, ...row }: typeof charges.$inferSelect): Charge {
  return { ...row, createdAt: createdAt.toISOString() };
}

function toPayment({ createdAt, ...row }: typeof payments.$inferSelect): Payment {
  return { ...row, createdAt: createdAt.toISOString() };
}

function billingRepository(db: Db): BillingRepository {
  function where(filter: BillingFilter, columns: { bookingId: PgColumn; day: PgColumn }) {
    const parts: SQL[] = [];
    if (filter.bookingId) parts.push(eq(columns.bookingId, filter.bookingId));
    if (filter.from) parts.push(gte(columns.day, filter.from));
    if (filter.to) parts.push(lt(columns.day, filter.to));
    return and(...parts);
  }

  return {
    async listCharges(filter = {}) {
      const rows = await db
        .select()
        .from(charges)
        .where(where(filter, { bookingId: charges.bookingId, day: charges.postedOn }))
        .orderBy(asc(charges.createdAt), asc(charges.id));
      return rows.map(toCharge);
    },
    async getCharge(id) {
      const [row] = await db.select().from(charges).where(eq(charges.id, id));
      return row ? toCharge(row) : null;
    },
    async createCharge(charge) {
      await db.insert(charges).values({ ...charge, createdAt: new Date(charge.createdAt) });
    },
    async updateCharge({ id, createdAt: _createdAt, ...charge }) {
      await db.update(charges).set(charge).where(eq(charges.id, id));
    },
    async deleteCharge(id) {
      await db.delete(charges).where(eq(charges.id, id));
    },
    async listPayments(filter = {}) {
      const rows = await db
        .select()
        .from(payments)
        .where(where(filter, { bookingId: payments.bookingId, day: payments.paidOn }))
        .orderBy(asc(payments.createdAt), asc(payments.id));
      return rows.map(toPayment);
    },
    async createPayment(payment) {
      await db.insert(payments).values({ ...payment, createdAt: new Date(payment.createdAt) });
    },
  };
}

function toStayGuest({
  registeredAt,
  createdAt,
  ...row
}: typeof stayGuests.$inferSelect): StayGuest {
  return {
    ...row,
    registeredAt: registeredAt?.toISOString() ?? null,
    createdAt: createdAt.toISOString(),
  };
}

function stayGuestRepository(db: Db): StayGuestRepository {
  return {
    async listByBooking(bookingId) {
      const rows = await db
        .select()
        .from(stayGuests)
        .where(eq(stayGuests.bookingId, bookingId))
        .orderBy(asc(stayGuests.createdAt), asc(stayGuests.id));
      return rows.map(toStayGuest);
    },
    async latestRegistered(guestId, exceptBookingId) {
      const [row] = await db
        .select()
        .from(stayGuests)
        .where(
          and(
            eq(stayGuests.guestId, guestId),
            ne(stayGuests.bookingId, exceptBookingId),
            isNotNull(stayGuests.registeredAt),
          ),
        )
        .orderBy(desc(stayGuests.registeredAt))
        .limit(1);
      return row ? toStayGuest(row) : null;
    },
    async save(stayGuest) {
      const row = {
        ...stayGuest,
        registeredAt: stayGuest.registeredAt ? new Date(stayGuest.registeredAt) : null,
        createdAt: new Date(stayGuest.createdAt),
      };
      await db
        .insert(stayGuests)
        .values(row)
        .onConflictDoUpdate({ target: stayGuests.id, set: row });
    },
    async delete(id) {
      await db.delete(stayGuests).where(eq(stayGuests.id, id));
    },
  };
}

function toIdScan({ createdAt, expiresAt, ...row }: typeof idScans.$inferSelect): IdScan {
  return { ...row, createdAt: createdAt.toISOString(), expiresAt: expiresAt.toISOString() };
}

function idScanRepository(db: Db): IdScanRepository {
  return {
    async get(id) {
      const [row] = await db.select().from(idScans).where(eq(idScans.id, id));
      return row ? toIdScan(row) : null;
    },
    async save(scan) {
      const row = {
        ...scan,
        createdAt: new Date(scan.createdAt),
        expiresAt: new Date(scan.expiresAt),
      };
      await db.insert(idScans).values(row).onConflictDoUpdate({ target: idScans.id, set: row });
    },
    async delete(id) {
      await db.delete(idScans).where(eq(idScans.id, id));
    },
    async deleteExpired(now) {
      await db.delete(idScans).where(lte(idScans.expiresAt, new Date(now)));
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
    housekeeping: housekeepingRepository(db),
    settings: settingsRepository(db),
    staff: staffRepository(db),
    billing: billingRepository(db),
    stayGuests: stayGuestRepository(db),
    idScans: idScanRepository(db),
    transaction: (fn) => db.transaction((tx) => fn(createRepositories(tx))),
  };
}
