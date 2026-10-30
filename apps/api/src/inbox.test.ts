import { formatAmount } from '@orbit/ai';
import { buildInquiryFixtures } from '@orbit/ai/evals';
import {
  applySeed,
  buildSeed,
  createDb,
  createRepositories,
  createUsageStore,
  schema,
} from '@orbit/db';
import type { ApiError, BookingDetail, HotelProfile, Inquiry, PendingAction } from '@orbit/shared';
import { MockLanguageModelV4 } from 'ai/test';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app';

// PGlite migrates and seeds in setup hooks; with every test file running in parallel that can
// take longer than Vitest's 10 s default.
const DB_SETUP_TIMEOUT = 60_000;

const today = '2026-10-27';
const now = new Date('2026-10-27T08:00:00Z');
const handle = createDb('memory://');
const seed = buildSeed(today, now, 'cz');
const repos = createRepositories(handle.db);
const usageStore = createUsageStore(handle.db);
const fixture = buildInquiryFixtures(today).find((f) => f.id === 'inq_01')!;

/**
 * Answers like the real model would, by what is asked: the fixture's expected extraction, a draft
 * quoting whatever total the prompt gave, or a translation that keeps the amounts.
 */
function scriptedModel() {
  let calls = 0;
  const model = new MockLanguageModelV4({
    doGenerate: (options) => {
      calls++;
      const prompt = JSON.stringify(options.prompt);
      const user = options.prompt.findLast((m) => m.role === 'user');
      const asked =
        user?.role === 'user'
          ? user.content.map((c) => (c.type === 'text' ? c.text : '')).join('')
          : '';
      const text = prompt.includes('extract structured data')
        ? JSON.stringify(fixture.expected)
        : prompt.includes('You translate')
          ? `Translated: ${asked}`
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
      translate: model,
      translateModelId: 'muse-spark-1.3',
      draft: model,
      draftModelId: 'muse-spark-1.3',
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
  staffId?: string,
) {
  const res = await app.request(path, {
    method,
    headers: { 'content-type': 'application/json', ...(staffId && { 'x-staff-id': staffId }) },
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

/** Reads every sent reply as stating a new fact about EV charging. */
const learningModel = new MockLanguageModelV4({
  doGenerate: () =>
    Promise.resolve({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            save: true,
            category: 'getting_here',
            title: 'EV charging',
            details: 'Two chargers in the back lot, free for guests.',
            tags: ['ev', 'parking'],
            until: null,
          }),
        },
      ],
      finishReason: { unified: 'stop', raw: undefined },
      usage: {
        inputTokens: { total: 400, noCache: 400, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 40, text: 40, reasoning: undefined },
      },
      warnings: [],
    }),
});

describe('learning from replies', () => {
  it('proposes saving a fact staff told a guest, saved only once confirmed', async () => {
    const app = appWith(learningModel);
    await call(app, 'POST', '/api/inbox/inq_01/send', {
      body: 'Yes, two chargers in the back lot, free for guests.',
    });
    const learned = await call<PendingAction>(app, 'POST', '/api/inbox/inq_01/learn');
    expect(learned.body).toMatchObject({
      kind: 'save_hotel_info',
      status: 'pending',
      input: { title: 'EV charging', category: 'getting_here', tags: ['ev', 'parking'] },
    });
    const before = await call<HotelProfile>(app, 'GET', '/api/settings/profile');
    expect(before.body.entries.some((e) => e.title === 'EV charging')).toBe(false);

    await call(app, 'POST', `/api/pending-actions/${learned.body.id}/confirm`);
    const after = await call<HotelProfile>(app, 'GET', '/api/settings/profile');
    expect(after.body.entries).toContainEqual(
      expect.objectContaining({ title: 'EV charging', category: 'getting_here' }),
    );
  });

  it('needs the AI to be configured', async () => {
    expect((await call(appWith(null), 'POST', '/api/inbox/inq_01/learn')).status).toBe(503);
  });
});

describe('unified inbox', () => {
  it('lists direct and OTA conversations, latest message first, none prepared yet', async () => {
    const { body } = await call<Inquiry[]>(appWith(null), 'GET', '/api/inbox');
    expect(body).toHaveLength(seed.inquiries.length);
    expect(body.map((m) => m.lastMessageAt)).toEqual(
      body
        .map((m) => m.lastMessageAt)
        .sort()
        .reverse(),
    );
    expect(body.filter((m) => m.partner === 'Booking.com').length).toBeGreaterThanOrEqual(5);
    expect(body.every((m) => m.parsed === null && m.messages.length > 0)).toBe(true);
  });

  it('accepts a pasted message', async () => {
    const res = await call<Inquiry>(appWith(null), 'POST', '/api/inbox', {
      body: 'Hello, any room on Friday?',
      channel: 'email',
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: 'new', channel: 'email', partner: null });
    expect((await call<ApiError>(appWith(null), 'POST', '/api/inbox', { body: '  ' })).status).toBe(
      400,
    );
  });

  it('runs the hero flow: prepare on request, hold from an option, send the reply', async () => {
    const { model, calls } = scriptedModel();
    const app = appWith(model);

    // Opening a conversation costs nothing; only asking for a reply calls the model.
    await call(app, 'GET', '/api/inbox/inq_01');
    expect(calls()).toBe(0);

    const processed = await call<Inquiry>(app, 'POST', '/api/inbox/inq_01/process', {
      language: 'en',
    });
    expect(processed.status).toBe(200);
    expect(processed.body.status).toBe('quoted');
    const option = processed.body.suggestion!.options[0]!;
    expect(processed.body.suggestion!.draft).toContain(
      formatAmount(option.quote.total, option.quote.currency),
    );
    expect(processed.body.suggestion!.draftTranslation).toEqual({
      language: 'en',
      text: `Translated: ${processed.body.suggestion!.draft}`,
    });
    expect(calls()).toBe(3);

    // Asking again is free.
    await call(app, 'POST', '/api/inbox/inq_01/process', {});
    expect(calls()).toBe(3);

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

    const sent = await call<Inquiry>(
      app,
      'POST',
      '/api/inbox/inq_01/send',
      { body: processed.body.suggestion!.draft },
      'stf_martina',
    );
    expect(sent.body).toMatchObject({ status: 'replied', bookingId: hold.body.booking.id });
    expect(sent.body.messages.at(-1)).toMatchObject({
      direction: 'out',
      author: 'Martina Kovářová',
      body: processed.body.suggestion!.draft,
    });

    const usage = await call<{ byFeature: { feature: string }[] }>(app, 'GET', '/api/ai-usage');
    expect(usage.body.byFeature.map((f) => f.feature).sort()).toEqual([
      'inbox_draft',
      'inbox_extract',
      'translate',
    ]);
  });

  it('reads the request first, then drafts about the room staff hold', async () => {
    const { model, calls } = scriptedModel();
    const app = appWith(model);

    const read = await call<Inquiry>(app, 'POST', '/api/inbox/inq_01/read', {});
    expect(read.status).toBe(200);
    expect(read.body.suggestion).toMatchObject({ draft: null });
    expect(read.body.suggestion!.options.length).toBeGreaterThan(0);
    expect(calls()).toBe(1);
    // Reading again is free.
    await call(app, 'POST', '/api/inbox/inq_01/read', {});
    expect(calls()).toBe(1);

    const option = read.body.suggestion!.options[0]!;
    await call(app, 'POST', '/api/inbox/inq_01/hold', { roomId: option.roomId });
    const drafted = await call<Inquiry>(app, 'POST', '/api/inbox/inq_01/draft', { language: 'cs' });
    expect(drafted.body.suggestion!.draft).toContain(
      formatAmount(option.quote.total, option.quote.currency),
    );
    // One call for the draft; the guest writes Czech, so there is nothing to translate.
    expect(calls()).toBe(2);
  });

  it('translates a guest message once per language', async () => {
    const { model, calls } = scriptedModel();
    const app = appWith(model);
    const messageId = (await call<Inquiry>(app, 'GET', '/api/inbox/inq_02')).body.messages[0]!.id;
    const path = `/api/inbox/inq_02/messages/${messageId}/translate`;
    const first = await call<Inquiry>(app, 'POST', path, { to: 'en' });
    expect(first.body.messages[0]!.translation?.language).toBe('en');
    await call(app, 'POST', path, { to: 'en' });
    expect(calls()).toBe(1);
    expect(
      (await call(app, 'POST', '/api/inbox/inq_02/messages/nope/translate', { to: 'en' })).status,
    ).toBe(404);
  });

  it('translates any text, e.g. a reply staff wrote in their own language', async () => {
    const { model } = scriptedModel();
    const res = await call<{ text: string }>(appWith(model), 'POST', '/api/inbox/translate', {
      text: 'Pokoj stojí 4 000 CZK.',
      to: 'de',
    });
    expect(res.body.text).toBe('Translated: Pokoj stojí 4 000 CZK.');
    expect(
      (await call(appWith(null), 'POST', '/api/inbox/translate', { text: 'x', to: 'de' })).status,
    ).toBe(503);
  });

  it('works as a mailbox without AI: compose, receive, read state and archive', async () => {
    const app = appWith(null);
    const composed = await call<Inquiry>(
      app,
      'POST',
      '/api/inbox/compose',
      { toName: 'Demo Guest', toAddress: 'demo@example.com', subject: 'Hello', body: 'Hi!' },
      'stf_petr',
    );
    expect(composed.status).toBe(201);
    expect(composed.body).toMatchObject({ status: 'replied', unread: false });
    expect(composed.body.messages[0]).toMatchObject({ direction: 'out', author: 'Petr Svoboda' });

    const answered = await call<Inquiry>(app, 'POST', `/api/inbox/${composed.body.id}/receive`, {
      body: 'Thanks!',
    });
    expect(answered.body).toMatchObject({ status: 'new', unread: true });

    const read = await call<Inquiry>(app, 'POST', `/api/inbox/${composed.body.id}/unread`, {
      unread: false,
    });
    expect(read.body.unread).toBe(false);
    const archived = await call<Inquiry>(app, 'POST', `/api/inbox/${composed.body.id}/archive`, {
      archived: true,
    });
    expect(archived.body.archivedAt).toBe(now.toISOString());
    expect(
      (
        await call(app, 'POST', '/api/inbox/compose', {
          toAddress: 'not-an-email',
          subject: 'x',
          body: 'y',
        })
      ).status,
    ).toBe(400);
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
