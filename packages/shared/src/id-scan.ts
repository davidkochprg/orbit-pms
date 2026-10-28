import { z } from 'zod';
import { isoDateSchema } from './dates';
import { identityFieldsSchema } from './registration';

/**
 * What the vision model reads off a photo of an ID document. Deliberately loose: the domain checks
 * every field before staff see it.
 */
export const idDocumentReadingSchema = z.object({
  readable: z
    .boolean()
    .describe(
      'False when the photo shows no ID document, or it is too blurred or cut off to read.',
    ),
  documentType: z
    .enum(['id_card', 'passport', 'other'])
    .nullable()
    .describe('"other" for e.g. a driving licence or residence permit.'),
  fullName: z
    .string()
    .nullable()
    .describe('Given names then surname, as printed, in Latin letters with diacritics.'),
  nationality: z.string().nullable().describe('ISO 3166-1 alpha-2 code, e.g. "DE".'),
  dateOfBirth: z.string().nullable().describe('YYYY-MM-DD.'),
  documentNumber: z.string().nullable().describe('The document number, without spaces.'),
  address: z
    .string()
    .nullable()
    .describe('Permanent address if printed on the document, one line.'),
  expiresOn: z.string().nullable().describe('Expiry date, YYYY-MM-DD.'),
});
export type IdDocumentReading = z.infer<typeof idDocumentReadingSchema>;

/** Checked values from a scan, for staff to review before saving. */
export const idScanResultSchema = identityFieldsSchema.extend({
  name: z.string().nullable(),
  expiresOn: isoDateSchema.nullable(),
  /** Things staff should check, e.g. an expired document. */
  warnings: z.array(z.string()),
});
export type IdScanResult = z.infer<typeof idScanResultSchema>;

export const idScanStatuses = ['waiting', 'reading', 'done', 'failed'] as const;
export const idScanStatusSchema = z.enum(idScanStatuses);
export type IdScanStatus = z.infer<typeof idScanStatusSchema>;

/**
 * A short-lived link for photographing one guest's ID with a phone. The ID is the secret in the
 * link. The photo itself is never stored, and the result is deleted once it is saved or expires.
 */
export const idScanSchema = z.object({
  id: z.string(),
  bookingId: z.string(),
  /** The person scanned for; null to add a new companion from the scan. */
  stayGuestId: z.string().nullable(),
  status: idScanStatusSchema,
  result: idScanResultSchema.nullable(),
  error: z.string().nullable(),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
});
export type IdScan = z.infer<typeof idScanSchema>;

/** `POST /api/bookings/:id/scans`. */
export const newIdScanBodySchema = z.object({ stayGuestId: z.string().nullable().default(null) });
export type NewIdScanBody = z.infer<typeof newIdScanBodySchema>;

/** What the phone shows: enough to know it is the right guest, nothing from the document. */
export const idScanPhoneViewSchema = z.object({
  status: idScanStatusSchema,
  /** First name only, or null for a companion not added yet. */
  firstName: z.string().nullable(),
  roomName: z.string(),
  error: z.string().nullable(),
  expiresAt: z.iso.datetime(),
});
export type IdScanPhoneView = z.infer<typeof idScanPhoneViewSchema>;
