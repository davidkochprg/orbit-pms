import { ReportSummaryError, type ReportSummaryWriter } from '@orbit/ai';
import { addDays, type ReportService } from '@orbit/domain';
import { type Currency, reportQuerySchema } from '@orbit/shared';
import { Hono } from 'hono';
import type { AiGate } from '../ai-gate';
import { errorBody } from '../http';
import { validate } from '../validate';

export interface ReportRouteDeps {
  reports: ReportService;
  /** Null when AI is not configured. */
  summary: ReportSummaryWriter | null;
  currency: () => Promise<Currency>;
  today: () => string;
  gate: AiGate;
}

/**
 * `GET /api/reports?from=&to=`: occupancy, rates and revenue for a period of nights.
 * `POST /api/reports/summary`: a few sentences on it against the same number of nights before.
 */
export function reportRoutes({ reports, summary, currency, today, gate }: ReportRouteDeps) {
  return new Hono()
    .get('/reports', validate('query', reportQuerySchema), async (c) =>
      c.json(await reports.getReport(c.req.valid('query'))),
    )
    .post('/reports/summary', validate('json', reportQuerySchema), async (c) => {
      if (!summary) {
        return c.json(errorBody('ai_not_configured', 'The AI agent is not configured.'), 503);
      }
      const period = c.req.valid('json');
      const report = await reports.getReport(period);
      const blocked = await gate(c.req.header('x-forwarded-for'));
      if (blocked) return c.json(errorBody('demo_limit', blocked), 429);
      const previous = await reports.getReport({
        from: addDays(period.from, -report.nights),
        to: period.from,
      });
      try {
        return c.json({ text: await summary.write(report, previous, await currency(), today()) });
      } catch (err) {
        if (err instanceof ReportSummaryError) {
          return c.json(errorBody('summary_failed', err.message), 422);
        }
        throw err;
      }
    });
}
