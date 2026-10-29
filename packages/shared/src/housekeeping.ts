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

/** How much work a room is today, from who stayed, who arrives and what their notes say. */
export const cleaningEfforts = ['light', 'standard', 'heavy'] as const;
export const cleaningEffortSchema = z.enum(cleaningEfforts);
export type CleaningEffort = z.infer<typeof cleaningEffortSchema>;

/** One room on the housekeeping board. */
export const housekeepingRoomSchema = z.object({
  room: roomSchema,
  roomTypeName: z.string(),
  occupancy: roomOccupancySchema,
  /** The guest arriving today, or else the one staying or leaving. */
  guestName: z.string().nullable(),
  /** True when a guest arrives today and the room is not inspected yet. */
  urgent: z.boolean(),
  /** Null for a vacant room nobody stayed in or arrives to. */
  effort: cleaningEffortSchema.nullable(),
  /** Why, in a few words each, e.g. "Dog", "2 kids", "Cot". */
  cues: z.array(z.string()),
  openTasks: z.array(housekeepingTaskSchema),
});
export type HousekeepingRoom = z.infer<typeof housekeepingRoomSchema>;

export const housekeepingBoardSchema = z.object({
  date: isoDateSchema,
  rooms: z.array(housekeepingRoomSchema),
  /** Stays on the board whose notes and messages changed since the model last read them. */
  unreadStays: z.number().int().nonnegative(),
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

/** What the model reads from one stay's notes and guest messages, for housekeeping. */
export const stayReadingSchema = z.object({
  bookingId: z.string(),
  pets: z.boolean().describe('The guests bring a dog or another pet.'),
  mess: z
    .enum(['usual', 'more', 'much_more'])
    .describe('How much more cleaning the room will need after this stay than a usual stay.'),
  messReason: z
    .string()
    .nullable()
    .describe('Why there is more mess, in at most three English words; null when usual.'),
  prepare: z
    .array(z.string())
    .describe('Things to set up before arrival, at most three English words each; [] if none.'),
});
export type StayReading = z.infer<typeof stayReadingSchema>;

export const stayReadingsSchema = z.object({ stays: z.array(stayReadingSchema) });
export type StayReadings = z.infer<typeof stayReadingsSchema>;

/** A stay's text as the model read it. A different text means it needs reading again. */
export const savedStayReadingSchema = stayReadingSchema.extend({
  source: z.string(),
  readAt: z.iso.datetime(),
});
export type SavedStayReading = z.infer<typeof savedStayReadingSchema>;
