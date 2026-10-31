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

export const rateFactorKinds = ['demand', 'event', 'weather'] as const;

/** One reason behind a suggested rate, with what it adds. */
export const rateFactorSchema = z.object({
  kind: z.enum(rateFactorKinds),
  /** E.g. "Almost full" or "Ski opening weekend". */
  label: z.string(),
  percent: z.number().int(),
});
export type RateFactor = z.infer<typeof rateFactorSchema>;

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
