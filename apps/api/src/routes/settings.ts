import type { SettingsService, StaffService } from '@orbit/domain';
import {
  hotelProfileSchema,
  newStaffBodySchema,
  STAFF_HEADER,
  updateStaffBodySchema,
} from '@orbit/shared';
import { type Context, Hono } from 'hono';
import { validate } from '../validate';

export interface SettingsRouteDeps {
  settings: SettingsService;
  staff: StaffService;
}

/**
 * The hotel profile and the team. Anyone may read them; changes need the signed-in staff member
 * (`x-staff-id`) to be an active manager, which the domain checks.
 */
export function settingsRoutes({ settings, staff }: SettingsRouteDeps) {
  const signedIn = (c: Context) => staff.identify(c.req.header(STAFF_HEADER));

  return new Hono()
    .get('/settings/profile', async (c) => c.json(await settings.getProfile()))
    .put('/settings/profile', validate('json', hotelProfileSchema), async (c) =>
      c.json(await settings.updateProfile(c.req.valid('json'), await signedIn(c))),
    )
    .get('/staff', async (c) => c.json(await staff.list()))
    .post('/staff', validate('json', newStaffBodySchema), async (c) =>
      c.json(await staff.create(c.req.valid('json'), await signedIn(c)), 201),
    )
    .patch('/staff/:id', validate('json', updateStaffBodySchema), async (c) =>
      c.json(await staff.update(c.req.param('id'), c.req.valid('json'), await signedIn(c))),
    );
}
