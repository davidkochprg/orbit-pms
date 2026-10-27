import type { HotelService, Repositories } from '@orbit/domain';
import {
  bookingActionBodySchema,
  bookingListQuerySchema,
  bookingPatchSchema,
  type BookingPreview,
  changeDatesBodySchema,
  createBookingInputSchema,
  moveBookingBodySchema,
  quoteInputSchema,
  rescheduleBodySchema,
  roomOptionsQuerySchema,
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
    .post('/bookings', validate('json', createBookingInputSchema), async (c) => {
      const booking = await service.createBooking(c.req.valid('json'), 'user');
      return c.json(await service.getBookingDetail(booking.id), 201);
    })
    .get('/bookings/:id', async (c) => c.json(await service.getBookingDetail(c.req.param('id'))))
    .patch('/bookings/:id', validate('json', bookingPatchSchema), async (c) => {
      const id = c.req.param('id');
      await service.updateBooking(id, c.req.valid('json'), 'user');
      return c.json(await service.getBookingDetail(id));
    })
    .post('/bookings/:id/preview', validate('json', bookingPatchSchema), async (c) => {
      const { booking, room } = await service.previewUpdate(c.req.param('id'), c.req.valid('json'));
      return c.json<BookingPreview>({ booking, room });
    })
    .post('/availability', validate('json', roomOptionsQuerySchema), async (c) =>
      c.json(await service.roomOptions(c.req.valid('json'))),
    )
    .post('/quote', validate('json', quoteInputSchema), async (c) =>
      c.json(await service.quoteStay(c.req.valid('json'))),
    )
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
    })
    .post('/bookings/:id/reschedule', validate('json', rescheduleBodySchema), async (c) => {
      const id = c.req.param('id');
      await service.rescheduleBooking(id, c.req.valid('json'), 'user');
      return c.json(await service.getBookingDetail(id));
    });
}
