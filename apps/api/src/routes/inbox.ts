import type { InboxPipeline } from '@orbit/ai';
import type { HotelService, InboxService } from '@orbit/domain';
import {
  inboxHoldBodySchema,
  markRepliedBodySchema,
  newMessageBodySchema,
  processMessageBodySchema,
} from '@orbit/shared';
import { Hono } from 'hono';
import { errorBody } from '../http';
import type { AiGate } from '../ai-gate';
import { validate } from '../validate';

export interface InboxRouteDeps {
  inbox: InboxService;
  hotel: HotelService;
  /** Null when AI is not configured. */
  pipeline: InboxPipeline | null;
  gate: AiGate;
}

/** The unified inbox: direct and OTA messages, the agent's prepared answer, and staff actions. */
export function inboxRoutes({ inbox, hotel, pipeline, gate }: InboxRouteDeps) {
  return new Hono()
    .get('/inbox', async (c) => c.json(await inbox.list()))
    .post('/inbox', validate('json', newMessageBodySchema), async (c) =>
      c.json(await inbox.create(c.req.valid('json')), 201),
    )
    .get('/inbox/:id', async (c) => c.json(await inbox.get(c.req.param('id'))))
    .post('/inbox/:id/process', validate('json', processMessageBodySchema), async (c) => {
      if (!pipeline) {
        return c.json(
          errorBody('ai_not_configured', 'The AI agent is not configured on this server.'),
          503,
        );
      }
      const id = c.req.param('id');
      const { force } = c.req.valid('json');
      const current = await inbox.get(id);
      // Already processed messages are served from storage and cost nothing.
      if (current.processedAt && !current.processingError && !force) return c.json(current);
      const blocked = await gate(c.req.header('x-forwarded-for'));
      if (blocked) return c.json(errorBody('demo_limit', blocked), 429);
      return c.json(await pipeline.process(id, { force }));
    })
    .post('/inbox/:id/hold', validate('json', inboxHoldBodySchema), async (c) => {
      const booking = await inbox.createHold(c.req.param('id'), c.req.valid('json').roomId, 'user');
      return c.json(await hotel.getBookingDetail(booking.id), 201);
    })
    .post('/inbox/:id/decline', async (c) => c.json(await inbox.decline(c.req.param('id'), 'user')))
    .post('/inbox/:id/replied', validate('json', markRepliedBodySchema), async (c) =>
      c.json(await inbox.markReplied(c.req.param('id'), c.req.valid('json').reply, 'user')),
    );
}
