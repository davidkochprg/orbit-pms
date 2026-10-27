import type { PendingActionService } from '@orbit/domain';
import { Hono } from 'hono';

/** Confirm cards: the user approves or rejects what the agent proposed. */
export function pendingActionRoutes(actions: PendingActionService) {
  return new Hono()
    .get('/pending-actions/:id', async (c) => c.json(await actions.get(c.req.param('id'))))
    .post('/pending-actions/:id/confirm', async (c) => {
      const result = await actions.confirm(c.req.param('id'));
      return c.json(result, result.status === 'failed' ? 409 : 200);
    })
    .post('/pending-actions/:id/reject', async (c) =>
      c.json(await actions.reject(c.req.param('id'))),
    );
}
