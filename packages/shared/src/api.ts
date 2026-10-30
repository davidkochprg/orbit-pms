import { z } from 'zod';
import { isoDateSchema } from './dates';
import { auditLogEntrySchema, inquirySchema } from './entities';
import {
  bookingActionSchema,
  bookingStatusSchema,
  inquiryChannelSchema,
  languageSchema,
} from './enums';
import { MAX_ATTACHMENTS, recipientsSchema } from './mail';

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

/**
 * What the staff member was looking at when they asked: a booking, a guest or an inbox
 * conversation. Only the ID travels; the server reads the rest from its own data.
 */
export const agentContextSchema = z.object({
  kind: z.enum(['booking', 'guest', 'inquiry']),
  id: z.string().min(1).max(100),
});
export type AgentContext = z.infer<typeof agentContextSchema>;

/** The metadata of a staff member's message to the agent. */
export const agentMessageMetadataSchema = z.object({ context: agentContextSchema.optional() });
export type AgentMessageMetadata = z.infer<typeof agentMessageMetadataSchema>;

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

/**
 * `POST /api/inbox/compose`: a new email, starting a conversation with the first `to`. A forward
 * (`forwardOf`) may carry the attachments of the conversation it forwards.
 */
export const composeBodySchema = z.object({
  to: recipientsSchema.min(1, 'Add someone to send it to'),
  cc: recipientsSchema.default([]),
  bcc: recipientsSchema.default([]),
  subject: z.string().trim().min(1).max(300),
  body: messageText,
  attachmentIds: z.array(z.string()).max(MAX_ATTACHMENTS).default([]),
  forwardOf: z.string().nullable().default(null),
  /** The draft this was written in, deleted once sent. */
  draftId: z.string().nullable().default(null),
});
export type ComposeBody = z.infer<typeof composeBodySchema>;

/** `POST /api/inbox/:id/receive`: the guest writing again. */
export const messageBodySchema = z.object({ body: messageText });

/**
 * `POST /api/inbox/:id/send`: the hotel's reply, to the guest unless `to` says otherwise, with
 * copies and files. Delivered outside Orbit.
 */
export const replyBodySchema = z.object({
  body: messageText,
  to: recipientsSchema.default([]),
  cc: recipientsSchema.default([]),
  bcc: recipientsSchema.default([]),
  attachmentIds: z.array(z.string()).max(MAX_ATTACHMENTS).default([]),
  draftId: z.string().nullable().default(null),
});
export type ReplyBody = z.infer<typeof replyBodySchema>;

/** A reply the agent proposes to send in a conversation, once staff confirm it. */
export const replyProposalSchema = z.object({
  inquiryId: z.string().describe('Conversation ID, e.g. "inq_4".'),
  body: messageText.describe("The whole reply, in the guest's language, signed as the hotel."),
});

export const unreadBodySchema = z.object({ unread: z.boolean() });
export const archiveBodySchema = z.object({ archived: z.boolean() });
export const starBodySchema = z.object({ starred: z.boolean() });
export const trashBodySchema = z.object({ trashed: z.boolean() });
export const labelsBodySchema = z.object({ labelIds: z.array(z.string()).max(20) });

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

/** `GET /api/access`: whether the deployment asks for an access code, and whether this browser has it. */
export const accessStatusSchema = z.object({ required: z.boolean(), granted: z.boolean() });
export type AccessStatus = z.infer<typeof accessStatusSchema>;

/** `POST /api/access`: the demo access code. */
export const accessBodySchema = z.object({ code: z.string().trim().min(1).max(200) });
export type AccessBody = z.infer<typeof accessBodySchema>;
