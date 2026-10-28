import { z } from 'zod';
import { chargePatchSchema, newChargeBodySchema, newPaymentBodySchema } from './billing';
import { isoDateSchema } from './dates';
import { bookingPatchSchema, createHoldInputSchema, guestPatchSchema } from './operations';
import { newStayGuestBodySchema, stayGuestPatchSchema } from './registration';

const stayGuestRef = z.object({ bookingId: z.string(), stayGuestId: z.string() });
const chargeRef = z.object({ bookingId: z.string(), chargeId: z.string() });

/** A mutation the agent proposed. It runs only when a user confirms it. */
export const pendingActionInputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('create_hold'), input: createHoldInputSchema }),
  z.object({ kind: z.literal('confirm_booking'), input: z.object({ bookingId: z.string() }) }),
  z.object({ kind: z.literal('cancel_booking'), input: z.object({ bookingId: z.string() }) }),
  z.object({ kind: z.literal('check_in'), input: z.object({ bookingId: z.string() }) }),
  z.object({ kind: z.literal('check_out'), input: z.object({ bookingId: z.string() }) }),
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
  z.object({
    kind: z.literal('add_charge'),
    input: newChargeBodySchema.extend({ bookingId: z.string() }),
  }),
  z.object({
    kind: z.literal('record_payment'),
    input: newPaymentBodySchema.extend({ bookingId: z.string() }),
  }),
  z.object({
    kind: z.literal('update_charge'),
    input: chargePatchSchema.extend(chargeRef.shape),
  }),
  z.object({ kind: z.literal('remove_charge'), input: chargeRef }),
  z.object({
    kind: z.literal('add_stay_guest'),
    input: newStayGuestBodySchema.omit({ scanId: true }).extend({ bookingId: z.string() }),
  }),
  z.object({
    kind: z.literal('update_stay_guest'),
    input: stayGuestPatchSchema.omit({ scanId: true }).extend(stayGuestRef.shape),
  }),
  z.object({ kind: z.literal('remove_stay_guest'), input: stayGuestRef }),
  z.object({
    kind: z.literal('update_guest'),
    input: guestPatchSchema.extend({ guestId: z.string() }),
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
    /** The booking created or changed, once confirmed; null for a guest profile edit. */
    bookingId: z.string().nullable(),
    error: z.string().nullable(),
    createdAt: z.iso.datetime(),
    resolvedAt: z.iso.datetime().nullable(),
  }),
);
export type PendingAction = z.infer<typeof pendingActionSchema>;
