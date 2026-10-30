import { z } from 'zod';
import { chargePatchSchema, newChargeBodySchema, newPaymentBodySchema } from './billing';
import { replyProposalSchema } from './api';
import { isoDateSchema } from './dates';
import { hotelInfoProposalSchema } from './hotel';
import { bookingPatchSchema, createHoldInputSchema, guestPatchSchema } from './operations';
import { moneySchema } from './quote';
import { newStayGuestBodySchema, stayGuestPatchSchema } from './registration';
import { roomBodySchema } from './rates';
import { adjustRatesBodySchema, localEventBodySchema } from './revenue';

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
  z.object({ kind: z.literal('adjust_rates'), input: adjustRatesBodySchema }),
  z.object({ kind: z.literal('save_hotel_info'), input: hotelInfoProposalSchema }),
  z.object({ kind: z.literal('remove_hotel_info'), input: z.object({ title: z.string() }) }),
  z.object({ kind: z.literal('send_reply'), input: replyProposalSchema }),
  z.object({
    kind: z.literal('hold_inquiry'),
    input: z.object({ inquiryId: z.string(), roomId: z.string() }),
  }),
  z.object({ kind: z.literal('decline_inquiry'), input: z.object({ inquiryId: z.string() }) }),
  z.object({ kind: z.literal('add_local_event'), input: localEventBodySchema }),
  z.object({ kind: z.literal('remove_local_event'), input: z.object({ eventId: z.string() }) }),
  z.object({
    kind: z.literal('update_room'),
    input: roomBodySchema.partial().extend({ roomId: z.string() }),
  }),
]);
export type PendingActionInput = z.infer<typeof pendingActionInputSchema>;
export type PendingActionKind = PendingActionInput['kind'];

/** One side of a change on a confirm card: words, or a stay the app formats as dates. */
export const pendingValueSchema = z.union([
  z.object({ text: z.string() }),
  z.object({ checkIn: isoDateSchema, checkOut: isoDateSchema }),
]);
export type PendingValue = z.infer<typeof pendingValueSchema>;

/**
 * What a proposed change does, for the confirm card: worked out by the domain when the change is
 * proposed, so the card shows the data as it was then.
 */
export const pendingActionDetailsSchema = z.object({
  /** One row per thing that changes, e.g. Room 104 → 201. `before` is null for something new,
   * `after` null for something removed. */
  changes: z.array(
    z.object({
      label: z.string(),
      before: pendingValueSchema.nullable(),
      after: pendingValueSchema.nullable(),
    }),
  ),
  /** The money it moves: the stay's total or the bill's balance, before and after. */
  amount: z
    .object({ label: z.string(), before: moneySchema.nullable(), after: moneySchema })
    .nullable(),
  /** What the staff member should know before confirming, e.g. IDs still missing. */
  note: z.string().nullable(),
});
export type PendingActionDetails = z.infer<typeof pendingActionDetailsSchema>;

export const pendingActionStatuses = ['pending', 'confirmed', 'rejected', 'failed'] as const;
export const pendingActionStatusSchema = z.enum(pendingActionStatuses);
export type PendingActionStatus = z.infer<typeof pendingActionStatusSchema>;

export const pendingActionSchema = z.intersection(
  pendingActionInputSchema,
  z.object({
    id: z.string(),
    /** One line the confirm card shows, e.g. "Move Tomáš Novák from 104 to 201". */
    summary: z.string(),
    /** Null for actions proposed before details were recorded. */
    details: pendingActionDetailsSchema.nullable().default(null),
    status: pendingActionStatusSchema,
    /** The booking created or changed, once confirmed; null for a guest profile edit. */
    bookingId: z.string().nullable(),
    error: z.string().nullable(),
    createdAt: z.iso.datetime(),
    resolvedAt: z.iso.datetime().nullable(),
  }),
);
export type PendingAction = z.infer<typeof pendingActionSchema>;
