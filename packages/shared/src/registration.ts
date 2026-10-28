import { z } from 'zod';
import { isoDateSchema } from './dates';

export const documentTypes = ['id_card', 'passport'] as const;
export const documentTypeSchema = z.enum(documentTypes);
export type DocumentType = z.infer<typeof documentTypeSchema>;

/** ISO 3166 alpha-2 country code, e.g. "CZ" or "DE". */
export const nationalitySchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, 'Use a two-letter country code like CZ');

/** An optional text field: blank means unknown. */
const optionalText = (max: number, min = 1) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((s) => (s === '' ? null : s))
    .refine((s) => s === null || s.length >= min, `Use at least ${min} characters`);

/** The guest-book fields of one person, each null until known. */
export const identityFieldsSchema = z.object({
  nationality: nationalitySchema.nullable(),
  dateOfBirth: isoDateSchema.nullable(),
  documentType: documentTypeSchema.nullable(),
  documentNumber: optionalText(30, 3),
  /** Home address; needed for guests from abroad. */
  address: optionalText(200),
});
export type IdentityFields = z.infer<typeof identityFieldsSchema>;

export const registrationFields = [
  'nationality',
  'dateOfBirth',
  'documentType',
  'documentNumber',
  'address',
] as const;
export const registrationFieldSchema = z.enum(registrationFields);
export type RegistrationField = z.infer<typeof registrationFieldSchema>;

/**
 * One person staying in a booking's room, with their guest-book entry. The main guest is linked to
 * their profile (`guestId`); companions are entered by name.
 */
export const stayGuestSchema = identityFieldsSchema.extend({
  id: z.string(),
  bookingId: z.string(),
  /** The guest profile, set for the booking's main guest. */
  guestId: z.string().nullable(),
  name: z.string(),
  /** When the ID details were last recorded; null until any were. */
  registeredAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export type StayGuest = z.infer<typeof stayGuestSchema>;

/** `POST /api/bookings/:id/guests`: a companion, with whatever ID details are known. */
export const newStayGuestBodySchema = identityFieldsSchema.partial().extend({
  name: z.string().trim().min(1).max(120),
  /** Set when the details came from an ID scan, which is then discarded. */
  scanId: z.string().optional(),
});
export type NewStayGuestBody = z.infer<typeof newStayGuestBodySchema>;

/**
 * `PATCH /api/bookings/:id/guests/:stayGuestId`: fields to change; null or blank clears one.
 * `scanId` marks values that came from an ID scan, which is then discarded.
 */
export const stayGuestPatchSchema = identityFieldsSchema
  .extend({ name: z.string().trim().min(1).max(120) })
  .partial()
  .extend({ scanId: z.string().optional() });
export type StayGuestPatch = z.infer<typeof stayGuestPatchSchema>;

export const stayGuestViewSchema = stayGuestSchema.extend({
  /** The booking's main guest; their name comes from the profile. */
  primary: z.boolean(),
  /** Guest-book fields still needed, empty when the entry is complete. */
  missing: z.array(registrationFieldSchema),
});
export type StayGuestView = z.infer<typeof stayGuestViewSchema>;

/** Everyone in a booking's room and how complete the guest book is. */
export const guestBookSchema = z.object({
  /** The main guest first, then companions in the order they were added. */
  guests: z.array(stayGuestViewSchema),
  /** Adults plus children on the booking. */
  partySize: z.number().int().nonnegative(),
  /** People without a complete entry, counting ones not added yet. */
  missing: z.number().int().nonnegative(),
  /** The main guest's details from an earlier stay, to prefill from. */
  previous: identityFieldsSchema.nullable(),
});
export type GuestBook = z.infer<typeof guestBookSchema>;
