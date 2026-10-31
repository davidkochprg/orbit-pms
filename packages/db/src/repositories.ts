import { randomUUID } from 'node:crypto';
import type {
  AuditRepository,
  BillingFilter,
  BillingRepository,
  BookingFilter,
  BookingRepository,
  ContactRepository,
  GuestRepository,
  HousekeepingRepository,
  InquiryRepository,
  PendingActionRepository,
  IdScanRepository,
  StayGuestRepository,
  StayReadingRepository,
  GuestMemoryRepository,
  LocalEventRepository,
  MailRepository,
  RateReviewRepository,
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
  type InboxMessage,
  type Inquiry,
  type PendingAction,
  type Payment,
  type IdScan,
  type StayGuest,
  pendingActionSchema,
  pricingConfigSchema,
  rateSignalSchema,
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
  contacts,
  guests,
  hotelProfile,
  housekeepingTasks,
  inboxMessages,
  inquiries,
  payments,
  pendingActions,
  pricing,
  idScans,
  rateReviews,
  stayGuests,
  stayReadings,
  guestMemories,
  localEvents,
  mailAttachments,
  mailDrafts,
  mailLabels,
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
    async lockRoom(id) {
      await db.select({ id: rooms.id }).from(rooms).where(eq(rooms.id, id)).for('update');
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

type MessageRow = typeof inboxMessages.$inferSelect;

function toMessage({ sentAt, ...row }: MessageRow): InboxMessage {
  return { ...row, sentAt: sentAt.toISOString() };
}

function toMessageRow(message: InboxMessage): MessageRow {
  return { ...message, sentAt: new Date(message.sentAt) };
}

function toInquiry(row: InquiryRow, messages: InboxMessage[]): Inquiry {
  return {
    ...row,
    receivedAt: row.receivedAt.toISOString(),
    lastMessageAt: row.lastMessageAt.toISOString(),
    archivedAt: row.archivedAt?.toISOString() ?? null,
    trashedAt: row.trashedAt?.toISOString() ?? null,
    processedAt: row.processedAt?.toISOString() ?? null,
    messages,
  };
}

function toInquiryRow({ messages: _, ...inquiry }: Inquiry): InquiryRow {
  return {
    ...inquiry,
    receivedAt: new Date(inquiry.receivedAt),
    lastMessageAt: new Date(inquiry.lastMessageAt),
    archivedAt: inquiry.archivedAt ? new Date(inquiry.archivedAt) : null,
    trashedAt: inquiry.trashedAt ? new Date(inquiry.trashedAt) : null,
    processedAt: inquiry.processedAt ? new Date(inquiry.processedAt) : null,
  };
}

function inquiryRepository(db: Db): InquiryRepository {
  const messagesOf = async (inquiryId?: string) =>
    (
      await db
        .select()
        .from(inboxMessages)
        .where(inquiryId ? eq(inboxMessages.inquiryId, inquiryId) : undefined)
        .orderBy(asc(inboxMessages.sentAt), asc(inboxMessages.id))
    ).map(toMessage);

  return {
    async listInquiries() {
      const rows = await db.select().from(inquiries).orderBy(desc(inquiries.lastMessageAt));
      const byInquiry = new Map<string, InboxMessage[]>();
      for (const m of await messagesOf()) {
        byInquiry.set(m.inquiryId, [...(byInquiry.get(m.inquiryId) ?? []), m]);
      }
      return rows.map((row) => toInquiry(row, byInquiry.get(row.id) ?? []));
    },
    async getInquiry(id) {
      const [row] = await db.select().from(inquiries).where(eq(inquiries.id, id));
      return row ? toInquiry(row, await messagesOf(id)) : null;
    },
    async createInquiry(inquiry) {
      await db.insert(inquiries).values(toInquiryRow(inquiry));
      if (inquiry.messages.length > 0) {
        await db.insert(inboxMessages).values(inquiry.messages.map(toMessageRow));
      }
    },
    async updateInquiry(inquiry) {
      const { id, ...row } = toInquiryRow(inquiry);
      await db.update(inquiries).set(row).where(eq(inquiries.id, id));
    },
    async addMessage(message) {
      await db.insert(inboxMessages).values(toMessageRow(message));
    },
    async updateMessage(message) {
      const { id, ...row } = toMessageRow(message);
      await db.update(inboxMessages).set(row).where(eq(inboxMessages.id, id));
    },
    async deleteInquiry(id) {
      await db.delete(inquiries).where(eq(inquiries.id, id));
    },
  };
}

function mailRepository(db: Db): MailRepository {
  const fileColumns = {
    id: mailAttachments.id,
    name: mailAttachments.name,
    contentType: mailAttachments.contentType,
    size: mailAttachments.size,
  };
  return {
    listLabels: () => db.select().from(mailLabels).orderBy(asc(mailLabels.name)),
    async saveLabel(label) {
      const { id: _, ...fields } = label;
      await db
        .insert(mailLabels)
        .values(label)
        .onConflictDoUpdate({ target: mailLabels.id, set: fields });
    },
    async deleteLabel(id) {
      await db.delete(mailLabels).where(eq(mailLabels.id, id));
    },
    async listDrafts() {
      const rows = await db.select().from(mailDrafts).orderBy(desc(mailDrafts.updatedAt));
      return rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() }));
    },
    async getDraft(id) {
      const [row] = await db.select().from(mailDrafts).where(eq(mailDrafts.id, id));
      return row ? { ...row, updatedAt: row.updatedAt.toISOString() } : null;
    },
    async saveDraft(draft) {
      const row = { ...draft, updatedAt: new Date(draft.updatedAt) };
      const { id: _, ...fields } = row;
      await db
        .insert(mailDrafts)
        .values(row)
        .onConflictDoUpdate({ target: mailDrafts.id, set: fields });
    },
    async deleteDraft(id) {
      await db.delete(mailDrafts).where(eq(mailDrafts.id, id));
    },
    async saveAttachment(attachment, bytes) {
      await db.insert(mailAttachments).values({ ...attachment, data: bytes });
    },
    async getAttachments(ids) {
      if (ids.length === 0) return [];
      const rows = await db
        .select(fileColumns)
        .from(mailAttachments)
        .where(inArray(mailAttachments.id, ids));
      return ids.flatMap((id) => rows.find((r) => r.id === id) ?? []);
    },
    async readAttachment(id) {
      const [row] = await db.select().from(mailAttachments).where(eq(mailAttachments.id, id));
      if (!row) return null;
      const { data, createdAt: _, ...attachment } = row;
      return { attachment, bytes: new Uint8Array(data) };
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
    details: action.details,
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
    async resolveIfPending(action) {
      const { id, ...row } = toPendingRow(action);
      const updated = await db
        .update(pendingActions)
        .set(row)
        .where(and(eq(pendingActions.id, id), eq(pendingActions.status, 'pending')))
        .returning({ id: pendingActions.id });
      return updated.length > 0;
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
    language: staff.language,
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

function toIdScan({
  readingSince,
  createdAt,
  expiresAt,
  ...row
}: typeof idScans.$inferSelect): IdScan {
  return {
    ...row,
    readingSince: readingSince?.toISOString() ?? null,
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
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
        readingSince: scan.readingSince ? new Date(scan.readingSince) : null,
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

function stayReadingRepository(db: Db): StayReadingRepository {
  return {
    async list(bookingIds) {
      if (bookingIds.length === 0) return [];
      const rows = await db
        .select()
        .from(stayReadings)
        .where(inArray(stayReadings.bookingId, bookingIds));
      return rows.map(({ readAt, ...row }) => ({ ...row, readAt: readAt.toISOString() }));
    },
    async save(reading) {
      const row = { ...reading, readAt: new Date(reading.readAt) };
      await db
        .insert(stayReadings)
        .values(row)
        .onConflictDoUpdate({ target: stayReadings.bookingId, set: row });
    },
  };
}

function guestMemoryRepository(db: Db): GuestMemoryRepository {
  return {
    async get(guestId) {
      const [row] = await db.select().from(guestMemories).where(eq(guestMemories.guestId, guestId));
      return row ? { ...row, readAt: row.readAt.toISOString() } : null;
    },
    async save(memory) {
      const row = { ...memory, readAt: new Date(memory.readAt) };
      await db
        .insert(guestMemories)
        .values(row)
        .onConflictDoUpdate({ target: guestMemories.guestId, set: row });
    },
  };
}

function contactRepository(db: Db): ContactRepository {
  const columns = {
    id: contacts.id,
    name: contacts.name,
    person: contacts.person,
    trades: contacts.trades,
    phone: contacts.phone,
    email: contacts.email,
    language: contacts.language,
    notes: contacts.notes,
  };
  return {
    list: () => db.select(columns).from(contacts).orderBy(asc(contacts.name), asc(contacts.id)),
    async get(id) {
      const [row] = await db.select(columns).from(contacts).where(eq(contacts.id, id));
      return row ?? null;
    },
    async save(contact) {
      const { id: _, ...fields } = contact;
      await db
        .insert(contacts)
        .values(contact)
        .onConflictDoUpdate({ target: contacts.id, set: fields });
    },
    async delete(id) {
      await db.delete(contacts).where(eq(contacts.id, id));
    },
  };
}

function localEventRepository(db: Db): LocalEventRepository {
  return {
    async list() {
      const rows = await db
        .select()
        .from(localEvents)
        .orderBy(asc(localEvents.firstNight), asc(localEvents.id));
      return rows.map(({ createdAt: _, ...event }) => event);
    },
    async create(event) {
      await db.insert(localEvents).values(event);
    },
    async delete(id) {
      await db.delete(localEvents).where(eq(localEvents.id, id));
    },
  };
}

function rateReviewRepository(db: Db): RateReviewRepository {
  return {
    async get() {
      const [row] = await db.select().from(rateReviews).where(eq(rateReviews.id, 'hotel'));
      return row
        ? {
            basis: row.basis,
            reviewedAt: row.reviewedAt.toISOString(),
            signals: rateSignalSchema.array().parse(row.signals),
          }
        : null;
    },
    async save(review) {
      const row = { ...review, reviewedAt: new Date(review.reviewedAt) };
      await db
        .insert(rateReviews)
        .values({ id: 'hotel', ...row })
        .onConflictDoUpdate({ target: rateReviews.id, set: row });
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
    stayReadings: stayReadingRepository(db),
    guestMemories: guestMemoryRepository(db),
    events: localEventRepository(db),
    rateReview: rateReviewRepository(db),
    contacts: contactRepository(db),
    mail: mailRepository(db),
    transaction: (fn) => db.transaction((tx) => fn(createRepositories(tx))),
  };
}
