import type { GuestService, Repositories } from '@orbit/domain';
import { guestPatchSchema, newGuestBodySchema } from '@orbit/shared';
import { Hono } from 'hono';
import { notFound } from '../http';
import { validate } from '../validate';

export function guestRoutes(repos: Repositories, guests: GuestService) {
  return new Hono()
    .get('/guests', async (c) => c.json(await repos.guests.listGuests()))
    .post('/guests', validate('json', newGuestBodySchema), async (c) =>
      c.json(await guests.create(c.req.valid('json'), 'user'), 201),
    )
    .get('/guests/:id', async (c) => {
      const guest = await repos.guests.getGuest(c.req.param('id'));
      return guest ? c.json(guest) : notFound(c, 'Guest');
    })
    .patch('/guests/:id', validate('json', guestPatchSchema), async (c) =>
      c.json(await guests.update(c.req.param('id'), c.req.valid('json'), 'user')),
    );
}
