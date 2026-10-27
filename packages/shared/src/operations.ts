import { z } from 'zod';
import { isoDateSchema } from './dates';
import { roomTypeSchema } from './entities';
import { bookingSourceSchema, bookingStatusSchema, languageSchema, roomKindSchema } from './enums';
import { quoteAddonsSchema, quoteSchema } from './quote';

const childAgesSchema = z
  .array(z.number().int().min(0).max(17))
  .describe('Age in years of each child, e.g. [4, 9]. Empty if no children.');

/** Who a new hold is for: an existing guest, or details for a new guest record. */
export const holdGuestSchema = z.union([
  z.object({ guestId: z.string() }),
  z.object({
    name: z.string().min(1),
    email: z.string().nullable().default(null),
    phone: z.string().nullable().default(null),
    language: languageSchema,
  }),
]);
export type HoldGuest = z.infer<typeof holdGuestSchema>;

export const createHoldInputSchema = z.object({
  guest: holdGuestSchema,
  roomId: z.string(),
  checkIn: isoDateSchema,
  checkOut: isoDateSchema,
  adults: z.number().int().positive(),
  childAges: childAgesSchema,
  addons: quoteAddonsSchema.default({ wellness: false, dogs: 0, extraBeds: 0 }),
  source: bookingSourceSchema.default('email'),
  notes: z.string().nullable().default(null),
  inquiryId: z.string().nullable().default(null),
});
export type CreateHoldInput = z.infer<typeof createHoldInputSchema>;

/** A booking entered by staff: a hold, or confirmed straight away (e.g. a phone booking). */
export const createBookingInputSchema = createHoldInputSchema.extend({
  status: z.enum(['hold', 'confirmed']).default('hold'),
});
export type CreateBookingInput = z.infer<typeof createBookingInputSchema>;

/**
 * Changes to a booking; omitted fields stay as they are. `addons` replaces all three add-ons.
 * Room and dates follow the move and date-change rules; the party must fit the room.
 */
export const bookingPatchSchema = z
  .object({
    roomId: z.string().min(1).describe('Room ID, e.g. "rm_201".'),
    checkIn: isoDateSchema,
    checkOut: isoDateSchema,
    adults: z.number().int().positive(),
    childAges: childAgesSchema,
    addons: quoteAddonsSchema,
    source: bookingSourceSchema,
    notes: z.string().trim().max(1000).nullable(),
  })
  .partial();
export type BookingPatch = z.infer<typeof bookingPatchSchema>;

export const availabilityQuerySchema = z.object({
  checkIn: isoDateSchema,
  checkOut: isoDateSchema.describe('Departure date. Stays are [checkIn, checkOut).'),
  adults: z.number().int().positive(),
  childAges: childAgesSchema,
  kind: roomKindSchema.optional().describe('Only rooms or only apartments.'),
  roomTypeId: z.string().optional(),
});
export type AvailabilityQueryInput = z.infer<typeof availabilityQuerySchema>;

/** `POST /api/availability`: free rooms for a stay, each priced with its add-ons. */
export const roomOptionsQuerySchema = availabilityQuerySchema.extend({
  addons: quoteAddonsSchema.default({ wellness: false, dogs: 0, extraBeds: 0 }),
  /** The booking being edited, so its own nights don't count as taken. */
  excludeBookingId: z.string().optional(),
});
export type RoomOptionsQuery = z.infer<typeof roomOptionsQuerySchema>;

export const roomOptionSchema = z.object({
  roomId: z.string(),
  roomName: z.string(),
  kind: roomKindSchema,
  roomType: roomTypeSchema,
  quote: quoteSchema,
});
export type RoomOption = z.infer<typeof roomOptionSchema>;

const optionalField = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((s) => (s === '' ? null : s));

export const newGuestBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z
    .union([z.literal(''), z.email()])
    .nullable()
    .default(null)
    .transform((s) => (s === '' ? null : s)),
  phone: optionalField(50).default(null),
  language: languageSchema,
  notes: optionalField(2000).default(null),
});
export type NewGuestBody = z.infer<typeof newGuestBodySchema>;

export const guestPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    email: z
      .union([z.literal(''), z.email()])
      .nullable()
      .transform((s) => (s === '' ? null : s)),
    phone: optionalField(50),
    language: languageSchema,
    notes: optionalField(2000),
  })
  .partial();
export type GuestPatch = z.infer<typeof guestPatchSchema>;

export const quoteInputSchema = z
  .object({
    roomId: z.string().optional(),
    roomTypeId: z.string().optional(),
    checkIn: isoDateSchema,
    checkOut: isoDateSchema,
    adults: z.number().int().positive(),
    childAges: childAgesSchema,
    addons: quoteAddonsSchema.default({ wellness: false, dogs: 0, extraBeds: 0 }),
  })
  .refine((q) => q.roomId !== undefined || q.roomTypeId !== undefined, {
    message: 'Provide roomId or roomTypeId',
  });
export type QuoteInput = z.infer<typeof quoteInputSchema>;

export const bookingSearchSchema = z.object({
  guestName: z.string().optional().describe('Part of the guest name; accents and case ignored.'),
  roomName: z.string().optional().describe('Room number or name, e.g. "104" or "A1".'),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  status: z.array(bookingStatusSchema).optional(),
});
export type BookingSearch = z.infer<typeof bookingSearchSchema>;
