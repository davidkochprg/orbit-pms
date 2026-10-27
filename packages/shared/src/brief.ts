import { z } from 'zod';
import { isoDateSchema } from './dates';
import { roomStatusSchema } from './enums';
import { bookingSummarySchema } from './views';

/** A room where one guest leaves and another arrives today. */
export const briefTurnoverSchema = z.object({
  roomId: z.string(),
  roomName: z.string(),
  status: roomStatusSchema,
  departingGuest: z.string(),
  arrivingGuest: z.string(),
});
export type BriefTurnover = z.infer<typeof briefTurnoverSchema>;

/** A room a guest arrives in today that is not inspected yet. */
export const briefRoomToPrepareSchema = z.object({
  roomId: z.string(),
  roomName: z.string(),
  status: roomStatusSchema,
  guestName: z.string(),
  bookingId: z.string(),
});
export type BriefRoomToPrepare = z.infer<typeof briefRoomToPrepareSchema>;

/** An unconfirmed hold that needs a decision soon. */
export const briefHoldSchema = z.object({
  summary: bookingSummarySchema,
  /** The hold lapsed: the room is no longer blocked for the guest. */
  expired: z.boolean(),
});
export type BriefHold = z.infer<typeof briefHoldSchema>;

/** Empty nights between two stays in one room, too short to sell easily. */
export const briefGapSchema = z.object({
  roomId: z.string(),
  roomName: z.string(),
  /** First empty night. */
  from: isoDateSchema,
  /** The next guest's arrival. */
  to: isoDateSchema,
  nights: z.number().int().positive(),
});
export type BriefGap = z.infer<typeof briefGapSchema>;

export const briefMaintenanceSchema = z.object({
  taskId: z.string(),
  roomId: z.string(),
  roomName: z.string(),
  notes: z.string().nullable(),
});
export type BriefMaintenance = z.infer<typeof briefMaintenanceSchema>;

/** What the staff need to know about a day, computed from bookings, rooms, tasks and messages. */
export const dailyBriefSchema = z.object({
  date: isoDateSchema,
  /** Rooms taken tonight out of all rooms; out-of-order rooms count as not sellable. */
  occupancy: z.object({
    occupied: z.number().int().nonnegative(),
    sellable: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  }),
  /** Adults and children sleeping in the hotel tonight. */
  guestsTonight: z.number().int().nonnegative(),
  arrivals: z.number().int().nonnegative(),
  departures: z.number().int().nonnegative(),
  turnovers: z.array(briefTurnoverSchema),
  roomsToPrepare: z.array(briefRoomToPrepareSchema),
  holds: z.array(briefHoldSchema),
  outOfOrder: z.array(z.object({ roomId: z.string(), roomName: z.string() })),
  maintenance: z.array(briefMaintenanceSchema),
  /** Inbox messages without a sent reply. */
  unansweredMessages: z.number().int().nonnegative(),
  gaps: z.array(briefGapSchema),
});
export type DailyBrief = z.infer<typeof dailyBriefSchema>;
