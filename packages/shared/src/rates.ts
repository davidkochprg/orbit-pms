import { z } from 'zod';
import { isoDateSchema } from './dates';
import { roomKindSchema } from './enums';
import { currencySchema, moneySchema } from './quote';

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

/** A change to one night's rates, on top of its season, for every room type. */
export const rateAdjustmentSchema = z.object({
  /** The night, `YYYY-MM-DD`. */
  date: isoDateSchema,
  /** Percent added to the night's rate, e.g. 15 or -10. Never 0: no adjustment is no entry. */
  percent: z.number().int().min(-50).max(100),
});
export type RateAdjustment = z.infer<typeof rateAdjustmentSchema>;

/**
 * Whether prices include tax (European VAT) or tax is added on top of them (US sales and
 * occupancy taxes).
 */
export const taxModes = ['inclusive', 'exclusive'] as const;
export const taxModeSchema = z.enum(taxModes);
export type TaxMode = z.infer<typeof taxModeSchema>;

/** `per_person`: the base price is per guest per night, with child discounts. `per_room`: per room. */
export const pricingBases = ['per_person', 'per_room'] as const;
export const pricingBasisSchema = z.enum(pricingBases);
export type PricingBasis = z.infer<typeof pricingBasisSchema>;

/** A tax rate in percent with at most two decimals, e.g. 12 or 9.25. */
const percentSchema = z
  .number()
  .min(0)
  .max(50)
  .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-9, 'Use at most two decimals');

const taxRateSchema = z.object({
  /** What the bill calls it, e.g. "VAT", "Sales tax" or "Occupancy tax". */
  label: z.string().trim().min(1).max(40),
  rate: percentSchema,
});

/**
 * The two tax brackets bill lines fall into. `reduced` is lodging: accommodation and what
 * belongs to it (named after Czech VAT, where it is the reduced rate; a US occupancy tax).
 * `standard` is everything else, such as extras (VAT's standard rate; a US sales tax).
 */
export const taxConfigSchema = z.object({
  mode: taxModeSchema,
  standard: taxRateSchema,
  reduced: taxRateSchema,
});
export type TaxConfig = z.infer<typeof taxConfigSchema>;

const czechVat: TaxConfig = {
  mode: 'inclusive',
  standard: { label: 'VAT', rate: 21 },
  reduced: { label: 'VAT', rate: 12 },
};

/** Rates saved before taxes were configurable stored only VAT percentages, prices including it. */
function upgradeVat(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null || 'tax' in raw || !('vat' in raw)) return raw;
  const { vat, ...rest } = raw as { vat: { standard: number; reduced: number } };
  return {
    ...rest,
    tax: {
      mode: 'inclusive',
      standard: { label: 'VAT', rate: vat.standard },
      reduced: { label: 'VAT', rate: vat.reduced },
    },
  };
}

/** Everything `quote()` and the bill need besides room types. Money is whole `currency` units. */
export const pricingConfigSchema = z.preprocess(
  upgradeVat,
  z.object({
    /** Rates saved before it existed were in crowns. */
    currency: currencySchema.default('CZK'),
    pricingBasis: pricingBasisSchema.default('per_person'),
    /** Checked in order; the first season containing a night wins. Nights outside every season use multiplier 1. */
    seasons: z.array(seasonSchema).max(20),
    /** Sorted by `maxAge` ascending. Children older than the last tier pay the adult rate. */
    childDiscounts: z.array(childDiscountTierSchema).max(10),
    /** The tier with the highest `minNights` the stay reaches applies. */
    longStay: z.array(longStayTierSchema).max(10),
    wellness: z.object({
      perPersonPerNight: moneySchema.nonnegative(),
      minAge: z.number().int().min(0).max(17),
    }),
    extraBed: z.object({ perNight: moneySchema.nonnegative() }),
    dog: z.object({ perNight: moneySchema.nonnegative() }),
    /**
     * Local tourist tax, billed on the folio rather than in the quote. Guests from `minAge` pay it
     * (adults always). Rates saved before it existed read as none.
     */
    cityTax: z
      .object({
        /** What the bill calls it, e.g. "City tax" or "Tourism fee". */
        label: z.string().trim().min(1).max(40).default('City tax'),
        perPersonPerNight: moneySchema.nonnegative(),
        minAge: z.number().int().min(0).max(18),
      })
      .default({ label: 'City tax', perPersonPerNight: 0, minAge: 18 }),
    /** Tax brackets; rates saved before it existed read as Czech VAT included in prices. */
    tax: taxConfigSchema.default(czechVat),
    /** Per-night changes, one per date, from the Rates page; rates saved before read as none. */
    adjustments: z.array(rateAdjustmentSchema).max(500).default([]),
  }),
);
export type PricingConfig = z.infer<typeof pricingConfigSchema>;

/** A room type as a manager enters it; the ID is assigned on create. */
export const roomTypeBodySchema = z.object({
  name: z.string().trim().min(1).max(60),
  maxAdults: z.number().int().min(1).max(12),
  maxChildren: z.number().int().min(0).max(12),
  /** Per night before season multipliers: per adult, or per room (see `pricingBasis`). */
  basePrice: moneySchema.positive(),
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
