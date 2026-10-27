import type { RatesService, SettingsService, StaffService } from '@orbit/domain';
import {
  hotelProfileSchema,
  newStaffBodySchema,
  pricingConfigSchema,
  roomBodySchema,
  roomTypeBodySchema,
  STAFF_HEADER,
  updateStaffBodySchema,
} from '@orbit/shared';
import { type Context, Hono } from 'hono';
import { validate } from '../validate';

export interface SettingsRouteDeps {
  settings: SettingsService;
  staff: StaffService;
  rates: RatesService;
}

/**
 * The hotel profile, rates, rooms and the team. Anyone may read them; changes need the signed-in staff member
 * (`x-staff-id`) to be an active manager, which the domain checks.
 */
export function settingsRoutes({ settings, staff, rates }: SettingsRouteDeps) {
  const signedIn = (c: Context) => staff.identify(c.req.header(STAFF_HEADER));

  return new Hono()
    .get('/settings/profile', async (c) => c.json(await settings.getProfile()))
    .put('/settings/profile', validate('json', hotelProfileSchema), async (c) =>
      c.json(await settings.updateProfile(c.req.valid('json'), await signedIn(c))),
    )
    .get('/settings/pricing', async (c) => c.json(await rates.getPricing()))
    .put('/settings/pricing', validate('json', pricingConfigSchema), async (c) =>
      c.json(await rates.updatePricing(c.req.valid('json'), await signedIn(c))),
    )
    .post('/room-types', validate('json', roomTypeBodySchema), async (c) =>
      c.json(await rates.createRoomType(c.req.valid('json'), await signedIn(c)), 201),
    )
    .put('/room-types/:id', validate('json', roomTypeBodySchema), async (c) =>
      c.json(await rates.updateRoomType(c.req.param('id'), c.req.valid('json'), await signedIn(c))),
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
    );
}
