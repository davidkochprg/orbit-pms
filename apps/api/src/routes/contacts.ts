import type { RepairDesk } from '@orbit/ai';
import type { ContactService, SettingsService } from '@orbit/domain';
import {
  contactBodySchema,
  repairContactBodySchema,
  STAFF_HEADER,
  type StaffMember,
  type WorkOrder,
} from '@orbit/shared';
import { Hono } from 'hono';
import type { AiGate } from '../ai-gate';
import { errorBody } from '../http';
import { validate } from '../validate';

export interface ContactRouteDeps {
  contacts: ContactService;
  settings: Pick<SettingsService, 'getProfile'>;
  /** Null when AI is not configured. */
  desk: RepairDesk | null;
  today: () => string;
  gate: AiGate;
  identify: (id: string | undefined) => Promise<StaffMember | null>;
}

/** Suppliers and contractors, and asking one of them to fix a repair. */
export function contactRoutes({
  contacts,
  settings,
  desk,
  today,
  gate,
  identify,
}: ContactRouteDeps) {
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
        if (!desk) {
          return c.json(errorBody('ai_not_configured', 'The AI agent is not configured.'), 503);
        }
        const [repair, contact, profile, staff] = await Promise.all([
          contacts.repair(c.req.param('id')),
          contacts.get(c.req.valid('json').contactId),
          settings.getProfile(),
          identify(c.req.header(STAFF_HEADER)),
        ]);
        const blocked = await gate(c.req.header('x-forwarded-for'));
        if (blocked) return c.json(errorBody('demo_limit', blocked), 429);
        const draft = await desk.workOrder({
          hotel: profile,
          signer: staff?.name ?? null,
          contact,
          roomName: repair.roomName,
          issue: repair.task.notes ?? 'Repair',
          access: repair.access,
          today: today(),
        });
        return c.json<WorkOrder>({ to: contact.email, ...draft });
      },
    );
}
