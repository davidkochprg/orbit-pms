import {
  auditActors,
  bookingSources,
  bookingStatuses,
  housekeepingTaskStatuses,
  housekeepingTaskTypes,
  inquiryChannels,
  inquiryStatuses,
  languages,
  pendingActionStatuses,
  roomKinds,
  roomStatuses,
  type InquiryExtraction,
  type PendingActionInput,
  type Quote,
  type QuoteAddons,
} from '@orbit/shared';
import { sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const roomKind = pgEnum('room_kind', roomKinds);
export const roomStatus = pgEnum('room_status', roomStatuses);
export const language = pgEnum('language', languages);
export const bookingStatus = pgEnum('booking_status', bookingStatuses);
export const bookingSource = pgEnum('booking_source', bookingSources);
export const inquiryChannel = pgEnum('inquiry_channel', inquiryChannels);
export const inquiryStatus = pgEnum('inquiry_status', inquiryStatuses);
export const housekeepingTaskType = pgEnum('housekeeping_task_type', housekeepingTaskTypes);
export const housekeepingTaskStatus = pgEnum('housekeeping_task_status', housekeepingTaskStatuses);
export const auditActor = pgEnum('audit_actor', auditActors);
export const pendingActionStatus = pgEnum('pending_action_status', pendingActionStatuses);

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const roomTypes = pgTable('room_types', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  maxAdults: integer('max_adults').notNull(),
  maxChildren: integer('max_children').notNull(),
  /** Adult rate per person per night, whole CZK. */
  basePrice: integer('base_price').notNull(),
  description: text('description').notNull(),
});

export const rooms = pgTable('rooms', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  roomTypeId: text('room_type_id')
    .notNull()
    .references(() => roomTypes.id),
  kind: roomKind('kind').notNull(),
  floor: integer('floor').notNull(),
  status: roomStatus('status').notNull().default('clean'),
});

export const guests = pgTable('guests', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email'),
  phone: text('phone'),
  language: language('language').notNull(),
  notes: text('notes'),
  createdAt: createdAt(),
});

export const bookings = pgTable(
  'bookings',
  {
    id: text('id').primaryKey(),
    guestId: text('guest_id')
      .notNull()
      .references(() => guests.id),
    roomId: text('room_id')
      .notNull()
      .references(() => rooms.id),
    checkIn: date('check_in', { mode: 'string' }).notNull(),
    checkOut: date('check_out', { mode: 'string' }).notNull(),
    adults: integer('adults').notNull(),
    childAges: jsonb('child_ages').$type<number[]>().notNull().default([]),
    status: bookingStatus('status').notNull(),
    holdExpiresAt: timestamp('hold_expires_at', { withTimezone: true }),
    source: bookingSource('source').notNull(),
    addons: jsonb('addons')
      .$type<QuoteAddons>()
      .notNull()
      .default({ wellness: false, dogs: 0, extraBeds: 0 }),
    priceSnapshot: jsonb('price_snapshot').$type<Quote>(),
    notes: text('notes'),
    createdAt: createdAt(),
  },
  (t) => [
    index('bookings_room_dates_idx').on(t.roomId, t.checkIn, t.checkOut),
    index('bookings_guest_idx').on(t.guestId),
    check('bookings_dates_check', sql`${t.checkOut} > ${t.checkIn}`),
  ],
);

export const inquiries = pgTable('inquiries', {
  id: text('id').primaryKey(),
  rawText: text('raw_text').notNull(),
  channel: inquiryChannel('channel').notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull(),
  parsed: jsonb('parsed').$type<InquiryExtraction>(),
  status: inquiryStatus('status').notNull().default('new'),
  bookingId: text('booking_id').references(() => bookings.id),
});

export const housekeepingTasks = pgTable('housekeeping_tasks', {
  id: text('id').primaryKey(),
  roomId: text('room_id')
    .notNull()
    .references(() => rooms.id),
  type: housekeepingTaskType('type').notNull(),
  status: housekeepingTaskStatus('status').notNull().default('open'),
  notes: text('notes'),
  createdAt: createdAt(),
});

export const auditLog = pgTable(
  'audit_log',
  {
    id: text('id').primaryKey(),
    actor: auditActor('actor').notNull(),
    action: text('action').notNull(),
    subjectId: text('subject_id'),
    payload: jsonb('payload').$type<unknown>(),
    createdAt: createdAt(),
  },
  (t) => [index('audit_log_subject_idx').on(t.subjectId, t.createdAt)],
);

/** Mutations the agent proposed, waiting for a user to confirm or reject them. */
export const pendingActions = pgTable('pending_actions', {
  id: text('id').primaryKey(),
  kind: text('kind').$type<PendingActionInput['kind']>().notNull(),
  input: jsonb('input').$type<PendingActionInput['input']>().notNull(),
  summary: text('summary').notNull(),
  status: pendingActionStatus('status').notNull().default('pending'),
  bookingId: text('booking_id'),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
});
