import type { KnockOnService } from '@orbit/domain';
import { relocateBodySchema } from '@orbit/shared';
import { Hono } from 'hono';
import { validate } from '../validate';

/** What a change elsewhere made worth doing next, and doing it (ADR 0018). */
export function knockOnRoutes(knockOns: KnockOnService) {
  return new Hono()
    .get('/knock-ons', async (c) => c.json(await knockOns.list()))
    .post('/knock-ons/relocate', validate('json', relocateBodySchema), async (c) =>
      c.json(await knockOns.relocate(c.req.valid('json'), 'user')),
    );
}
