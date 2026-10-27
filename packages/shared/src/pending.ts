import { z } from 'zod';
import { isoDateSchema } from './dates';
import { bookingPatchSchema, createHoldInputSchema } from './operations';

/** A mutation the agent proposed. It runs only when a user confirms it. */
export const pendingActionInputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('create_hold'), input: createHoldInputSchema }),
  z.object({ kind: z.literal('confirm_booking'), input: z.object({ bookingId: z.string() }) }),
  z.object({ kind: z.literal('cancel_booking'), input: z.object({ bookingId: z.string() }) }),
  z.object({
    kind: z.literal('move_booking'),
    input: z.object({ bookingId: z.string(), roomId: z.string() }),
  }),
  z.object({
    kind: z.literal('change_dates'),
    input: z.object({ bookingId: z.string(), checkIn: isoDateSchema, checkOut: isoDateSchema }),
  }),
  z.object({
    kind: z.literal('update_booking'),
    input: bookingPatchSchema.extend({ bookingId: z.string() }),
  }),
]);
export type PendingActionInput = z.infer<typeof pendingActionInputSchema>;
export type PendingActionKind = PendingActionInput['kind'];

export const pendingActionStatuses = ['pending', 'confirmed', 'rejected', 'failed'] as const;
export const pendingActionStatusSchema = z.enum(pendingActionStatuses);
export type PendingActionStatus = z.infer<typeof pendingActionStatusSchema>;

export const pendingActionSchema = z.intersection(
  pendingActionInputSchema,
  z.object({
    id: z.string(),
    /** One line the confirm card shows, e.g. "Move Tomáš Novák from 104 to 201". */
    summary: z.string(),
    status: pendingActionStatusSchema,
    /** The booking created or changed, once confirmed. */
    bookingId: z.string().nullable(),
    error: z.string().nullable(),
    createdAt: z.iso.datetime(),
    resolvedAt: z.iso.datetime().nullable(),
  }),
);
export type PendingAction = z.infer<typeof pendingActionSchema>;
