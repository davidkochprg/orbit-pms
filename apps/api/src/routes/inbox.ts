import {
  hasReading,
  type InboxPipeline,
  type ReplyLearner,
  TranslationError,
  type Translator,
} from '@orbit/ai';
import type { HotelService, InboxService, PendingActionService } from '@orbit/domain';
import {
  archiveBodySchema,
  composeBodySchema,
  inboxHoldBodySchema,
  messageBodySchema,
  newMessageBodySchema,
  processMessageBodySchema,
  type HotelInfoEntry,
  type StaffMember,
  STAFF_HEADER,
  translateBodySchema,
  translateMessageBodySchema,
  type TranslateResult,
  unreadBodySchema,
} from '@orbit/shared';
import { type Context, Hono } from 'hono';
import { errorBody } from '../http';
import type { AiGate } from '../ai-gate';
import { validate } from '../validate';

export interface InboxRouteDeps {
  inbox: InboxService;
  hotel: HotelService;
  /** Null when AI is not configured. */
  pipeline: InboxPipeline | null;
  translator: Translator | null;
  /** Null when AI is not configured. */
  learner: ReplyLearner | null;
  actions: Pick<PendingActionService, 'propose'>;
  /** The hotel information guests are told about today. */
  hotelEntries: () => Promise<HotelInfoEntry[]>;
  today: () => string;
  gate: AiGate;
  /** The signed-in staff member, who signs what they send. */
  identify: (id: string | undefined) => Promise<StaffMember | null>;
}

const notConfigured = errorBody(
  'ai_not_configured',
  'The AI agent is not configured on this server.',
);

/**
 * The inbox: conversations with guests by email and through OTAs, and what staff do with them.
 * Nothing calls the model until staff ask for the request to be read, a reply or a translation.
 */
export function inboxRoutes({
  inbox,
  hotel,
  pipeline,
  translator,
  learner,
  actions,
  hotelEntries,
  today,
  gate,
  identify,
}: InboxRouteDeps) {
  const author = async (c: Context) => (await identify(c.req.header(STAFF_HEADER)))?.name ?? null;
  const blocked = (c: Context) => gate(c.req.header('x-forwarded-for'));
  const translationFailed = (c: Context, err: unknown) => {
    if (err instanceof TranslationError)
      return c.json(errorBody('translation_failed', err.message), 422);
    throw err;
  };

  return (
    new Hono()
      .get('/inbox', async (c) => c.json(await inbox.list()))
      .post('/inbox', validate('json', newMessageBodySchema), async (c) =>
        c.json(await inbox.create(c.req.valid('json')), 201),
      )
      .post('/inbox/compose', validate('json', composeBodySchema), async (c) =>
        c.json(await inbox.compose(c.req.valid('json'), await author(c), 'user'), 201),
      )
      .post('/inbox/translate', validate('json', translateBodySchema), async (c) => {
        if (!translator) return c.json(notConfigured, 503);
        const limit = await blocked(c);
        if (limit) return c.json(errorBody('demo_limit', limit), 429);
        const { text, to } = c.req.valid('json');
        try {
          return c.json<TranslateResult>({ text: await translator.translate(text, to) });
        } catch (err) {
          return translationFailed(c, err);
        }
      })
      .get('/inbox/:id', async (c) => c.json(await inbox.get(c.req.param('id'))))
      .post('/inbox/:id/send', validate('json', messageBodySchema), async (c) =>
        c.json(
          await inbox.send(c.req.param('id'), c.req.valid('json').body, await author(c), 'user'),
        ),
      )
      // Rooms again for a request that had none when it was read, e.g. after a cancellation.
      .post('/inbox/:id/rooms', async (c) => c.json(await inbox.refreshOptions(c.req.param('id'))))
      // The reply staff just sent, read for a fact the hotel information lacks. Returns the
      // proposal to save it, or null.
      .post('/inbox/:id/learn', async (c) => {
        if (!learner) return c.json(notConfigured, 503);
        const current = await inbox.get(c.req.param('id'));
        const reply = current.messages.findLast((m) => m.direction === 'out');
        const guestMessage = current.messages.findLast((m) => m.direction === 'in');
        if (!reply || !guestMessage) return c.json(null);
        const limit = await blocked(c);
        if (limit) return c.json(errorBody('demo_limit', limit), 429);
        const draft = await learner.learn({
          guestMessage: guestMessage.body,
          reply: reply.body,
          entries: await hotelEntries(),
          today: today(),
        });
        return c.json(draft && (await actions.propose({ kind: 'save_hotel_info', input: draft })));
      })
      .post('/inbox/:id/receive', validate('json', messageBodySchema), async (c) =>
        c.json(await inbox.receive(c.req.param('id'), c.req.valid('json').body)),
      )
      .post('/inbox/:id/unread', validate('json', unreadBodySchema), async (c) =>
        c.json(await inbox.setUnread(c.req.param('id'), c.req.valid('json').unread)),
      )
      .post('/inbox/:id/archive', validate('json', archiveBodySchema), async (c) =>
        c.json(await inbox.setArchived(c.req.param('id'), c.req.valid('json').archived)),
      )
      .post('/inbox/:id/process', validate('json', processMessageBodySchema), async (c) => {
        if (!pipeline) return c.json(notConfigured, 503);
        const id = c.req.param('id');
        const { force, language } = c.req.valid('json');
        const current = await inbox.get(id);
        // Already prepared conversations are served from storage and cost nothing.
        if (current.processedAt && !current.processingError && !force) return c.json(current);
        const limit = await blocked(c);
        if (limit) return c.json(errorBody('demo_limit', limit), 429);
        return c.json(await pipeline.process(id, { force, language }));
      })
      .post('/inbox/:id/read', validate('json', processMessageBodySchema), async (c) => {
        if (!pipeline) return c.json(notConfigured, 503);
        const id = c.req.param('id');
        const current = await inbox.get(id);
        // A conversation already read is served from storage and costs nothing.
        if (hasReading(current) && !c.req.valid('json').force) {
          return c.json(current);
        }
        const limit = await blocked(c);
        if (limit) return c.json(errorBody('demo_limit', limit), 429);
        return c.json(await pipeline.read(id, { force: true }));
      })
      .post('/inbox/:id/draft', validate('json', processMessageBodySchema), async (c) => {
        if (!pipeline) return c.json(notConfigured, 503);
        const limit = await blocked(c);
        if (limit) return c.json(errorBody('demo_limit', limit), 429);
        return c.json(
          await pipeline.draft(c.req.param('id'), { language: c.req.valid('json').language }),
        );
      })
      .post(
        '/inbox/:id/messages/:messageId/translate',
        validate('json', translateMessageBodySchema),
        async (c) => {
          if (!translator) return c.json(notConfigured, 503);
          const id = c.req.param('id');
          const messageId = c.req.param('messageId');
          const { to } = c.req.valid('json');
          const current = await inbox.get(id);
          const message = current.messages.find((m) => m.id === messageId);
          if (!message) return c.json(errorBody('not_found', 'Message not found'), 404);
          // A message is translated once per language; reading it again costs nothing.
          if (message.translation?.language === to) return c.json(current);
          const limit = await blocked(c);
          if (limit) return c.json(errorBody('demo_limit', limit), 429);
          try {
            const text = await translator.translate(message.body, to);
            return c.json(await inbox.saveTranslation(id, messageId, { language: to, text }));
          } catch (err) {
            return translationFailed(c, err);
          }
        },
      )
      .post('/inbox/:id/hold', validate('json', inboxHoldBodySchema), async (c) => {
        const booking = await inbox.createHold(
          c.req.param('id'),
          c.req.valid('json').roomId,
          'user',
        );
        return c.json(await hotel.getBookingDetail(booking.id), 201);
      })
      .post('/inbox/:id/decline', async (c) =>
        c.json(await inbox.decline(c.req.param('id'), 'user')),
      )
  );
}
