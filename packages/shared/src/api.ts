import { z } from 'zod';
import { isoDateSchema } from './dates';
import { bookingStatusSchema } from './enums';

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
