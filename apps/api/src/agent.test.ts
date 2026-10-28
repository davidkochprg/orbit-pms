import { pricingConfig } from '@orbit/domain';
import {
  applySeed,
  buildSeed,
  createDb,
  createRepositories,
  createUsageStore,
  schema,
} from '@orbit/db';
import type { AiUsageSummary, ApiError, BookingDetail, PendingAction } from '@orbit/shared';
import { simulateReadableStream } from 'ai';
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

const usage = {
  inputTokens: { total: 100, noCache: 100, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 20, text: 20, reasoning: undefined },
};

/** A scripted model: each call returns the next step. */
function scriptedModel(steps: ({ tool: string; input: unknown } | { text: string })[]) {
  let call = 0;
  return new MockLanguageModelV4({
    doStream: () => {
      const step = steps[Math.min(call++, steps.length - 1)]!;
      const finish = (unified: 'tool-calls' | 'stop') =>
        ({ type: 'finish', finishReason: { unified, raw: undefined }, usage }) as const;
      const stream =
        'tool' in step
          ? simulateReadableStream({
              chunks: [
                {
                  type: 'tool-call' as const,
                  toolCallId: `c${call}`,
                  toolName: step.tool,
                  input: JSON.stringify(step.input),
                },
                finish('tool-calls'),
              ],
            })
          : simulateReadableStream({
              chunks: [
                { type: 'text-start' as const, id: 't' },
                { type: 'text-delta' as const, id: 't', delta: step.text },
                { type: 'text-end' as const, id: 't' },
                finish('stop'),
              ],
            });
      return Promise.resolve({ stream });
    },
  });
}

const userMessage = (text: string) => ({ id: 'm1', role: 'user', parts: [{ type: 'text', text }] });

function appWith(
  model: MockLanguageModelV4 | null,
  limits = { perIpPerHour: 20, dailyTokenBudget: 1_000_000 },
  monthlyBudgetUsd = 100,
) {
  return createApp({
    repos,
    ai: model && {
      agent: model,
      agentModelId: 'muse-spark-1.3',
      vision: null,
      visionModelId: null,
      transcription: null,
    },
    limits,
    usage: usageStore,
    monthlyBudgetUsd,
    clock: () => now,
  });
}

async function post(app: ReturnType<typeof createApp>, path: string, body?: unknown) {
  return app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7' },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
}

beforeAll(() => handle.migrate(), DB_SETUP_TIMEOUT);
beforeEach(async () => {
  await applySeed(handle.db, seed);
  await handle.db.delete(schema.aiUsage);
}, DB_SETUP_TIMEOUT);
afterAll(() => handle.close());

const arrival = seed.bookings.find((b) => b.checkIn === today && b.status === 'confirmed')!;

describe('POST /api/agent', () => {
  it('streams a turn that proposes a change, which then runs only on confirm', async () => {
    const app = appWith(
      scriptedModel([
        { tool: 'getArrivals', input: {} },
        { tool: 'cancelBooking', input: { bookingId: arrival.id } },
        { text: 'I prepared the cancellation. Please confirm it.' },
      ]),
    );
    const res = await post(app, '/api/agent', {
      messages: [userMessage('Cancel the first arrival')],
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const body = await res.text();
    expect(body).toContain('awaiting_confirmation');
    expect(body).toContain('I prepared the cancellation.');

    // Nothing has changed yet.
    const before = (await (
      await app.request(`/api/bookings/${arrival.id}`)
    ).json()) as BookingDetail;
    expect(before.booking.status).toBe('confirmed');

    const actionId = /"pendingActionId":"(act_[^"]+)"/.exec(body)?.[1];
    expect(actionId).toBeDefined();
    const pending = (await (
      await app.request(`/api/pending-actions/${actionId}`)
    ).json()) as PendingAction;
    expect(pending).toMatchObject({ kind: 'cancel_booking', status: 'pending' });

    const confirmed = await post(app, `/api/pending-actions/${actionId}/confirm`);
    expect(confirmed.status).toBe(200);
    expect(((await confirmed.json()) as PendingAction).status).toBe('confirmed');
    const after = (await (
      await app.request(`/api/bookings/${arrival.id}`)
    ).json()) as BookingDetail;
    expect(after.booking.status).toBe('cancelled');

    const log = (await (await app.request(`/api/audit-log?subjectId=${arrival.id}`)).json()) as {
      actor: string;
    }[];
    expect(log[0]?.actor).toBe('agent');

    // A second confirm is refused.
    expect((await post(app, `/api/pending-actions/${actionId}/confirm`)).status).toBe(409);
  });

  it('tells the agent about the hotel as saved in Settings', async () => {
    await repos.settings.saveProfile({
      ...seed.hotelProfile,
      entries: [
        { id: 'pool', category: 'amenity', title: 'Pool', details: 'Indoor pool, 08:00 to 20:00.' },
      ],
    });
    const model = scriptedModel([{ text: 'The pool is open from 08:00 to 20:00.' }]);
    await (await post(appWith(model), '/api/agent', { messages: [userMessage('Pool?')] })).text();
    const system = JSON.stringify(model.doStreamCalls[0]?.prompt[0]);
    expect(system).toContain('Pool: Indoor pool, 08:00 to 20:00.');
    expect(system).toContain(seed.hotelProfile.name);
  });

  it('rejects a proposal without changing anything', async () => {
    const app = appWith(
      scriptedModel([
        { tool: 'cancelBooking', input: { bookingId: arrival.id } },
        { text: 'Prepared.' },
      ]),
    );
    const body = await (
      await post(app, '/api/agent', { messages: [userMessage('cancel')] })
    ).text();
    const actionId = /"pendingActionId":"(act_[^"]+)"/.exec(body)?.[1];
    const rejected = (await (
      await post(app, `/api/pending-actions/${actionId}/reject`)
    ).json()) as PendingAction;
    expect(rejected.status).toBe('rejected');
    const detail = (await (
      await app.request(`/api/bookings/${arrival.id}`)
    ).json()) as BookingDetail;
    expect(detail.booking.status).toBe('confirmed');
  });

  it('returns 503 when AI is not configured', async () => {
    const res = await post(appWith(null), '/api/agent', { messages: [userMessage('hi')] });
    expect(res.status).toBe(503);
    expect(((await res.json()) as ApiError).error.code).toBe('ai_not_configured');
  });

  it('returns 429 with a demo message once the per-IP limit is reached', async () => {
    const app = appWith(scriptedModel([{ text: 'Hello' }]), {
      perIpPerHour: 1,
      dailyTokenBudget: 1_000_000,
    });
    const first = await post(app, '/api/agent', { messages: [userMessage('hi')] });
    expect(first.status).toBe(200);
    // Read the stream to the end so its usage is recorded inside this test.
    await first.text();
    const limited = await post(app, '/api/agent', { messages: [userMessage('hi again')] });
    expect(limited.status).toBe(429);
    const body = (await limited.json()) as ApiError;
    expect(body.error.code).toBe('demo_limit');
    expect(body.error.message).toMatch(/Demo limit reached/);
  });

  it('rejects malformed messages', async () => {
    const app = appWith(scriptedModel([{ text: 'x' }]));
    expect((await post(app, '/api/agent', { messages: [] })).status).toBe(400);
    expect((await post(app, '/api/agent', { messages: [{ role: 'nobody' }] })).status).toBe(400);
  });
});

describe('AI usage and budget', () => {
  it('records each agent turn with its cost and reports it', async () => {
    const app = appWith(scriptedModel([{ tool: 'getArrivals', input: {} }, { text: 'Done.' }]));
    await (await post(app, '/api/agent', { messages: [userMessage('arrivals?')] })).text();
    const summary = (await (await app.request('/api/ai-usage')).json()) as AiUsageSummary;
    expect(summary.month).toBe('2026-10');
    expect(summary.budgetMicroUsd).toBe(100_000_000);
    // Two model calls of 100 input + 20 output tokens each.
    const expected = Math.round(200 * 1.25 + 40 * 4.25);
    expect(summary.spentMicroUsd).toBe(expected);
    expect(summary.byFeature).toEqual([
      expect.objectContaining({
        feature: 'agent',
        calls: 1,
        inputTokens: 200,
        outputTokens: 40,
        costMicroUsd: expected,
      }),
    ]);
  });

  it('stops the agent once the monthly budget is spent', async () => {
    await usageStore.record({
      feature: 'agent',
      model: 'm',
      tokens: { input: 0, cachedInput: 0, output: 0 },
      audioSeconds: 0,
      costMicroUsd: 1_000_000,
    });
    const app = appWith(scriptedModel([{ text: 'x' }]), undefined, 1);
    const res = await post(app, '/api/agent', { messages: [userMessage('hi')] });
    expect(res.status).toBe(429);
    expect(((await res.json()) as ApiError).error.message).toMatch(/budget for this month/);
  });
});

describe('pending actions', () => {
  it('returns 404 for an unknown action', async () => {
    expect((await appWith(null).request('/api/pending-actions/nope')).status).toBe(404);
  });
});
