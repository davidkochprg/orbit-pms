import { ArrivalNoteError, type ArrivalNoteWriter } from '@orbit/ai';
import {
  type ArrivalNoteService,
  guestBookRulesFor,
  type HotelService,
  type InboxService,
} from '@orbit/domain';
import {
  arrivalNoteSchema,
  isoDateSchema,
  type StaffMember,
  STAFF_HEADER,
  type WeatherDay,
} from '@orbit/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AiGate } from '../ai-gate';
import { errorBody } from '../http';
import { validate } from '../validate';

export interface ArrivalNoteRouteDeps {
  arrivalNotes: ArrivalNoteService;
  hotel: HotelService;
  inbox: InboxService;
  /** Null when AI is not configured. */
  writer: ArrivalNoteWriter | null;
  /** The daily forecast at the hotel, when there is one. */
  forecast: () => Promise<WeatherDay[] | null>;
  /** The hotel's country, for who shows an ID at check-in. */
  country: () => Promise<string>;
  today: () => string;
  gate: AiGate;
  identify: (id: string | undefined) => Promise<StaffMember | null>;
}

/**
 * Notes before a stay: which of tomorrow's guests haven't heard from the hotel, a draft for one
 * written by the model on request, and sending it as a conversation linked to the booking.
 */
export function arrivalNoteRoutes({
  arrivalNotes,
  hotel,
  inbox,
  writer,
  forecast,
  country,
  today,
  gate,
  identify,
}: ArrivalNoteRouteDeps) {
  return new Hono()
    .get(
      '/arrival-notes',
      validate('query', z.object({ date: isoDateSchema.optional() })),
      async (c) => c.json(await arrivalNotes.due(c.req.valid('query').date)),
    )
    .post('/arrival-notes/:bookingId/draft', async (c) => {
      if (!writer) {
        return c.json(errorBody('ai_not_configured', 'The AI agent is not configured.'), 503);
      }
      const { booking, guest, roomType } = await hotel.getBookingDetail(c.req.param('bookingId'));
      const blocked = await gate(c.req.header('x-forwarded-for'));
      if (blocked) return c.json(errorBody('demo_limit', blocked), 429);
      const [days, where, signer] = await Promise.all([
        forecast().catch(() => null),
        country(),
        identify(c.req.header(STAFF_HEADER)),
      ]);
      try {
        return c.json(
          await writer.write({
            guest: { name: guest.name, language: guest.language },
            stay: {
              checkIn: booking.checkIn,
              checkOut: booking.checkOut,
              adults: booking.adults,
              childAges: booking.childAges,
              roomTypeName: roomType.name,
              addons: booking.addons,
            },
            weather: days?.find((d) => d.date === booking.checkIn) ?? null,
            idsFrom: guestBookRulesFor(where).scope,
            signer: signer?.name ?? null,
            today: today(),
          }),
        );
      } catch (err) {
        if (err instanceof ArrivalNoteError) {
          return c.json(errorBody('draft_failed', err.message), 422);
        }
        throw err;
      }
    })
    .post('/arrival-notes/:bookingId/send', validate('json', arrivalNoteSchema), async (c) => {
      const author = (await identify(c.req.header(STAFF_HEADER)))?.name ?? null;
      return c.json(
        await inbox.sendArrivalNote(c.req.param('bookingId'), c.req.valid('json'), author, 'user'),
        201,
      );
    });
}
