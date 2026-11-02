import type { WorkOrderDrafter } from '@orbit/ai';
import type { ContactService, InboxService } from '@orbit/domain';
import {
  contactBodySchema,
  repairContactBodySchema,
  STAFF_HEADER,
  type StaffMember,
  workOrderBodySchema,
} from '@orbit/shared';
import { Hono } from 'hono';
import { errorBody } from '../http';
import { validate } from '../validate';

export interface ContactRouteDeps {
  contacts: ContactService;
  /** Sends the email to a contractor, linked to the repair. */
  inbox: Pick<InboxService, 'sendWorkOrder'>;
  /** Writes the email to a contractor; null when AI is not configured. */
  draftWorkOrder: WorkOrderDrafter | null;
  identify: (id: string | undefined) => Promise<StaffMember | null>;
}

/** Suppliers and contractors, and asking one of them to fix a repair. */
export function contactRoutes({ contacts, inbox, draftWorkOrder, identify }: ContactRouteDeps) {
  return new Hono()
    .get('/contacts', async (c) => c.json(await contacts.list()))
    .post('/contacts', validate('json', contactBodySchema), async (c) =>
      c.json(await contacts.create(c.req.valid('json'), 'user'), 201),
    )
    .put('/contacts/:id', validate('json', contactBodySchema), async (c) =>
      c.json(await contacts.update(c.req.param('id'), c.req.valid('json'), 'user')),
    )
    .delete('/contacts/:id', async (c) => {
      await contacts.remove(c.req.param('id'), 'user');
      return c.body(null, 204);
    })
    .get('/housekeeping/tasks/:id/repair', async (c) =>
      c.json(await contacts.repair(c.req.param('id'))),
    )
    .post('/housekeeping/tasks/:id/contact', validate('json', repairContactBodySchema), async (c) =>
      c.json(await contacts.askToRepair(c.req.param('id'), c.req.valid('json').contactId, 'user')),
    )
    .post(
      '/housekeeping/tasks/:id/work-order',
      validate('json', repairContactBodySchema),
      async (c) => {
        if (!draftWorkOrder) {
          return c.json(errorBody('ai_not_configured', 'The AI agent is not configured.'), 503);
        }
        const staff = await identify(c.req.header(STAFF_HEADER));
        // Unknown repairs and contacts fail before the model is asked.
        return c.json(
          await draftWorkOrder(
            c.req.param('id'),
            c.req.valid('json').contactId,
            staff?.name ?? null,
          ),
        );
      },
    )
    .post('/housekeeping/tasks/:id/email', validate('json', workOrderBodySchema), async (c) => {
      const author = (await identify(c.req.header(STAFF_HEADER)))?.name ?? null;
      return c.json(
        await inbox.sendWorkOrder(c.req.param('id'), c.req.valid('json'), author, 'user'),
        201,
      );
    });
}
