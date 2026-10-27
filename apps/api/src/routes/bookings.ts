import type { HotelService, Repositories } from '@orbit/domain';
import {
  bookingActionBodySchema,
  bookingListQuerySchema,
  changeDatesBodySchema,
  moveBookingBodySchema,
} from '@orbit/shared';
import { Hono } from 'hono';
import { validate } from '../validate';

/** Booking reads and mutations. REST callers act as `user`; the agent goes through its own tools. */
export function bookingRoutes(repos: Repositories, service: HotelService) {
  return new Hono()
    .get('/bookings', validate('query', bookingListQuerySchema), async (c) => {
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
    })
    .get('/bookings/:id', async (c) => c.json(await service.getBookingDetail(c.req.param('id'))))
    .post('/bookings/:id/actions', validate('json', bookingActionBodySchema), async (c) => {
      const id = c.req.param('id');
      await service.applyBookingAction(id, c.req.valid('json').action, 'user');
      return c.json(await service.getBookingDetail(id));
    })
    .post('/bookings/:id/move', validate('json', moveBookingBodySchema), async (c) => {
      const id = c.req.param('id');
      await service.moveBooking(id, c.req.valid('json').roomId, 'user');
      return c.json(await service.getBookingDetail(id));
    })
    .post('/bookings/:id/dates', validate('json', changeDatesBodySchema), async (c) => {
      const id = c.req.param('id');
      await service.changeBookingDates(id, c.req.valid('json'), 'user');
      return c.json(await service.getBookingDetail(id));
    });
}
