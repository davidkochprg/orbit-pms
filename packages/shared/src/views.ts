import { z } from 'zod';
import { isoDateSchema } from './dates';
import { bookingSchema, guestSchema, roomSchema, roomTypeSchema } from './entities';
import { bookingActionSchema } from './enums';

/** A booking with the names needed to list it. */
export const bookingSummarySchema = z.object({
  booking: bookingSchema,
  guestName: z.string(),
  roomName: z.string(),
});
export type BookingSummary = z.infer<typeof bookingSummarySchema>;

/** Everything the booking drawer shows, including which status actions are allowed right now. */
export const bookingDetailSchema = z.object({
  booking: bookingSchema,
  guest: guestSchema,
  room: roomSchema,
  roomType: roomTypeSchema,
  allowedActions: z.array(bookingActionSchema),
});
export type BookingDetail = z.infer<typeof bookingDetailSchema>;

export const dayOverviewSchema = z.object({
  date: isoDateSchema,
  arrivals: z.array(bookingSummarySchema),
  departures: z.array(bookingSummarySchema),
  inHouse: z.array(bookingSummarySchema),
});
export type DayOverview = z.infer<typeof dayOverviewSchema>;
