import { z } from 'zod';
import { isoDateSchema } from './dates';
import { bookingSourceSchema, bookingStatusSchema, languageSchema, roomKindSchema } from './enums';
import { quoteAddonsSchema } from './quote';

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

export const availabilityQuerySchema = z.object({
  checkIn: isoDateSchema,
  checkOut: isoDateSchema.describe('Departure date. Stays are [checkIn, checkOut).'),
  adults: z.number().int().positive(),
  childAges: childAgesSchema,
  kind: roomKindSchema.optional().describe('Only rooms or only apartments.'),
  roomTypeId: z.string().optional(),
});
export type AvailabilityQueryInput = z.infer<typeof availabilityQuerySchema>;

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
