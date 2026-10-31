import type { GuestMemoryReader } from '@orbit/ai';
import type { GuestMemoryService, GuestService, Repositories } from '@orbit/domain';
import { guestPatchSchema, newGuestBodySchema } from '@orbit/shared';
import { Hono } from 'hono';
import type { AiGate } from '../ai-gate';
import { errorBody, notFound } from '../http';
import { validate } from '../validate';

export interface GuestRouteDeps {
  repos: Repositories;
  guests: GuestService;
  memories: GuestMemoryService;
  /** Null when AI is not configured. */
  reader: GuestMemoryReader | null;
  gate: AiGate;
}

/**
 * Guest profiles, and what Orbit remembers about each guest from earlier stays: read by the
 * model on request when the history changed, free when it didn't.
 */
export function guestRoutes({ repos, guests, memories, reader, gate }: GuestRouteDeps) {
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
    )
    .get('/guests/:id/memory', async (c) => c.json(await memories.get(c.req.param('id'))))
    .post('/guests/:id/memory/read', async (c) => {
      const id = c.req.param('id');
      const source = await memories.sourceToRead(id);
      // Nothing changed since the last reading: it costs nothing.
      if (source === null) return c.json(await memories.get(id));
      if (!reader) {
        return c.json(errorBody('ai_not_configured', 'The AI agent is not configured.'), 503);
      }
      const blocked = await gate(c.req.header('x-forwarded-for'));
      if (blocked) return c.json(errorBody('demo_limit', blocked), 429);
      return c.json(await memories.save(id, source, await reader.read(source)));
    });
}
