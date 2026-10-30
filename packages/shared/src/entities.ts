import { z } from 'zod';
import { isoDateSchema } from './dates';
import {
  auditActorSchema,
  bookingSourceSchema,
  bookingStatusSchema,
  housekeepingTaskStatusSchema,
  housekeepingTaskTypeSchema,
  inquiryChannelSchema,
  inquiryStatusSchema,
  languageSchema,
  roomKindSchema,
  roomStatusSchema,
  tradeSchema,
} from './enums';
import { inboxMessageSchema, inquiryExtractionSchema, inquirySuggestionSchema } from './inquiry';
import { moneySchema, quoteAddonsSchema, quoteSchema } from './quote';

export const roomTypeSchema = z.object({
  id: z.string(),
  name: z.string(),
  maxAdults: z.number().int().positive(),
  maxChildren: z.number().int().nonnegative(),
  /** Per night before season multipliers: per adult, or per room (see `pricingBasis`). */
  basePrice: moneySchema.positive(),
  description: z.string(),
});
export type RoomType = z.infer<typeof roomTypeSchema>;

export const roomSchema = z.object({
  id: z.string(),
  name: z.string(),
  roomTypeId: z.string(),
  kind: roomKindSchema,
  floor: z.number().int(),
  status: roomStatusSchema,
});
export type Room = z.infer<typeof roomSchema>;

export const guestSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  language: languageSchema,
  notes: z.string().nullable(),
});
export type Guest = z.infer<typeof guestSchema>;

export const bookingSchema = z.object({
  id: z.string(),
  guestId: z.string(),
  roomId: z.string(),
  checkIn: isoDateSchema,
  checkOut: isoDateSchema,
  adults: z.number().int().positive(),
  childAges: z.array(z.number().int().nonnegative()),
  status: bookingStatusSchema,
  holdExpiresAt: z.iso.datetime().nullable(),
  source: bookingSourceSchema,
  addons: quoteAddonsSchema,
  priceSnapshot: quoteSchema.nullable(),
  notes: z.string().nullable(),
});
export type Booking = z.infer<typeof bookingSchema>;

/**
 * A conversation with a guest, by email or through an OTA's messaging: its messages oldest
 * first, what the agent prepared for it on request, and where it stands.
 */
export const inquirySchema = z.object({
  id: z.string(),
  channel: inquiryChannelSchema,
  /** OTA or partner the message came through, e.g. "Booking.com"; null for direct messages. */
  partner: z.string().nullable(),
  subject: z.string().nullable(),
  /** The guest: who wrote, or who the hotel wrote to. */
  senderName: z.string().nullable(),
  senderAddress: z.string().nullable(),
  /** When the conversation started. */
  receivedAt: z.iso.datetime(),
  lastMessageAt: z.iso.datetime(),
  messages: z.array(inboxMessageSchema),
  /** Set when the guest wrote and nobody has opened it since. */
  unread: z.boolean(),
  /** Archived conversations leave the inbox; a new message from the guest brings them back. */
  archivedAt: z.iso.datetime().nullable(),
  starred: z.boolean().default(false),
  /** In the trash: out of every other folder until restored or deleted for good. */
  trashedAt: z.iso.datetime().nullable().default(null),
  labelIds: z.array(z.string()).default([]),
  parsed: inquiryExtractionSchema.nullable(),
  suggestion: inquirySuggestionSchema.nullable(),
  status: inquiryStatusSchema,
  bookingId: z.string().nullable(),
  processedAt: z.iso.datetime().nullable(),
  processingError: z.string().nullable(),
});
export type Inquiry = z.infer<typeof inquirySchema>;

export const housekeepingTaskSchema = z.object({
  id: z.string(),
  roomId: z.string(),
  type: housekeepingTaskTypeSchema,
  status: housekeepingTaskStatusSchema,
  notes: z.string().nullable(),
  /** Who fixes it, for a repair; null for cleaning or when it isn't clear. */
  trade: tradeSchema.nullable(),
  /** The contact asked to fix it, once someone has been called or emailed. */
  contactId: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type HousekeepingTask = z.infer<typeof housekeepingTaskSchema>;

export const auditLogEntrySchema = z.object({
  id: z.string(),
  actor: auditActorSchema,
  action: z.string(),
  /** The entity the action was about, e.g. a booking ID, for per-record history. */
  subjectId: z.string().nullable(),
  payload: z.unknown(),
  createdAt: z.iso.datetime(),
});
export type AuditLogEntry = z.infer<typeof auditLogEntrySchema>;
