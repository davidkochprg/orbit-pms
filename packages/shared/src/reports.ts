import { z } from 'zod';
import { paymentMethodSchema } from './billing';
import { isoDateSchema } from './dates';
import { bookingSourceSchema } from './enums';
import { czkSchema } from './quote';

/** A reporting period of hotel nights, `[from, to)`, at most a year. */
export const reportQuerySchema = z.object({
  from: isoDateSchema.describe('First night, YYYY-MM-DD.'),
  to: isoDateSchema.describe('Day after the last night, YYYY-MM-DD (exclusive).'),
});
export type ReportQuery = z.infer<typeof reportQuerySchema>;

/** Room nights and room revenue for one slice, e.g. a booking source or a room type. */
const sliceSchema = z.object({
  roomNights: z.number().int().nonnegative(),
  roomRevenue: czkSchema,
});

export const reportDaySchema = z.object({
  date: isoDateSchema,
  roomsSold: z.number().int().nonnegative(),
  /** Fraction 0–1. */
  occupancy: z.number(),
  roomRevenue: czkSchema,
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
  roomRevenue: czkSchema,
  /** Wellness, extra beds and dogs from the booked price. */
  addonRevenue: czkSchema,
  /** Extras posted to bills in the period. */
  extrasRevenue: czkSchema,
  /** Collected for the town, not revenue. */
  cityTax: czkSchema,
  /** Average daily rate: room revenue per room night sold. */
  adr: czkSchema,
  /** Revenue per available room night. */
  revpar: czkSchema,
  arrivals: z.number().int().nonnegative(),
  /** Average nights per stay arriving in the period; 0 without arrivals. */
  averageStay: z.number().nonnegative(),
  /** Bookings cancelled that had a night in the period. */
  cancellations: z.number().int().nonnegative(),
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
  payments: z.array(z.object({ method: paymentMethodSchema, amount: czkSchema })),
  /** Guests who left in the period and still owe money. */
  unpaidDepartures: z.array(
    z.object({
      bookingId: z.string(),
      guestName: z.string(),
      roomName: z.string(),
      checkOut: isoDateSchema,
      balance: czkSchema,
    }),
  ),
  days: z.array(reportDaySchema),
});
export type Report = z.infer<typeof reportSchema>;
