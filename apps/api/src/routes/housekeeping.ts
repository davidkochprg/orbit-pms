import {
  type HousekeepingNotePipeline,
  type RepairDesk,
  type StayNotesReader,
  TranscriptionError,
} from '@orbit/ai';
import type { HousekeepingService } from '@orbit/domain';
import {
  housekeepingNoteBodySchema,
  newTaskBodySchema,
  roomStatusBodySchema,
  taskStatusBodySchema,
} from '@orbit/shared';
import { Hono } from 'hono';
import type { AiGate } from '../ai-gate';
import { readRecording } from '../audio';
import { errorBody } from '../http';
import { validate } from '../validate';

export interface HousekeepingRouteDeps {
  housekeeping: HousekeepingService;
  /** Null when AI is not configured. */
  notes: HousekeepingNotePipeline | null;
  /** Null when AI is not configured. */
  stays: StayNotesReader | null;
  /** Works out who fixes a repair added by hand; null when AI is not configured. */
  desk: RepairDesk | null;
  gate: AiGate;
}

/**
 * Room status, housekeeping tasks, notes the agent applies (ADR 0006), and reading stays' notes
 * for the board's cleaning effort.
 */
export function housekeepingRoutes({
  housekeeping,
  notes,
  stays,
  desk,
  gate,
}: HousekeepingRouteDeps) {
  /** Who fixes a repair, when the model can say; the task is added either way. */
  async function tradeFor(issue: string | null, ip: string | undefined) {
    if (!desk || !issue || (await gate(ip))) return null;
    return desk.trade(issue).catch((err: unknown) => {
      console.warn('Could not work out the trade of a repair:', err);
      return null;
    });
  }

  return new Hono()
    .get('/housekeeping', async (c) => c.json(await housekeeping.board()))
    .post('/housekeeping/read-stays', async (c) => {
      if (!stays) {
        return c.json(errorBody('ai_not_configured', 'The AI agent is not configured.'), 503);
      }
      const board = await housekeeping.board();
      // Nothing new to read costs nothing and uses none of the demo's allowance.
      if (board.unreadStays === 0) return c.json(board);
      const blocked = await gate(c.req.header('x-forwarded-for'));
      if (blocked) return c.json(errorBody('demo_limit', blocked), 429);
      await stays.read();
      return c.json(await housekeeping.board());
    })
    .post('/rooms/:id/status', validate('json', roomStatusBodySchema), async (c) =>
      c.json(
        await housekeeping.setRoomStatus(c.req.param('id'), c.req.valid('json').status, 'user'),
      ),
    )
    .post('/housekeeping/tasks', validate('json', newTaskBodySchema), async (c) => {
      const body = c.req.valid('json');
      const trade =
        body.type === 'maintenance' && body.trade === undefined
          ? await tradeFor(body.notes, c.req.header('x-forwarded-for'))
          : body.trade;
      return c.json(await housekeeping.createTask({ ...body, trade }, 'user'), 201);
    })
    .post('/housekeeping/tasks/:id/status', validate('json', taskStatusBodySchema), async (c) =>
      c.json(
        await housekeeping.setTaskStatus(c.req.param('id'), c.req.valid('json').status, 'user'),
      ),
    )
    .post('/housekeeping/notes', validate('json', housekeepingNoteBodySchema), async (c) => {
      if (!notes) {
        return c.json(errorBody('ai_not_configured', 'The AI agent is not configured.'), 503);
      }
      const blocked = await gate(c.req.header('x-forwarded-for'));
      if (blocked) return c.json(errorBody('demo_limit', blocked), 429);
      return c.json(await notes.fromText(c.req.valid('json').text));
    })
    .post('/housekeeping/voice', async (c) => {
      if (!notes?.canTranscribe) {
        return c.json(errorBody('ai_not_configured', 'Voice notes are not configured.'), 503);
      }
      const recording = await readRecording(c);
      if ('error' in recording) return recording.error;
      const blocked = await gate(c.req.header('x-forwarded-for'));
      if (blocked) return c.json(errorBody('demo_limit', blocked), 429);
      try {
        return c.json(await notes.fromAudio(recording.wav));
      } catch (err) {
        if (err instanceof TranscriptionError) {
          return c.json(
            errorBody('transcription_failed', `Transcription failed: ${err.message}`),
            502,
          );
        }
        throw err;
      }
    });
}
