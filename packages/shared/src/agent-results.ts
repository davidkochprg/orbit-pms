import { z } from 'zod';
import { housekeepingTaskSchema } from './entities';
import { housekeepingTaskStatusSchema, roomStatusSchema } from './enums';

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
