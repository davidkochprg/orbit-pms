import type { NoteFiler } from '@orbit/ai';
import type { RatesService, SettingsService, StaffService } from '@orbit/domain';
import {
  type FiledNote,
  fileNoteBodySchema,
  hotelInfoDraftSchema,
  hotelProfileSchema,
  newStaffBodySchema,
  pricingConfigSchema,
  roomBodySchema,
  roomTypeBodySchema,
  STAFF_HEADER,
  updateStaffBodySchema,
} from '@orbit/shared';
import { type Context, Hono } from 'hono';
import type { AiGate } from '../ai-gate';
import { errorBody } from '../http';
import { validate } from '../validate';

export interface SettingsRouteDeps {
  settings: SettingsService;
  staff: StaffService;
  rates: RatesService;
  /** Null when AI is not configured. */
  filer: NoteFiler | null;
  today: () => string;
  gate: AiGate;
}

/**
 * The hotel profile, rates, rooms and the team. Anyone may read them; changes need the signed-in staff member
 * (`x-staff-id`) to be an active manager, which the domain checks.
 */
export function settingsRoutes({ settings, staff, rates, filer, today, gate }: SettingsRouteDeps) {
  const signedIn = (c: Context) => staff.identify(c.req.header(STAFF_HEADER));

  return (
    new Hono()
      .get('/settings/profile', async (c) => c.json(await settings.getProfile()))
      .put('/settings/profile', validate('json', hotelProfileSchema), async (c) =>
        c.json(await settings.updateProfile(c.req.valid('json'), await signedIn(c))),
      )
      // Knowledge: the entries guests are told about, kept by any staff member.
      .get('/hotel-info', async (c) => c.json((await settings.getProfile()).entries))
      // A note staff described in their own words, titled, filed, tagged and linked by Orbit, to
      // show before they save it. Saves nothing.
      .post('/hotel-info/file', validate('json', fileNoteBodySchema), async (c) => {
        if (!filer) {
          return c.json(
            errorBody('ai_not_configured', 'The AI agent is not configured on this server.'),
            503,
          );
        }
        const limit = await gate(c.req.header('x-forwarded-for'));
        if (limit) return c.json(errorBody('demo_limit', limit), 429);
        const filed = await filer.file({
          text: c.req.valid('json').text,
          notes: (await settings.getProfile()).entries,
          today: today(),
        });
        if (!filed) {
          return c.json(
            errorBody('not_filed', 'Could not make a note of that. Try rewording it.'),
            422,
          );
        }
        return c.json<FiledNote>(filed);
      })
      .post('/hotel-info', validate('json', hotelInfoDraftSchema), async (c) =>
        c.json(await settings.saveEntry(null, c.req.valid('json'), await signedIn(c)), 201),
      )
      .put('/hotel-info/:id', validate('json', hotelInfoDraftSchema), async (c) =>
        c.json(await settings.saveEntry(c.req.param('id'), c.req.valid('json'), await signedIn(c))),
      )
      .delete('/hotel-info/:id', async (c) => {
        await settings.removeEntry(c.req.param('id'), await signedIn(c));
        return c.body(null, 204);
      })
      .get('/settings/pricing', async (c) => c.json(await rates.getPricing()))
      .put('/settings/pricing', validate('json', pricingConfigSchema), async (c) =>
        c.json(await rates.updatePricing(c.req.valid('json'), await signedIn(c))),
      )
      .post('/room-types', validate('json', roomTypeBodySchema), async (c) =>
        c.json(await rates.createRoomType(c.req.valid('json'), await signedIn(c)), 201),
      )
      .put('/room-types/:id', validate('json', roomTypeBodySchema), async (c) =>
        c.json(
          await rates.updateRoomType(c.req.param('id'), c.req.valid('json'), await signedIn(c)),
        ),
      )
      .post('/rooms', validate('json', roomBodySchema), async (c) =>
        c.json(await rates.createRoom(c.req.valid('json'), await signedIn(c)), 201),
      )
      .put('/rooms/:id', validate('json', roomBodySchema), async (c) =>
        c.json(await rates.updateRoom(c.req.param('id'), c.req.valid('json'), await signedIn(c))),
      )
      .get('/staff', async (c) => c.json(await staff.list()))
      .post('/staff', validate('json', newStaffBodySchema), async (c) =>
        c.json(await staff.create(c.req.valid('json'), await signedIn(c)), 201),
      )
      .patch('/staff/:id', validate('json', updateStaffBodySchema), async (c) =>
        c.json(await staff.update(c.req.param('id'), c.req.valid('json'), await signedIn(c))),
      )
  );
}
