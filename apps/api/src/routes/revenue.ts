import type { RatesService, RevenueService, StaffService } from '@orbit/domain';
import {
  adjustRatesBodySchema,
  localEventBodySchema,
  type RevenueOutlook,
  STAFF_HEADER,
} from '@orbit/shared';
import { RevenueBriefError, type RevenueBriefWriter } from '@orbit/ai';
import { type Context, Hono } from 'hono';
import { z } from 'zod';
import type { AiGate } from '../ai-gate';
import { errorBody } from '../http';
import { validate } from '../validate';

export interface RevenueRouteDeps {
  revenue: RevenueService;
  rates: RatesService;
  staff: StaffService;
  /** The outlook with the forecast, as the agent also reads it. */
  outlook: (days: number) => Promise<RevenueOutlook>;
  /** Null when AI is not configured. */
  brief: RevenueBriefWriter | null;
  gate: AiGate;
}

const outlookQuerySchema = z.object({ days: z.coerce.number().int().min(7).max(90).default(60) });

/**
 * The rate outlook, per-night rate changes and local events. Changes need the signed-in staff
 * member (`x-staff-id`) to be an active manager, which the domain checks.
 */
export function revenueRoutes({ revenue, rates, staff, outlook, brief, gate }: RevenueRouteDeps) {
  const signedIn = (c: Context) => staff.identify(c.req.header(STAFF_HEADER));

  return new Hono()
    .get('/revenue/outlook', validate('query', outlookQuerySchema), async (c) =>
      c.json(await outlook(c.req.valid('query').days)),
    )
    .post('/revenue/brief', validate('json', outlookQuerySchema), async (c) => {
      if (!brief) {
        return c.json(errorBody('ai_not_configured', 'The AI agent is not configured.'), 503);
      }
      const blocked = await gate(c.req.header('x-forwarded-for'));
      if (blocked) return c.json(errorBody('demo_limit', blocked), 429);
      try {
        const text = await brief.write(await outlook(c.req.valid('json').days));
        return c.json({ text });
      } catch (err) {
        if (err instanceof RevenueBriefError) {
          return c.json(
            errorBody('brief_failed', 'The summary could not be checked. Try again.'),
            502,
          );
        }
        throw err;
      }
    })
    .post('/rates/adjust', validate('json', adjustRatesBodySchema), async (c) =>
      c.json(await rates.adjustRates(c.req.valid('json').nights, 'user', await signedIn(c))),
    )
    .get('/events', async (c) => c.json(await revenue.listEvents()))
    .post('/events', validate('json', localEventBodySchema), async (c) =>
      c.json(await revenue.createEvent(c.req.valid('json'), await signedIn(c)), 201),
    )
    .delete('/events/:id', async (c) => {
      await revenue.deleteEvent(c.req.param('id'), await signedIn(c));
      return c.body(null, 204);
    });
}
