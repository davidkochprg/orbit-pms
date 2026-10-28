import type { RegistrationService } from '@orbit/domain';
import { newStayGuestBodySchema, stayGuestPatchSchema } from '@orbit/shared';
import { Hono } from 'hono';
import { validate } from '../validate';

/** The guest book of a stay: everyone in the room. REST callers act as `user`. */
export function registrationRoutes(registrations: RegistrationService) {
  return new Hono()
    .get('/bookings/:id/guests', async (c) =>
      c.json(await registrations.getGuestBook(c.req.param('id'))),
    )
    .post('/bookings/:id/guests', validate('json', newStayGuestBodySchema), async (c) =>
      c.json(await registrations.addGuest(c.req.param('id'), c.req.valid('json'), 'user'), 201),
    )
    .patch('/bookings/:id/guests/:stayGuestId', validate('json', stayGuestPatchSchema), async (c) =>
      c.json(
        await registrations.updateGuest(
          c.req.param('id'),
          c.req.param('stayGuestId'),
          c.req.valid('json'),
          'user',
        ),
      ),
    )
    .delete('/bookings/:id/guests/:stayGuestId', async (c) =>
      c.json(
        await registrations.removeGuest(c.req.param('id'), c.req.param('stayGuestId'), 'user'),
      ),
    );
}
