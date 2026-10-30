import type { PendingActionService } from '@orbit/domain';
import { type StaffMember, STAFF_HEADER } from '@orbit/shared';
import { Hono } from 'hono';

/**
 * Confirm cards: the user approves or rejects what the agent proposed. The signed-in staff member
 * (`x-staff-id`) confirms: replies are signed with their name, and manager-only changes check them.
 */
export function pendingActionRoutes(
  actions: PendingActionService,
  identify: (id: string | undefined) => Promise<StaffMember | null>,
) {
  return new Hono()
    .get('/pending-actions/:id', async (c) => c.json(await actions.get(c.req.param('id'))))
    .post('/pending-actions/:id/confirm', async (c) => {
      const by = await identify(c.req.header(STAFF_HEADER));
      const result = await actions.confirm(c.req.param('id'), by);
      return c.json(result, result.status === 'failed' ? 409 : 200);
    })
    .post('/pending-actions/:id/reject', async (c) =>
      c.json(await actions.reject(c.req.param('id'))),
    );
}
