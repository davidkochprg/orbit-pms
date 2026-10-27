import { pricingConfig } from '@orbit/domain';
import {
  applySeed,
  buildSeed,
  createDb,
  createRepositories,
  createUsageStore,
  schema,
} from '@orbit/db';
import type {
  ApiError,
  Health,
  HousekeepingBoard,
  HousekeepingNoteResult,
  HousekeepingTask,
  Room,
} from '@orbit/shared';
import { MockLanguageModelV4 } from 'ai/test';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from './app';

// PGlite migrates and seeds in setup hooks; with every test file running in parallel that can
// take longer than Vitest's 10 s default.
const DB_SETUP_TIMEOUT = 60_000;

const today = '2026-10-27';
const now = new Date('2026-10-27T08:00:00Z');
const handle = createDb('memory://');
const seed = buildSeed(today, now, pricingConfig);
const repos = createRepositories(handle.db);
const usageStore = createUsageStore(handle.db);

/** Reads every note as "102 is clean, the lamp is broken". 102 has a departure today, so it is dirty. */
const model = new MockLanguageModelV4({
  doGenerate: () =>
    Promise.resolve({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            updates: [{ room: '102', status: 'clean', issue: 'Bedside lamp is broken.' }],
            unclear: null,
          }),
        },
      ],
      finishReason: { unified: 'stop', raw: undefined },
      usage: {
        inputTokens: { total: 300, noCache: 300, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 40, text: 40, reasoning: undefined },
      },
      warnings: [],
    }),
});

function appWith({ ai = true, voice = true } = {}) {
  return createApp({
    repos,
    ai: ai
      ? {
          agent: model,
          agentModelId: 'muse-spark-1.3',
          vision: null,
          transcription: voice
            ? {
                apiKey: 'k',
                baseURL: 'https://meta.invalid/v1',
                model: 'muse-voice-transcribe-1.0',
              }
            : null,
        }
      : null,
    usage: usageStore,
    clock: () => now,
  });
}

async function call<T>(
  app: ReturnType<typeof createApp>,
  method: string,
  path: string,
  body?: unknown,
) {
  const res = await app.request(path, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
  return { status: res.status, body: (await res.json()) as T };
}

/** A minimal valid WAV: RIFF header plus a little silence. */
function wav(): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(64);
  bytes.set(
    [...'RIFF'].map((c) => c.charCodeAt(0)),
    0,
  );
  bytes.set(
    [...'WAVE'].map((c) => c.charCodeAt(0)),
    8,
  );
  return bytes;
}

async function upload(app: ReturnType<typeof createApp>, file: Blob) {
  const form = new FormData();
  form.append('audio', file, 'note.wav');
  const res = await app.request('/api/housekeeping/voice', { method: 'POST', body: form });
  return { status: res.status, body: (await res.json()) as HousekeepingNoteResult & ApiError };
}

beforeAll(() => handle.migrate(), DB_SETUP_TIMEOUT);
beforeEach(async () => {
  await applySeed(handle.db, seed);
  await handle.db.delete(schema.aiUsage);
}, DB_SETUP_TIMEOUT);
afterEach(() => vi.unstubAllGlobals());
afterAll(() => handle.close());

describe('housekeeping board', () => {
  it('lists every room with today’s situation, departures needing cleaning first among them', async () => {
    const { body } = await call<HousekeepingBoard>(
      appWith({ ai: false }),
      'GET',
      '/api/housekeeping',
    );
    expect(body.date).toBe(today);
    expect(body.rooms).toHaveLength(12);
    const departed = body.rooms.find((r) => r.occupancy === 'departing');
    expect(departed?.room.status).toBe('dirty');
    expect(departed?.openTasks.map((t) => t.type)).toContain('turnover');
  });

  it('sets room status and refuses forbidden changes', async () => {
    const app = appWith({ ai: false });
    const ok = await call<Room>(app, 'POST', '/api/rooms/rm_104/status', {
      status: 'out_of_order',
    });
    expect(ok.body.status).toBe('out_of_order');
    const refused = await call<ApiError>(app, 'POST', '/api/rooms/rm_104/status', {
      status: 'clean',
    });
    expect(refused.status).toBe(409);
    const invalid = await call<ApiError>(app, 'POST', '/api/rooms/rm_104/status', {
      status: 'shiny',
    });
    expect(invalid.status).toBe(400);
  });

  it('creates and completes a maintenance task', async () => {
    const app = appWith({ ai: false });
    const created = await call<HousekeepingTask>(app, 'POST', '/api/housekeeping/tasks', {
      roomId: 'rm_101',
      type: 'maintenance',
      notes: 'Window does not close',
    });
    expect(created.status).toBe(201);
    const done = await call<HousekeepingTask>(
      app,
      'POST',
      `/api/housekeeping/tasks/${created.body.id}/status`,
      { status: 'done' },
    );
    expect(done.body.status).toBe('done');
  });
});

describe('housekeeping notes', () => {
  it('reports voice support in the health check', async () => {
    const health = await call<Health>(appWith(), 'GET', '/health');
    expect(health.body.ai).toEqual({ configured: true, voice: true });
    const noVoice = await call<Health>(appWith({ voice: false }), 'GET', '/health');
    expect(noVoice.body.ai.voice).toBe(false);
  });

  it('applies a typed note as the agent', async () => {
    expect((await repos.rooms.getRoom('rm_102'))?.status).toBe('dirty');
    const { status, body } = await call<HousekeepingNoteResult>(
      appWith(),
      'POST',
      '/api/housekeeping/notes',
      { text: '102 done, lamp broken' },
    );
    expect(status).toBe(200);
    expect(body.changes.map((c) => c.kind)).toEqual(['room_status', 'task_created']);
    expect((await repos.rooms.getRoom('rm_102'))?.status).toBe('clean');
    const log = await repos.audit.list({ subjectId: 'rm_102' });
    expect(log.every((e) => e.actor === 'agent')).toBe(true);
  });

  it('transcribes an uploaded recording, then applies it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Response.json({ transcript: '102 done, lamp broken', audioDurationMs: 3000, turns: [] }),
      ),
    );
    const { status, body } = await upload(appWith(), new Blob([wav()], { type: 'audio/wav' }));
    expect(status).toBe(200);
    expect(body.transcript).toBe('102 done, lamp broken');
    expect(body.changes).toHaveLength(2);
  });

  it('rejects files that are not WAV, and voice when it is not configured', async () => {
    const notWav = await upload(appWith(), new Blob(['hello'], { type: 'audio/webm' }));
    expect(notWav.status).toBe(400);
    const noVoice = await upload(appWith({ voice: false }), new Blob([wav()]));
    expect(noVoice.status).toBe(503);
    const noAi = await call<ApiError>(appWith({ ai: false }), 'POST', '/api/housekeeping/notes', {
      text: 'x',
    });
    expect(noAi.status).toBe(503);
  });

  it('turns a transcription failure into a clear 502', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Response.json({ error: { message: 'Unsupported WAV' } }, { status: 400 })),
    );
    const { status, body } = await upload(appWith(), new Blob([wav()]));
    expect(status).toBe(502);
    expect(body.error.message).toBe('Transcription failed: Unsupported WAV');
  });
});
