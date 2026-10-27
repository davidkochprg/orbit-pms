import { z } from 'zod';
import { isoDateSchema } from './dates';
import { auditLogEntrySchema } from './entities';
import { bookingActionSchema, bookingStatusSchema } from './enums';

/** Query string for `GET /api/bookings`. `status` is comma-separated. */
export const bookingListQuerySchema = z.object({
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  status: z
    .string()
    .transform((s) => s.split(',').filter(Boolean))
    .pipe(z.array(bookingStatusSchema))
    .optional(),
  guestId: z.string().optional(),
  roomId: z.string().optional(),
});
export type BookingListQuery = z.infer<typeof bookingListQuerySchema>;

export const healthSchema = z.object({
  status: z.literal('ok'),
  ai: z.object({ configured: z.boolean() }),
});
export type Health = z.infer<typeof healthSchema>;

export const apiErrorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export const bookingActionBodySchema = z.object({ action: bookingActionSchema });
export type BookingActionBody = z.infer<typeof bookingActionBodySchema>;

export const moveBookingBodySchema = z.object({ roomId: z.string().min(1) });
export type MoveBookingBody = z.infer<typeof moveBookingBodySchema>;

export const changeDatesBodySchema = z.object({ checkIn: isoDateSchema, checkOut: isoDateSchema });
export type ChangeDatesBody = z.infer<typeof changeDatesBodySchema>;

export const dayQuerySchema = z.object({ date: isoDateSchema.optional() });

export const auditLogQuerySchema = z.object({
  subjectId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const auditLogListSchema = z.array(auditLogEntrySchema);
