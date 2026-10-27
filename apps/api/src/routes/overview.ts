import type { HotelService, Repositories } from '@orbit/domain';
import { auditLogQuerySchema, dayQuerySchema } from '@orbit/shared';
import { Hono } from 'hono';
import { validate } from '../validate';

export function overviewRoutes(repos: Repositories, service: HotelService) {
  return new Hono()
    .get('/day', validate('query', dayQuerySchema), async (c) =>
      c.json(await service.getDayOverview(c.req.valid('query').date)),
    )
    .get('/audit-log', validate('query', auditLogQuerySchema), async (c) => {
      const { subjectId, limit } = c.req.valid('query');
      return c.json(await repos.audit.list({ limit, ...(subjectId && { subjectId }) }));
    });
}
