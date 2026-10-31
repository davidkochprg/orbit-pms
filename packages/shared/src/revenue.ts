import { z } from 'zod';
import { isoDateSchema } from './dates';
import { bookingSourceSchema } from './enums';
import { moneySchema } from './quote';
import { rateAdjustmentSchema } from './rates';

/** How much a local event lifts demand. */
export const eventImpacts = ['low', 'medium', 'high'] as const;
export const eventImpactSchema = z.enum(eventImpacts);
export type EventImpact = z.infer<typeof eventImpactSchema>;

/** Something in the area that brings guests, e.g. a race or a festival. */
export const localEventBodySchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    /** First and last night it affects, both included. */
    firstNight: isoDateSchema,
    lastNight: isoDateSchema,
    impact: eventImpactSchema,
  })
  .refine((e) => e.lastNight >= e.firstNight, {
    message: 'The last night must not be before the first',
    path: ['lastNight'],
  });
export type LocalEventBody = z.infer<typeof localEventBodySchema>;

export const localEventSchema = z.object({
  id: z.string(),
  name: z.string(),
  firstNight: isoDateSchema,
  lastNight: isoDateSchema,
  impact: eventImpactSchema,
});
export type LocalEvent = z.infer<typeof localEventSchema>;

export const weatherKinds = ['clear', 'cloudy', 'fog', 'rain', 'snow', 'storm'] as const;
export const weatherKindSchema = z.enum(weatherKinds);
export type WeatherKind = z.infer<typeof weatherKindSchema>;

/** One day of the forecast at the hotel. */
export const weatherDaySchema = z.object({
  date: isoDateSchema,
  kind: weatherKindSchema,
  tempMaxC: z.number(),
  tempMinC: z.number(),
  precipitationMm: z.number().nonnegative(),
  snowfallCm: z.number().nonnegative(),
});
export type WeatherDay = z.infer<typeof weatherDaySchema>;

/** `insight` is a signal from the model's review that the rules can't see, e.g. a group request. */
export const rateFactorKinds = ['demand', 'event', 'weather', 'insight'] as const;

/** One reason behind a suggested rate, with what it adds. */
export const rateFactorSchema = z.object({
  kind: z.enum(rateFactorKinds),
  /** E.g. "Almost full" or "Ski opening weekend". */
  label: z.string(),
  percent: z.number().int(),
  /** The evidence behind an insight, in a sentence. */
  detail: z.string().optional(),
});
export type RateFactor = z.infer<typeof rateFactorSchema>;

export const rateSignalStrengths = ['slight', 'moderate', 'strong'] as const;
export type RateSignalStrength = (typeof rateSignalStrengths)[number];

/**
 * Something the rules can't see that moves demand on a run of nights, from the model's review.
 * The model grades it; the domain turns the grade into a percent.
 */
export const rateSignalSchema = z.object({
  firstNight: isoDateSchema.describe('First night it affects, YYYY-MM-DD.'),
  lastNight: isoDateSchema.describe('Last night it affects, included, YYYY-MM-DD.'),
  direction: z.enum(['up', 'down']).describe('up: more demand than the rules assume. down: less.'),
  strength: z
    .enum(rateSignalStrengths)
    .describe('strong only with clear evidence, e.g. a block of rooms or a major holiday.'),
  label: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .describe('A few words for a list, e.g. "Thanksgiving weekend". No percent or price.'),
  reason: z
    .string()
    .trim()
    .min(1)
    .max(240)
    .describe('One sentence with the evidence. No percent or price.'),
});
export type RateSignal = z.infer<typeof rateSignalSchema>;

/** What the model returns from a review of the outlook. */
export const rateReviewOutputSchema = z.object({
  signals: z.array(rateSignalSchema).max(8),
});

/** The latest review, kept until the outlook it read changes. */
export const rateReviewSchema = z.object({
  /** A fingerprint of what the model read; a different one means it needs reviewing again. */
  basis: z.string(),
  reviewedAt: z.iso.datetime(),
  signals: z.array(rateSignalSchema),
});
export type RateReview = z.infer<typeof rateReviewSchema>;

/** A confirmed arrival that may not come, and why. */
export const arrivalRiskSchema = z.object({
  bookingId: z.string(),
  guestName: z.string(),
  roomName: z.string(),
  checkIn: isoDateSchema,
  source: bookingSourceSchema,
  /** Chance the room stays empty on the first night, 0 to 1. */
  chance: z.number().min(0).max(1),
  reasons: z.array(z.string()),
});
export type ArrivalRisk = z.infer<typeof arrivalRiskSchema>;

/** One room type's rate for a night, now and with the suggestion taken. */
export const nightRateSchema = z.object({
  roomType: z.string(),
  /** Per room, or per adult with `per_person` rates. */
  current: moneySchema,
  suggested: moneySchema,
});
export type NightRate = z.infer<typeof nightRateSchema>;

/** One night ahead: what is booked, what usually is, and the suggested rate. */
export const nightOutlookSchema = z.object({
  date: isoDateSchema,
  roomsSold: z.number().int().nonnegative(),
  /** Rooms that can be sold: all rooms except those out of order. */
  roomsTotal: z.number().int().nonnegative(),
  /** How full this weekday usually ends up, from the last eight weeks. Null without history. */
  typicalOccupancy: z.number().min(0).max(1).nullable(),
  /** The night's adjustment in percent, 0 when there is none. */
  currentPercent: z.number().int(),
  /** What the suggestion would set it to; equal to `currentPercent` when nothing changes. */
  suggestedPercent: z.number().int(),
  /** Each room type the hotel has rooms of, cheapest first. */
  rates: z.array(nightRateSchema),
  factors: z.array(rateFactorSchema),
  events: z.array(z.string()),
  weather: weatherDaySchema.nullable(),
  /** Expected rooms left empty by arrivals that don't come, e.g. 0.8. */
  expectedNoShows: z.number().nonnegative(),
});
export type NightOutlook = z.infer<typeof nightOutlookSchema>;

export const revenueOutlookSchema = z.object({
  today: isoDateSchema,
  nights: z.array(nightOutlookSchema),
  events: z.array(localEventSchema),
  /** Arrivals in the next seven nights most likely not to come, riskiest first. */
  arrivalRisks: z.array(arrivalRiskSchema),
  /** False when no forecast could be loaded. */
  weatherAvailable: z.boolean(),
  /** The model's review behind `insight` factors. */
  review: z.object({
    /** Fingerprint of what a review would read now. */
    basis: z.string(),
    /** Null before the first review. */
    reviewedAt: z.iso.datetime().nullable(),
    /** True when the stored review read what the outlook shows now. */
    current: z.boolean(),
  }),
});
export type RevenueOutlook = z.infer<typeof revenueOutlookSchema>;

/** Nights to set, each to a percent; 0 removes the night's adjustment. */
export const adjustRatesBodySchema = z.object({
  nights: z.array(rateAdjustmentSchema).min(1).max(120),
});
export type AdjustRatesBody = z.infer<typeof adjustRatesBodySchema>;

/** A short written read of the outlook, from the model. */
export const revenueBriefSchema = z.object({ text: z.string() });
export type RevenueBrief = z.infer<typeof revenueBriefSchema>;
