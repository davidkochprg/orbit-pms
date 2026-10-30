import { z } from 'zod';
import { isoDateSchema } from './dates';
import { bookingStatusSchema } from './enums';
import { moneySchema } from './quote';

/** A stay in a room that went out of order, and the free room it can move to. */
export const relocationSchema = z.object({
  bookingId: z.string(),
  guestName: z.string(),
  checkIn: isoDateSchema,
  checkOut: isoDateSchema,
  status: bookingStatusSchema,
  /** Null when no room is free for the whole stay. */
  toRoomId: z.string().nullable(),
  toRoomName: z.string().nullable(),
  /** The new room is of the same type; otherwise it is another type the party fits, same price. */
  sameType: z.boolean(),
});
export type Relocation = z.infer<typeof relocationSchema>;

/**
 * Something a change elsewhere made worth acting on, worked out from current data: stays booked
 * into a room that is out of order, or a guest's request that a room is free for again.
 */
export const knockOnSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('relocate'),
    /** Stable while the situation is the same, so a dismissed one stays dismissed. */
    id: z.string(),
    roomId: z.string(),
    roomName: z.string(),
    moves: z.array(relocationSchema).min(1),
  }),
  z.object({
    kind: z.literal('opening'),
    id: z.string(),
    inquiryId: z.string(),
    guestName: z.string(),
    checkIn: isoDateSchema,
    checkOut: isoDateSchema,
    /** How many rooms are free for the request now, and the cheapest total among them. */
    rooms: z.number().int().positive(),
    fromTotal: moneySchema,
  }),
]);
export type KnockOn = z.infer<typeof knockOnSchema>;

export const relocateBodySchema = z.object({
  moves: z
    .array(z.object({ bookingId: z.string(), roomId: z.string() }))
    .min(1)
    .max(20),
});
export type RelocateBody = z.infer<typeof relocateBodySchema>;
