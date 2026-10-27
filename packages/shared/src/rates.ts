import { z } from 'zod';
import { roomKindSchema } from './enums';
import { czkSchema } from './quote';

/** A day of the year, `MM-DD`. */
export const monthDaySchema = z
  .string()
  .regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, 'Use a day like 12-20 (MM-DD)');

/** A fraction from 0 to 1, e.g. 0.5 for half. */
const fractionSchema = z.number().min(0).max(1);

export const seasonSchema = z.object({
  /** Shown in quote lines with underscores as spaces, e.g. `winter_peak` → "winter peak". */
  name: z
    .string()
    .trim()
    .regex(/^[a-z0-9_]{1,40}$/, 'Use lowercase letters, digits and underscores'),
  /** First night of the season, `MM-DD`, inclusive. */
  from: monthDaySchema,
  /** Last night of the season, `MM-DD`, inclusive. May be earlier than `from` to wrap the new year. */
  to: monthDaySchema,
  /** Applied to the room type's per-person base price. */
  multiplier: z.number().positive().max(10),
});
export type Season = z.infer<typeof seasonSchema>;

export const childDiscountTierSchema = z.object({
  /** Children up to and including this age get this tier. */
  maxAge: z.number().int().min(0).max(17),
  /** Fraction of the adult rate taken off: 1 = free, 0.5 = half price. */
  discount: fractionSchema,
});
export type ChildDiscountTier = z.infer<typeof childDiscountTierSchema>;

export const longStayTierSchema = z.object({
  minNights: z.number().int().min(2).max(365),
  /** Fraction taken off accommodation (after child discounts). */
  discount: fractionSchema,
});
export type LongStayTier = z.infer<typeof longStayTierSchema>;

/** Everything `quote()` needs besides the room type's base price. Money is whole CZK. */
export const pricingConfigSchema = z.object({
  /** Checked in order; the first season containing a night wins. Nights outside every season use multiplier 1. */
  seasons: z.array(seasonSchema).max(20),
  /** Sorted by `maxAge` ascending. Children older than the last tier pay the adult rate. */
  childDiscounts: z.array(childDiscountTierSchema).max(10),
  /** The tier with the highest `minNights` the stay reaches applies. */
  longStay: z.array(longStayTierSchema).max(10),
  wellness: z.object({
    perPersonPerNight: czkSchema.nonnegative(),
    minAge: z.number().int().min(0).max(17),
  }),
  extraBed: z.object({ perNight: czkSchema.nonnegative() }),
  dog: z.object({ perNight: czkSchema.nonnegative() }),
});
export type PricingConfig = z.infer<typeof pricingConfigSchema>;

/** A room type as a manager enters it; the ID is assigned on create. */
export const roomTypeBodySchema = z.object({
  name: z.string().trim().min(1).max(60),
  maxAdults: z.number().int().min(1).max(12),
  maxChildren: z.number().int().min(0).max(12),
  /** Adult rate per person per night, whole CZK, before season multipliers. */
  basePrice: czkSchema.positive(),
  description: z.string().trim().max(300),
});
export type RoomTypeBody = z.infer<typeof roomTypeBodySchema>;

/** A room as a manager enters it. Housekeeping status is set on the board, not here. */
export const roomBodySchema = z.object({
  name: z.string().trim().min(1).max(20),
  roomTypeId: z.string().min(1),
  kind: roomKindSchema,
  floor: z.number().int().min(-5).max(100),
});
export type RoomBody = z.infer<typeof roomBodySchema>;
