import type { RegistrationService } from '@orbit/domain';
import { registrationBodySchema } from '@orbit/shared';
import { Hono } from 'hono';
import { validate } from '../validate';

/** The guest book entry of a stay. Check-in needs one. REST callers act as `user`. */
export function registrationRoutes(registrations: RegistrationService) {
  return new Hono()
    .get('/bookings/:id/registration', async (c) =>
      c.json(await registrations.getView(c.req.param('id'))),
    )
    .put('/bookings/:id/registration', validate('json', registrationBodySchema), async (c) =>
      c.json(await registrations.register(c.req.param('id'), c.req.valid('json'), 'user')),
    );
}
