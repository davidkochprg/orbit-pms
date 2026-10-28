import { z } from 'zod';
import { isoDateSchema } from './dates';
import { auditLogEntrySchema, inquirySchema } from './entities';
import {
  bookingActionSchema,
  bookingStatusSchema,
  inquiryChannelSchema,
  languageSchema,
} from './enums';

/** Query string for `GET /api/bookings`. `status` is comma-separated. */
export const bookingListQuerySchema = z.object({
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  status: z
    .string()
    .transform((s) => s.split(',').filter(Boolean))
    .pipe(z.array(bookingStatusSchema))
    .optional(),
  guestId: z.string().optional(),
  roomId: z.string().optional(),
});
export type BookingListQuery = z.infer<typeof bookingListQuerySchema>;

export const healthSchema = z.object({
  status: z.literal('ok'),
  ai: z.object({
    configured: z.boolean(),
    /** Whether voice notes can be transcribed. */
    voice: z.boolean(),
    /** Whether ID documents can be scanned. */
    vision: z.boolean(),
  }),
  /** The hotel's time zone (IANA), which decides what "today" is. */
  hotel: z.object({ timezone: z.string() }),
});
export type Health = z.infer<typeof healthSchema>;

export const apiErrorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export const bookingActionBodySchema = z.object({ action: bookingActionSchema });
export type BookingActionBody = z.infer<typeof bookingActionBodySchema>;

export const moveBookingBodySchema = z.object({ roomId: z.string().min(1) });
export type MoveBookingBody = z.infer<typeof moveBookingBodySchema>;

export const changeDatesBodySchema = z.object({ checkIn: isoDateSchema, checkOut: isoDateSchema });
export type ChangeDatesBody = z.infer<typeof changeDatesBodySchema>;

/** A tape chart drag: the booking's new room and dates. */
export const rescheduleBodySchema = z.object({
  roomId: z.string().min(1),
  checkIn: isoDateSchema,
  checkOut: isoDateSchema,
});
export type RescheduleBody = z.infer<typeof rescheduleBodySchema>;

export const dayQuerySchema = z.object({ date: isoDateSchema.optional() });

export const auditLogQuerySchema = z.object({
  subjectId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const auditLogListSchema = z.array(auditLogEntrySchema);

export const aiUsageSummarySchema = z.object({
  /** UTC month, `YYYY-MM`. */
  month: z.string(),
  budgetMicroUsd: z.number().int(),
  spentMicroUsd: z.number().int(),
  byFeature: z.array(
    z.object({
      feature: z.string(),
      calls: z.number().int(),
      inputTokens: z.number().int(),
      cachedInputTokens: z.number().int(),
      outputTokens: z.number().int(),
      audioSeconds: z.number().int(),
      costMicroUsd: z.number().int(),
    }),
  ),
});
export type AiUsageSummary = z.infer<typeof aiUsageSummarySchema>;

/** `POST /api/agent`: the chat so far as AI SDK UI messages, validated further by the SDK. */
export const agentRequestSchema = z.object({
  messages: z.array(z.unknown()).min(1).max(100),
});

/** `POST /api/inbox`: a message from a guest that starts a conversation, e.g. pasted or an OTA's. */
export const newMessageBodySchema = z.object({
  body: z.string().trim().min(1).max(10_000),
  channel: inquiryChannelSchema.default('email'),
  partner: z.string().max(100).nullable().default(null),
  subject: z.string().max(300).nullable().default(null),
  senderName: z.string().max(200).nullable().default(null),
  senderAddress: z.string().max(200).nullable().default(null),
});
export type NewMessageBody = z.infer<typeof newMessageBodySchema>;

/** `POST /api/inbox/:id/process`: prepare a reply; `language` gets the draft side by side in it. */
export const processMessageBodySchema = z.object({
  force: z.boolean().default(false),
  language: languageSchema.nullable().default(null),
});

export const inboxHoldBodySchema = z.object({ roomId: z.string().min(1) });

const messageText = z.string().trim().min(1).max(20_000);

/** `POST /api/inbox/compose`: a new email to a guest. */
export const composeBodySchema = z.object({
  toName: z.string().trim().max(200).nullable().default(null),
  toAddress: z.email().max(200),
  subject: z.string().trim().min(1).max(300),
  body: messageText,
});
export type ComposeBody = z.infer<typeof composeBodySchema>;

/** `POST /api/inbox/:id/send` (the hotel's reply) and `/receive` (the guest writing again). */
export const messageBodySchema = z.object({ body: messageText });

export const unreadBodySchema = z.object({ unread: z.boolean() });
export const archiveBodySchema = z.object({ archived: z.boolean() });

/** `POST /api/inbox/translate`: any text into a staff member's or guest's language. */
export const translateBodySchema = z.object({
  text: z.string().trim().min(1).max(10_000),
  to: languageSchema,
});
export const translateResultSchema = z.object({ text: z.string() });
export type TranslateResult = z.infer<typeof translateResultSchema>;

/** `POST /api/inbox/:id/messages/:messageId/translate`. */
export const translateMessageBodySchema = z.object({ to: languageSchema });

export const inquiryListSchema = z.array(inquirySchema);
