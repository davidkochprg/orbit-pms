import { z } from 'zod';
import { paymentMethodSchema } from './billing';
import { isoDateSchema } from './dates';
import { bookingSourceSchema } from './enums';
import { moneySchema } from './quote';

/** A reporting period of hotel nights, `[from, to)`, at most a year. */
export const reportQuerySchema = z.object({
  from: isoDateSchema.describe('First night, YYYY-MM-DD.'),
  to: isoDateSchema.describe('Day after the last night, YYYY-MM-DD (exclusive).'),
});
export type ReportQuery = z.infer<typeof reportQuerySchema>;

/** Room nights and room revenue for one slice, e.g. a booking source or a room type. */
const sliceSchema = z.object({
  roomNights: z.number().int().nonnegative(),
  roomRevenue: moneySchema,
  /** Room revenue per room night of the slice; 0 without nights. */
  adr: moneySchema,
});

/** One weekday across the period: how full it ran and at what rate. */
export const reportWeekdaySchema = z.object({
  /** ISO weekday: 1 is Monday, 7 is Sunday. */
  weekday: z.number().int().min(1).max(7),
  /** How many of the period's nights fall on this weekday. */
  nights: z.number().int().positive(),
  roomNights: z.number().int().nonnegative(),
  /** Fraction 0–1. */
  occupancy: z.number(),
  adr: moneySchema,
  revpar: moneySchema,
});
export type ReportWeekday = z.infer<typeof reportWeekdaySchema>;

/** Arrivals whose stay is `minNights` to `maxNights` long; `maxNights` null is open-ended. */
export const reportStayLengthSchema = z.object({
  minNights: z.number().int().positive(),
  maxNights: z.number().int().positive().nullable(),
  arrivals: z.number().int().nonnegative(),
});
export type ReportStayLength = z.infer<typeof reportStayLengthSchema>;

export const reportDaySchema = z.object({
  date: isoDateSchema,
  roomsSold: z.number().int().nonnegative(),
  /** Fraction 0–1. */
  occupancy: z.number(),
  roomRevenue: moneySchema,
});
export type ReportDay = z.infer<typeof reportDaySchema>;

/**
 * Performance over a period. A stay counts once it is confirmed, checked in or checked out; holds
 * and cancellations don't. Revenue is the booked price spread evenly over the stay's nights.
 */
export const reportSchema = z.object({
  from: isoDateSchema,
  to: isoDateSchema,
  nights: z.number().int().positive(),
  rooms: z.number().int().nonnegative(),
  roomNightsAvailable: z.number().int().nonnegative(),
  roomNightsSold: z.number().int().nonnegative(),
  /** Fraction 0–1. */
  occupancy: z.number(),
  /** Guest nights: every adult and child, every night. */
  guestNights: z.number().int().nonnegative(),
  /** Accommodation after child and long-stay discounts, without add-ons. */
  roomRevenue: moneySchema,
  /** Wellness, extra beds and dogs from the booked price. */
  addonRevenue: moneySchema,
  /** Extras posted to bills in the period. */
  extrasRevenue: moneySchema,
  /** Collected for the town, not revenue. */
  cityTax: moneySchema,
  /** Average daily rate: room revenue per room night sold. */
  adr: moneySchema,
  /** Revenue per available room night. */
  revpar: moneySchema,
  /** Room, add-on and extras revenue per available room night. */
  trevpar: moneySchema,
  arrivals: z.number().int().nonnegative(),
  /** Average nights per stay arriving in the period; 0 without arrivals. */
  averageStay: z.number().nonnegative(),
  /** Bookings cancelled that had a night in the period. */
  cancellations: z.number().int().nonnegative(),
  /** Fraction 0–1 of the bookings with a night in the period that were cancelled. */
  cancellationRate: z.number(),
  /** Arrivals by a guest who had stayed before. */
  returningArrivals: z.number().int().nonnegative(),
  /** Arrivals with at least one child. */
  arrivalsWithChildren: z.number().int().nonnegative(),
  /** Arrivals by length of stay, shortest first. */
  stayLengths: z.array(reportStayLengthSchema),
  /** Each weekday that falls in the period, Monday first. */
  byWeekday: z.array(reportWeekdaySchema),
  bySource: z.array(sliceSchema.extend({ source: bookingSourceSchema })),
  byRoomType: z.array(
    sliceSchema.extend({
      roomTypeId: z.string(),
      roomTypeName: z.string(),
      /** Fraction 0–1 of that type's rooms. */
      occupancy: z.number(),
    }),
  ),
  /** Money received minus refunds, by method, on days in the period. */
  payments: z.array(z.object({ method: paymentMethodSchema, amount: moneySchema })),
  /** Guests who left in the period and still owe money. */
  unpaidDepartures: z.array(
    z.object({
      bookingId: z.string(),
      guestName: z.string(),
      roomName: z.string(),
      checkOut: isoDateSchema,
      balance: moneySchema,
    }),
  ),
  days: z.array(reportDaySchema),
});
export type Report = z.infer<typeof reportSchema>;
