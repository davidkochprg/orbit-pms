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
} from './enums';
import { inquiryExtractionSchema } from './inquiry';
import { czkSchema, quoteSchema } from './quote';

export const roomTypeSchema = z.object({
  id: z.string(),
  name: z.string(),
  maxAdults: z.number().int().positive(),
  maxChildren: z.number().int().nonnegative(),
  /** Adult rate per person per night, whole CZK, before season multipliers. */
  basePrice: czkSchema.positive(),
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
  priceSnapshot: quoteSchema.nullable(),
  notes: z.string().nullable(),
});
export type Booking = z.infer<typeof bookingSchema>;

export const inquirySchema = z.object({
  id: z.string(),
  rawText: z.string(),
  channel: inquiryChannelSchema,
  receivedAt: z.iso.datetime(),
  parsed: inquiryExtractionSchema.nullable(),
  status: inquiryStatusSchema,
  bookingId: z.string().nullable(),
});
export type Inquiry = z.infer<typeof inquirySchema>;

export const housekeepingTaskSchema = z.object({
  id: z.string(),
  roomId: z.string(),
  type: housekeepingTaskTypeSchema,
  status: housekeepingTaskStatusSchema,
  notes: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type HousekeepingTask = z.infer<typeof housekeepingTaskSchema>;

export const auditLogEntrySchema = z.object({
  id: z.string(),
  actor: auditActorSchema,
  action: z.string(),
  payload: z.unknown(),
  createdAt: z.iso.datetime(),
});
export type AuditLogEntry = z.infer<typeof auditLogEntrySchema>;
