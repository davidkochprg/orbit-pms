import type { Repositories } from '@orbit/domain';
import { Hono } from 'hono';
import { notFound } from '../http';

export function guestRoutes(repos: Repositories) {
  return new Hono()
    .get('/guests', async (c) => c.json(await repos.guests.listGuests()))
    .get('/guests/:id', async (c) => {
      const guest = await repos.guests.getGuest(c.req.param('id'));
      return guest ? c.json(guest) : notFound(c, 'Guest');
    });
}
