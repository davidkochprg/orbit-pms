import type { ActivityService } from '@orbit/domain';
import { activityQuerySchema } from '@orbit/shared';
import { Hono } from 'hono';
import { validate } from '../validate';

/** `GET /api/activity?actor=&limit=`: the hotel-wide audit log with names, newest first. */
export function activityRoutes(activity: ActivityService) {
  return new Hono().get('/activity', validate('query', activityQuerySchema), async (c) =>
    c.json(await activity.list(c.req.valid('query'))),
  );
}
