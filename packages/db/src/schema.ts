import {
  auditActors,
  bookingSources,
  bookingStatuses,
  documentTypes,
  housekeepingTaskStatuses,
  housekeepingTaskTypes,
  idScanStatuses,
  inquiryChannels,
  inquiryStatuses,
  languages,
  messageDirections,
  paymentKinds,
  paymentMethods,
  pendingActionStatuses,
  roomKinds,
  roomStatuses,
  staffRoles,
  type HotelProfile,
  type IdScanResult,
  type InquiryExtraction,
  type InquirySuggestion,
  type PendingActionDetails,
  type PendingActionInput,
  type PricingConfig,
  type Quote,
  type Translation,
  type QuoteAddons,
  vatBrackets,
} from '@orbit/shared';
import type { AiFeature } from '@orbit/ai';
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
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
export const messageDirection = pgEnum('message_direction', messageDirections);
export const housekeepingTaskType = pgEnum('housekeeping_task_type', housekeepingTaskTypes);
export const housekeepingTaskStatus = pgEnum('housekeeping_task_status', housekeepingTaskStatuses);
export const auditActor = pgEnum('audit_actor', auditActors);
export const pendingActionStatus = pgEnum('pending_action_status', pendingActionStatuses);
export const staffRole = pgEnum('staff_role', staffRoles);
export const paymentKind = pgEnum('payment_kind', paymentKinds);
export const documentType = pgEnum('document_type', documentTypes);
export const paymentMethod = pgEnum('payment_method', paymentMethods);
export const vatBracket = pgEnum('vat_bracket', vatBrackets);
export const idScanStatus = pgEnum('id_scan_status', idScanStatuses);

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

/** A conversation with a guest; its messages are in `inbox_messages`. */
export const inquiries = pgTable('inquiries', {
  id: text('id').primaryKey(),
  channel: inquiryChannel('channel').notNull(),
  partner: text('partner'),
  subject: text('subject'),
  senderName: text('sender_name'),
  senderAddress: text('sender_address'),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull(),
  lastMessageAt: timestamp('last_message_at', { withTimezone: true }).notNull(),
  unread: boolean('unread').notNull().default(true),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  parsed: jsonb('parsed').$type<InquiryExtraction>(),
  suggestion: jsonb('suggestion').$type<InquirySuggestion>(),
  status: inquiryStatus('status').notNull().default('new'),
  bookingId: text('booking_id').references(() => bookings.id),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  processingError: text('processing_error'),
});

export const inboxMessages = pgTable(
  'inbox_messages',
  {
    id: text('id').primaryKey(),
    inquiryId: text('inquiry_id')
      .notNull()
      .references(() => inquiries.id, { onDelete: 'cascade' }),
    direction: messageDirection('direction').notNull(),
    body: text('body').notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull(),
    author: text('author'),
    translation: jsonb('translation').$type<Translation>(),
  },
  (t) => [index('inbox_messages_inquiry_idx').on(t.inquiryId, t.sentAt)],
);

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
    /** Insertion order; timestamps can tie within a millisecond. */
    seq: bigint('seq', { mode: 'number' }).generatedAlwaysAsIdentity(),
    actor: auditActor('actor').notNull(),
    action: text('action').notNull(),
    subjectId: text('subject_id'),
    payload: jsonb('payload').$type<unknown>(),
    createdAt: createdAt(),
  },
  (t) => [index('audit_log_subject_idx').on(t.subjectId, t.seq)],
);

/** Mutations the agent proposed, waiting for a user to confirm or reject them. */
export const pendingActions = pgTable('pending_actions', {
  id: text('id').primaryKey(),
  kind: text('kind').$type<PendingActionInput['kind']>().notNull(),
  input: jsonb('input').$type<PendingActionInput['input']>().notNull(),
  summary: text('summary').notNull(),
  /** What the confirm card shows; null for actions proposed before it was recorded. */
  details: jsonb('details').$type<PendingActionDetails>(),
  status: pendingActionStatus('status').notNull().default('pending'),
  bookingId: text('booking_id'),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
});

/** People who sign in to Orbit. Kept when they leave (inactive), so the audit log stays readable. */
export const staff = pgTable('staff', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').unique(),
  role: staffRole('role').notNull(),
  language: language('language').notNull().default('cs'),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
});

/** The hotel profile from Settings. One row, `id = 'hotel'`. */
export const hotelProfile = pgTable('hotel_profile', {
  id: text('id').primaryKey(),
  profile: jsonb('profile').$type<HotelProfile>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Extras posted to a booking's bill. The stay itself is billed from the booking's price snapshot. */
export const charges = pgTable(
  'charges',
  {
    id: text('id').primaryKey(),
    bookingId: text('booking_id')
      .notNull()
      .references(() => bookings.id),
    label: text('label').notNull(),
    quantity: integer('quantity').notNull(),
    /** Whole CZK; negative for a discount. */
    unitPrice: integer('unit_price').notNull(),
    amount: integer('amount').notNull(),
    vatBracket: vatBracket('vat_bracket').notNull().default('standard'),
    postedOn: date('posted_on', { mode: 'string' }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('charges_booking_idx').on(t.bookingId), index('charges_posted_idx').on(t.postedOn)],
);

/** Money received for a booking, or paid back (`refund`). Amounts are positive whole CZK. */
export const payments = pgTable(
  'payments',
  {
    id: text('id').primaryKey(),
    bookingId: text('booking_id')
      .notNull()
      .references(() => bookings.id),
    kind: paymentKind('kind').notNull(),
    method: paymentMethod('method').notNull(),
    amount: integer('amount').notNull(),
    note: text('note'),
    paidOn: date('paid_on', { mode: 'string' }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index('payments_booking_idx').on(t.bookingId),
    index('payments_paid_idx').on(t.paidOn),
    check('payments_amount_check', sql`${t.amount} > 0`),
  ],
);

/**
 * The guest book: everyone staying in a booking's room. The main guest's row has the ID
 * `sg_<bookingId>` and links their profile; companions have only a name. ID fields stay null until
 * recorded.
 */
export const stayGuests = pgTable(
  'stay_guests',
  {
    id: text('id').primaryKey(),
    bookingId: text('booking_id')
      .notNull()
      .references(() => bookings.id),
    guestId: text('guest_id').references(() => guests.id),
    name: text('name').notNull(),
    nationality: text('nationality'),
    dateOfBirth: date('date_of_birth', { mode: 'string' }),
    documentType: documentType('document_type'),
    documentNumber: text('document_number'),
    address: text('address'),
    registeredAt: timestamp('registered_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index('stay_guests_booking_idx').on(t.bookingId, t.createdAt),
    index('stay_guests_guest_idx').on(t.guestId, t.registeredAt),
  ],
);

/** Open phone ID-scan links. The photo is never stored; a row is deleted once saved or expired. */
export const idScans = pgTable(
  'id_scans',
  {
    id: text('id').primaryKey(),
    bookingId: text('booking_id')
      .notNull()
      .references(() => bookings.id),
    stayGuestId: text('stay_guest_id'),
    status: idScanStatus('status').notNull(),
    result: jsonb('result').$type<IdScanResult>(),
    error: text('error'),
    readingSince: timestamp('reading_since', { withTimezone: true }),
    createdAt: createdAt(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [index('id_scans_expires_idx').on(t.expiresAt)],
);

/** Rates from Settings: seasons, discounts and add-on prices. One row, `id = 'hotel'`. */
export const pricing = pgTable('pricing', {
  id: text('id').primaryKey(),
  config: jsonb('config').$type<PricingConfig>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Every model call and what it cost. Not touched by the demo seed or resets: it is real spend. */
export const aiUsage = pgTable(
  'ai_usage',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    feature: text('feature').$type<AiFeature>().notNull(),
    model: text('model').notNull(),
    inputTokens: integer('input_tokens').notNull(),
    cachedInputTokens: integer('cached_input_tokens').notNull(),
    outputTokens: integer('output_tokens').notNull(),
    audioSeconds: integer('audio_seconds').notNull().default(0),
    costMicroUsd: bigint('cost_micro_usd', { mode: 'number' }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('ai_usage_created_idx').on(t.createdAt)],
);
