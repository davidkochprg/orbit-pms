import {
  applySeed,
  buildSeed,
  createDb,
  createRepositories,
  createUsageStore,
  schema,
} from '@orbit/db';
import type { ApiError, ArrivalNote, ArrivalNotes, Inquiry } from '@orbit/shared';
import { MockLanguageModelV4 } from 'ai/test';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app';

const DB_SETUP_TIMEOUT = 60_000;
const today = '2026-10-27';
const now = new Date('2026-10-27T08:00:00Z');
const handle = createDb('memory://');
const seed = buildSeed(today, now, 'us');
const repos = createRepositories(handle.db);
const usage = createUsageStore(handle.db);

const model = new MockLanguageModelV4({
  doGenerate: () =>
    Promise.resolve({
      content: [
        { type: 'text', text: 'Subject: See you tomorrow\n\nDear guest,\nsee you at 3 PM.' },
      ],
      finishReason: { unified: 'stop', raw: undefined },
      usage: {
        inputTokens: { total: 900, noCache: 900, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 60, text: 60, reasoning: undefined },
      },
      warnings: [],
    }),
});

function appWith({ ai = true } = {}) {
  return createApp({
    repos,
    ai: ai
      ? {
          agent: model,
          agentModelId: 'muse-spark-1.3',
          translate: model,
          translateModelId: 'muse-spark-1.3',
          draft: model,
          draftModelId: 'muse-spark-1.3',
          vision: null,
          visionModelId: null,
          transcription: null,
        }
      : null,
    usage,
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
    headers: { 'content-type': 'application/json', 'x-staff-id': 'stf_jordan' },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
  return { status: res.status, body: (await res.json()) as T };
}

beforeAll(() => handle.migrate(), DB_SETUP_TIMEOUT);
beforeEach(async () => {
  await applySeed(handle.db, seed);
  await handle.db.delete(schema.aiUsage);
}, DB_SETUP_TIMEOUT);
afterAll(() => handle.close());

describe('arrival notes', () => {
  it("lists tomorrow's guests, drafts a note for one and sends it", async () => {
    const app = appWith();
    const list = await call<ArrivalNotes>(app, 'GET', '/api/arrival-notes');
    expect(list.status).toBe(200);
    expect(list.body.date).toBe('2026-10-28');
    const [first] = list.body.due;
    expect(first).toBeDefined();

    const draft = await call<ArrivalNote>(
      app,
      'POST',
      `/api/arrival-notes/${first!.bookingId}/draft`,
    );
    expect(draft).toEqual({
      status: 200,
      body: { subject: 'See you tomorrow', body: 'Dear guest,\nsee you at 3 PM.' },
    });

    const sent = await call<Inquiry>(
      app,
      'POST',
      `/api/arrival-notes/${first!.bookingId}/send`,
      draft.body,
    );
    expect(sent.status).toBe(201);
    expect(sent.body).toMatchObject({ bookingId: first!.bookingId, senderAddress: first!.email });
    const after = await call<ArrivalNotes>(app, 'GET', '/api/arrival-notes');
    expect(after.body.due.map((d) => d.bookingId)).not.toContain(first!.bookingId);
  });

  it('needs AI to draft, and a subject and body to send', async () => {
    const list = await call<ArrivalNotes>(appWith(), 'GET', '/api/arrival-notes');
    const id = list.body.due[0]!.bookingId;
    expect(
      (await call<ApiError>(appWith({ ai: false }), 'POST', `/api/arrival-notes/${id}/draft`))
        .status,
    ).toBe(503);
    expect(
      (
        await call<ApiError>(appWith(), 'POST', `/api/arrival-notes/${id}/send`, {
          subject: '',
          body: 'x',
        })
      ).status,
    ).toBe(400);
  });
});
