import { type HousekeepingNotePipeline, TranscriptionError } from '@orbit/ai';
import type { HousekeepingService } from '@orbit/domain';
import {
  housekeepingNoteBodySchema,
  newTaskBodySchema,
  roomStatusBodySchema,
  taskStatusBodySchema,
} from '@orbit/shared';
import { Hono } from 'hono';
import type { AiGate } from '../ai-gate';
import { errorBody } from '../http';
import { validate } from '../validate';

/** About 2.5 minutes of 16 kHz mono 16-bit WAV. */
export const MAX_VOICE_NOTE_BYTES = 5 * 1024 * 1024;

export interface HousekeepingRouteDeps {
  housekeeping: HousekeepingService;
  /** Null when AI is not configured. */
  notes: HousekeepingNotePipeline | null;
  gate: AiGate;
}

function isWav(bytes: Uint8Array): boolean {
  const tag = (from: number) => String.fromCharCode(...bytes.subarray(from, from + 4));
  return bytes.length > 44 && tag(0) === 'RIFF' && tag(8) === 'WAVE';
}

/** Room status, housekeeping tasks, and notes the agent applies (ADR 0006). */
export function housekeepingRoutes({ housekeeping, notes, gate }: HousekeepingRouteDeps) {
  return new Hono()
    .get('/housekeeping', async (c) => c.json(await housekeeping.board()))
    .post('/rooms/:id/status', validate('json', roomStatusBodySchema), async (c) =>
      c.json(
        await housekeeping.setRoomStatus(c.req.param('id'), c.req.valid('json').status, 'user'),
      ),
    )
    .post('/housekeeping/tasks', validate('json', newTaskBodySchema), async (c) =>
      c.json(await housekeeping.createTask(c.req.valid('json'), 'user'), 201),
    )
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
      if (Number(c.req.header('content-length') ?? 0) > MAX_VOICE_NOTE_BYTES) {
        return c.json(errorBody('too_large', 'The recording is too long.'), 413);
      }
      const form = await c.req.formData().catch(() => null);
      const audio = form?.get('audio');
      if (!(audio instanceof File)) {
        return c.json(errorBody('invalid_input', 'Send the recording as an "audio" file.'), 400);
      }
      const bytes = new Uint8Array(await audio.arrayBuffer());
      if (bytes.length > MAX_VOICE_NOTE_BYTES) {
        return c.json(errorBody('too_large', 'The recording is too long.'), 413);
      }
      if (!isWav(bytes)) {
        return c.json(errorBody('invalid_input', 'The recording must be a WAV file.'), 400);
      }
      const blocked = await gate(c.req.header('x-forwarded-for'));
      if (blocked) return c.json(errorBody('demo_limit', blocked), 429);
      try {
        return c.json(await notes.fromAudio(bytes));
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
