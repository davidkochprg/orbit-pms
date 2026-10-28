import { formatAmount } from '@orbit/ai';
import { buildInquiryFixtures } from '@orbit/ai/evals';
import { pricingConfig } from '@orbit/domain';
import {
  applySeed,
  buildSeed,
  createDb,
  createRepositories,
  createUsageStore,
  schema,
} from '@orbit/db';
import type { ApiError, BookingDetail, Inquiry } from '@orbit/shared';
import { MockLanguageModelV4 } from 'ai/test';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
const fixture = buildInquiryFixtures(today).find((f) => f.id === 'inq_01')!;

/** Replies with the fixture's expected extraction, then a draft quoting whatever total the prompt gave. */
function scriptedModel() {
  let calls = 0;
  const model = new MockLanguageModelV4({
    doGenerate: (options) => {
      calls++;
      const prompt = JSON.stringify(options.prompt);
      const text =
        calls % 2 === 1
          ? JSON.stringify(fixture.expected)
          : `Dobrý den, nabízíme pokoj za ${/total (\d[\d ]* CZK)/.exec(prompt)?.[1] ?? '?'}.`;
      return Promise.resolve({
        content: [{ type: 'text', text }],
        finishReason: { unified: 'stop', raw: undefined },
        usage: {
          inputTokens: { total: 900, noCache: 900, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: 120, text: 120, reasoning: undefined },
        },
        warnings: [],
      });
    },
  });
  return { model, calls: () => calls };
}

function appWith(model: MockLanguageModelV4 | null, monthlyBudgetUsd = 100) {
  return createApp({
    repos,
    ai: model && {
      agent: model,
      agentModelId: 'muse-spark-1.3',
      vision: null,
      visionModelId: null,
      transcription: null,
    },
    usage: usageStore,
    monthlyBudgetUsd,
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

beforeAll(() => handle.migrate(), DB_SETUP_TIMEOUT);
beforeEach(async () => {
  await applySeed(handle.db, seed);
  await handle.db.delete(schema.aiUsage);
}, DB_SETUP_TIMEOUT);
afterAll(() => handle.close());

describe('unified inbox', () => {
  it('lists direct and OTA messages, newest first', async () => {
    const { body } = await call<Inquiry[]>(appWith(null), 'GET', '/api/inbox');
    expect(body).toHaveLength(14);
    expect(body[0]!.receivedAt >= body[1]!.receivedAt).toBe(true);
    expect(body.filter((m) => m.partner === 'Booking.com')).toHaveLength(5);
    expect(body.every((m) => m.status === 'new' && m.parsed === null)).toBe(true);
  });

  it('accepts a pasted message', async () => {
    const res = await call<Inquiry>(appWith(null), 'POST', '/api/inbox', {
      rawText: 'Hello, any room on Friday?',
      channel: 'email',
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: 'new', channel: 'email', partner: null });
    expect(
      (await call<ApiError>(appWith(null), 'POST', '/api/inbox', { rawText: '  ' })).status,
    ).toBe(400);
  });

  it('runs the hero flow: process, hold from an option, mark the reply sent', async () => {
    const { model, calls } = scriptedModel();
    const app = appWith(model);

    const processed = await call<Inquiry>(app, 'POST', '/api/inbox/inq_01/process', {});
    expect(processed.status).toBe(200);
    expect(processed.body.status).toBe('quoted');
    const option = processed.body.suggestion!.options[0]!;
    expect(processed.body.suggestion!.draft).toContain(formatAmount(option.quote.total));
    expect(calls()).toBe(2);

    // Opening it again is free.
    await call(app, 'POST', '/api/inbox/inq_01/process', {});
    expect(calls()).toBe(2);

    const hold = await call<BookingDetail>(app, 'POST', '/api/inbox/inq_01/hold', {
      roomId: option.roomId,
    });
    expect(hold.status).toBe(201);
    expect(hold.body.booking).toMatchObject({
      status: 'hold',
      roomId: option.roomId,
      checkIn: fixture.expected.checkIn,
    });
    expect(hold.body.booking.priceSnapshot?.total).toBe(option.quote.total);
    expect(hold.body.guest).toMatchObject({
      name: 'Jana Testová',
      email: 'jana.testova@example.com',
      language: 'cs',
    });

    const replied = await call<Inquiry>(app, 'POST', '/api/inbox/inq_01/replied', {
      reply: processed.body.suggestion!.draft,
    });
    expect(replied.body).toMatchObject({ status: 'replied', bookingId: hold.body.booking.id });

    const usage = await call<{ byFeature: { feature: string }[] }>(app, 'GET', '/api/ai-usage');
    expect(usage.body.byFeature.map((f) => f.feature)).toEqual(['inbox_draft', 'inbox_extract']);
  });

  it('works without AI, except processing', async () => {
    const app = appWith(null);
    expect((await call<Inquiry>(app, 'GET', '/api/inbox/inq_11')).body.partner).toBe('Booking.com');
    const res = await call<ApiError>(app, 'POST', '/api/inbox/inq_01/process', {});
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('ai_not_configured');
  });

  it('declines a message without AI', async () => {
    const app = appWith(null);
    const { status, body } = await call<Inquiry>(app, 'POST', '/api/inbox/inq_02/decline');
    expect(status).toBe(200);
    expect(body.status).toBe('declined');
  });

  it('refuses to process once the monthly budget is spent', async () => {
    await usageStore.record({
      feature: 'agent',
      model: 'm',
      tokens: { input: 0, cachedInput: 0, output: 0 },
      audioSeconds: 0,
      costMicroUsd: 2_000_000,
    });
    const { model, calls } = scriptedModel();
    const res = await call<ApiError>(appWith(model, 1), 'POST', '/api/inbox/inq_01/process', {});
    expect(res.status).toBe(429);
    expect(calls()).toBe(0);
  });

  it('returns 404 for an unknown message and 409 for a hold without a processed request', async () => {
    const app = appWith(null);
    expect((await call(app, 'GET', '/api/inbox/nope')).status).toBe(404);
    expect((await call(app, 'POST', '/api/inbox/inq_01/hold', { roomId: 'rm_101' })).status).toBe(
      409,
    );
  });
});
