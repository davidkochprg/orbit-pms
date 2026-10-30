import { z } from 'zod';
import { isoDateSchema } from './dates';
import { housekeepingTaskSchema } from './entities';
import { bookingStatusSchema, housekeepingTaskStatusSchema, roomStatusSchema } from './enums';
import { moneySchema } from './quote';
import { relocationSchema } from './knock-on';

/**
 * What the agent's tools return where the app shows it as a card: the tools build these and the
 * command bar parses them, so both sides agree on the shape.
 */

/** `setRoomStatus`: done straight away; `from` lets staff set it back. */
export const agentRoomStatusResultSchema = z.object({
  done: z.literal(true),
  roomId: z.string(),
  roomName: z.string(),
  from: roomStatusSchema,
  status: roomStatusSchema,
  /** Out of order: the stays still booked in the room, each with a free room to move to. */
  relocations: z.array(relocationSchema).optional(),
});
export type AgentRoomStatusResult = z.infer<typeof agentRoomStatusResultSchema>;

/** `createHousekeepingTask`. */
export const agentTaskCreatedResultSchema = z.object({
  done: z.literal(true),
  roomName: z.string(),
  task: housekeepingTaskSchema,
});
export type AgentTaskCreatedResult = z.infer<typeof agentTaskCreatedResultSchema>;

/** `setTaskStatus`: done straight away; `from` lets staff set it back. */
export const agentTaskStatusResultSchema = agentTaskCreatedResultSchema.extend({
  from: housekeepingTaskStatusSchema,
});
export type AgentTaskStatusResult = z.infer<typeof agentTaskStatusResultSchema>;

/** A booking as `getArrivals`, `getDepartures` and `searchBookings` list it. */
export const agentBookingRowSchema = z.object({
  bookingId: z.string(),
  guestId: z.string(),
  guestName: z.string(),
  roomName: z.string(),
  roomId: z.string(),
  checkIn: isoDateSchema,
  checkOut: isoDateSchema,
  status: bookingStatusSchema,
  adults: z.number().int(),
  childAges: z.array(z.number().int()),
  total: moneySchema.nullable(),
});
export type AgentBookingRow = z.infer<typeof agentBookingRowSchema>;
