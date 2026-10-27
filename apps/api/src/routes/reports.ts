import type { ReportService } from '@orbit/domain';
import { reportQuerySchema } from '@orbit/shared';
import { Hono } from 'hono';
import { validate } from '../validate';

/** `GET /api/reports?from=&to=`: occupancy, rates and revenue for a period of nights. */
export function reportRoutes(reports: ReportService) {
  return new Hono().get('/reports', validate('query', reportQuerySchema), async (c) =>
    c.json(await reports.getReport(c.req.valid('query'))),
  );
}
