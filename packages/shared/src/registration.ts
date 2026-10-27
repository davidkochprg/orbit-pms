import { z } from 'zod';
import { isoDateSchema } from './dates';

export const documentTypes = ['id_card', 'passport'] as const;
export const documentTypeSchema = z.enum(documentTypes);
export type DocumentType = z.infer<typeof documentTypeSchema>;

/** What the guest book records for a stay's main guest, entered at check-in. */
export const registrationBodySchema = z.object({
  /** ISO 3166 alpha-2 country code, e.g. "CZ" or "DE". */
  nationality: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, 'Use a two-letter country code like CZ'),
  dateOfBirth: isoDateSchema,
  documentType: documentTypeSchema,
  documentNumber: z.string().trim().min(3).max(30),
  /** Home address; needed for guests from abroad. */
  address: z
    .string()
    .trim()
    .max(200)
    .nullable()
    .default(null)
    .transform((s) => (s === '' ? null : s)),
});
export type RegistrationBody = z.infer<typeof registrationBodySchema>;

export const registrationSchema = registrationBodySchema.extend({
  bookingId: z.string(),
  guestId: z.string(),
  registeredAt: z.iso.datetime(),
});
export type Registration = z.infer<typeof registrationSchema>;

/** A stay's registration, and the guest's previous one to prefill the form from. */
export const registrationViewSchema = z.object({
  registration: registrationSchema.nullable(),
  previous: registrationBodySchema.nullable(),
});
export type RegistrationView = z.infer<typeof registrationViewSchema>;
