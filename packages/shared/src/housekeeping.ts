import { z } from 'zod';
import { isoDateSchema } from './dates';
import { housekeepingTaskSchema, roomSchema } from './entities';
import {
  housekeepingTaskStatusSchema,
  housekeepingTaskTypeSchema,
  roomStatusSchema,
} from './enums';

/** What happens in a room today, from the bookings. `turnover` = one guest leaves, another arrives. */
export const roomOccupancies = ['turnover', 'arriving', 'departing', 'staying', 'vacant'] as const;
export const roomOccupancySchema = z.enum(roomOccupancies);
export type RoomOccupancy = z.infer<typeof roomOccupancySchema>;

/** One room on the housekeeping board. */
export const housekeepingRoomSchema = z.object({
  room: roomSchema,
  roomTypeName: z.string(),
  occupancy: roomOccupancySchema,
  /** The guest arriving today, or else the one staying or leaving. */
  guestName: z.string().nullable(),
  /** True when a guest arrives today and the room is not inspected yet. */
  urgent: z.boolean(),
  openTasks: z.array(housekeepingTaskSchema),
});
export type HousekeepingRoom = z.infer<typeof housekeepingRoomSchema>;

export const housekeepingBoardSchema = z.object({
  date: isoDateSchema,
  rooms: z.array(housekeepingRoomSchema),
});
export type HousekeepingBoard = z.infer<typeof housekeepingBoardSchema>;

export const roomStatusBodySchema = z.object({ status: roomStatusSchema });
export type RoomStatusBody = z.infer<typeof roomStatusBodySchema>;

export const newTaskBodySchema = z.object({
  roomId: z.string().min(1),
  type: housekeepingTaskTypeSchema,
  notes: z.string().trim().max(500).nullable().default(null),
});
export type NewTaskBody = z.infer<typeof newTaskBodySchema>;

export const taskStatusBodySchema = z.object({ status: housekeepingTaskStatusSchema });
export type TaskStatusBody = z.infer<typeof taskStatusBodySchema>;

/** A housekeeping note typed instead of recorded. */
export const housekeepingNoteBodySchema = z.object({ text: z.string().trim().min(1).max(2000) });
export type HousekeepingNoteBody = z.infer<typeof housekeepingNoteBodySchema>;

/** What the model reads from a housekeeping note. Room names are resolved by the domain. */
export const housekeepingNoteReadingSchema = z.object({
  updates: z.array(
    z.object({
      /** The room as the speaker said it, e.g. "104" or "A1". */
      room: z.string(),
      status: roomStatusSchema.nullable(),
      /** Something broken or missing that needs a maintenance task, in English. */
      issue: z.string().nullable(),
    }),
  ),
  /** Anything the model could not map to a room or status, in English. */
  unclear: z.string().nullable(),
});
export type HousekeepingNoteReading = z.infer<typeof housekeepingNoteReadingSchema>;

export const housekeepingChangeSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('room_status'),
    roomId: z.string(),
    roomName: z.string(),
    from: roomStatusSchema,
    to: roomStatusSchema,
  }),
  z.object({ kind: z.literal('task_created'), roomName: z.string(), task: housekeepingTaskSchema }),
]);
export type HousekeepingChange = z.infer<typeof housekeepingChangeSchema>;

/** What a note did. Changes are applied right away (ADR 0006); `skipped` explains the rest. */
export const housekeepingNoteResultSchema = z.object({
  transcript: z.string(),
  changes: z.array(housekeepingChangeSchema),
  skipped: z.array(z.object({ room: z.string(), reason: z.string() })),
  unclear: z.string().nullable(),
});
export type HousekeepingNoteResult = z.infer<typeof housekeepingNoteResultSchema>;
