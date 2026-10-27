import { zValidator } from '@hono/zod-validator';
import type { Repositories } from '@orbit/domain';
import { bookingListQuerySchema } from '@orbit/shared';
import { Hono } from 'hono';
import { errorBody, notFound } from '../http';

export function bookingRoutes(repos: Repositories) {
  return new Hono()
    .get(
      '/bookings',
      zValidator('query', bookingListQuerySchema, (result, c) =>
        result.success
          ? undefined
          : c.json(errorBody('invalid_query', result.error.issues[0]?.message ?? ''), 400),
      ),
      async (c) => {
        const { from, to, status, guestId, roomId } = c.req.valid('query');
        return c.json(
          await repos.bookings.listBookings({
            ...(from && { from }),
            ...(to && { to }),
            ...(status && { status }),
            ...(guestId && { guestId }),
            ...(roomId && { roomId }),
          }),
        );
      },
    )
    .get('/bookings/:id', async (c) => {
      const booking = await repos.bookings.getBooking(c.req.param('id'));
      return booking ? c.json(booking) : notFound(c, 'Booking');
    });
}
