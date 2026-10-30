import { z } from 'zod';

/** Someone an email goes to or comes from. */
export const recipientSchema = z.object({
  name: z.string().trim().max(200).nullable(),
  address: z.email().max(200),
});
export type Recipient = z.infer<typeof recipientSchema>;

/** Up to 20 addresses on one line of an email. */
export const recipientsSchema = z.array(recipientSchema).max(20);

/** A file on an email or a draft. The bytes are fetched separately. */
export const attachmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  contentType: z.string(),
  /** Bytes. */
  size: z.number().int().nonnegative(),
});
export type Attachment = z.infer<typeof attachmentSchema>;

/** The largest file an email can carry: what a request body can hold on Vercel, with headroom. */
export const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;
export const MAX_ATTACHMENTS = 10;

export const labelColors = ['gray', 'blue', 'green', 'amber', 'red', 'violet'] as const;
export const labelColorSchema = z.enum(labelColors);
export type LabelColor = z.infer<typeof labelColorSchema>;

/** A label staff put on conversations, e.g. "Groups" or "Invoices". */
export const mailLabelSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: labelColorSchema,
});
export type MailLabel = z.infer<typeof mailLabelSchema>;

export const labelBodySchema = z.object({
  name: z.string().trim().min(1).max(40),
  color: labelColorSchema.default('gray'),
});
export type LabelBody = z.infer<typeof labelBodySchema>;

/**
 * An email not sent yet, saved as staff write it: a new email (`inquiryId` null), a reply in a
 * conversation, or a forward of one (`forwardOf`).
 */
export const mailDraftSchema = z.object({
  id: z.string(),
  inquiryId: z.string().nullable(),
  forwardOf: z.string().nullable(),
  to: recipientsSchema,
  cc: recipientsSchema,
  bcc: recipientsSchema,
  subject: z.string(),
  body: z.string(),
  attachments: z.array(attachmentSchema),
  updatedAt: z.iso.datetime(),
});
export type MailDraft = z.infer<typeof mailDraftSchema>;

/** `PUT /api/inbox/drafts/:id`: the draft as it stands; an empty draft is still kept. */
export const draftBodySchema = z.object({
  inquiryId: z.string().nullable().default(null),
  forwardOf: z.string().nullable().default(null),
  to: recipientsSchema.default([]),
  cc: recipientsSchema.default([]),
  bcc: recipientsSchema.default([]),
  subject: z.string().max(300).default(''),
  body: z.string().max(20_000).default(''),
  attachmentIds: z.array(z.string()).max(MAX_ATTACHMENTS).default([]),
});
export type DraftBody = z.infer<typeof draftBodySchema>;

/** What changes on many conversations at once, from the list's selection. */
export const bulkActions = [
  'archive',
  'unarchive',
  'trash',
  'restore',
  'read',
  'unread',
  'star',
  'unstar',
  'label',
  'unlabel',
] as const;
export const bulkActionSchema = z.enum(bulkActions);
export type BulkAction = z.infer<typeof bulkActionSchema>;

export const bulkBodySchema = z
  .object({
    ids: z.array(z.string()).min(1).max(500),
    action: bulkActionSchema,
    /** For `label` and `unlabel`. */
    labelId: z.string().nullable().default(null),
  })
  .refine((b) => (b.action === 'label' || b.action === 'unlabel') === (b.labelId !== null), {
    message: 'A label action needs a labelId, and only a label action takes one',
  });
export type BulkBody = z.infer<typeof bulkBodySchema>;
