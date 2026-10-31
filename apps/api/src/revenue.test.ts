import { applySeed, buildSeed, createDb, createRepositories, createUsageStore } from '@orbit/db';
import type { LocalEvent, PricingConfig, Quote, RevenueOutlook, WeatherDay } from '@orbit/shared';
import { MockLanguageModelV4 } from 'ai/test';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app';
import type { WeatherSource } from './weather';

// PGlite migrates and seeds in setup hooks; with every test file running in parallel that can
// take longer than Vitest's 10 s default.
const DB_SETUP_TIMEOUT = 60_000;

const today = '2026-10-27';
const now = new Date('2026-10-27T08:00:00Z');
const handle = createDb('memory://');
const seed = buildSeed(today, now, 'us');
const snow: WeatherDay = {
  date: '2026-10-28',
  kind: 'snow',
  tempMaxC: -1,
  tempMinC: -8,
  precipitationMm: 12,
  snowfallCm: 15,
};
const asked: { latitude: number; longitude: number }[] = [];
const weather: WeatherSource = {
  forecast: (at) => {
    asked.push(at);
    return Promise.resolve([snow]);
  },
};
const app = createApp({
  repos: createRepositories(handle.db),
  ai: null,
  usage: createUsageStore(handle.db),
  clock: () => now,
  weather,
});

/** Reviews every outlook the same way: a group asking for rooms on Friday Oct 30. */
let reviews = 0;
const model = new MockLanguageModelV4({
  doGenerate: () => {
    reviews++;
    return Promise.resolve({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            signals: [
              {
                firstNight: '2026-10-30',
                lastNight: '2026-10-30',
                direction: 'up',
                strength: 'moderate',
                label: 'Group asking for six rooms',
                reason: 'A planner asked for a block of six rooms on Friday.',
              },
            ],
          }),
        },
      ],
      finishReason: { unified: 'stop', raw: undefined },
      usage: {
        inputTokens: { total: 5000, noCache: 5000, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 2000, text: 200, reasoning: 1800 },
      },
      warnings: [],
    });
  },
});
const withAi = createApp({
  repos: createRepositories(handle.db),
  ai: {
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
  usage: createUsageStore(handle.db),
  clock: () => now,
  weather,
});

beforeAll(() => handle.migrate(), DB_SETUP_TIMEOUT);
beforeEach(() => applySeed(handle.db, seed), DB_SETUP_TIMEOUT);
afterAll(() => handle.close());

const manager = seed.staff.find((s) => s.active && s.role === 'manager')!;
const receptionist = seed.staff.find((s) => s.active && s.role === 'receptionist')!;

async function call<T>(method: string, path: string, body?: unknown, staffId?: string) {
  const res = await app.request(path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(staffId && { 'x-staff-id': staffId }),
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
  return { status: res.status, body: (res.status === 204 ? null : await res.json()) as T };
}

describe('revenue outlook', () => {
  it('suggests rates for the next nights from bookings, events and the forecast', async () => {
    const { status, body } = await call<RevenueOutlook>('GET', '/api/revenue/outlook?days=30');
    expect(status).toBe(200);
    expect(body.today).toBe(today);
    expect(body.nights).toHaveLength(30);
    expect(body.weatherAvailable).toBe(true);
    expect(asked).toContainEqual(seed.hotelProfile.coordinates);
    expect(body.nights[1]!.factors).toContainEqual({
      kind: 'weather',
      label: 'Heavy snow',
      percent: 10,
    });
    // The seeded big event weekend is nearly sold out and suggested higher.
    const big = seed.events.find((e) => e.impact === 'high')!;
    const night = body.nights.find((n) => n.date === big.firstNight)!;
    expect(night.events).toEqual([big.name]);
    expect(night.roomsSold / night.roomsTotal).toBeGreaterThanOrEqual(0.9);
    expect(night.suggestedPercent).toBeGreaterThanOrEqual(25);
  });

  it('rejects an out-of-range number of days', async () => {
    expect((await call('GET', '/api/revenue/outlook?days=400')).status).toBe(400);
  });
});

describe('rate review', () => {
  async function review() {
    const res = await withAi.request('/api/revenue/review', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ days: 30 }),
    });
    return { status: res.status, body: (await res.json()) as RevenueOutlook };
  }

  it("reviews a changed outlook once and suggests from the model's signals", async () => {
    reviews = 0;
    const before = await call<RevenueOutlook>('GET', '/api/revenue/outlook?days=30');
    expect(before.body.review).toMatchObject({ reviewedAt: null, current: false });

    const { status, body } = await review();
    expect(status).toBe(200);
    expect(reviews).toBe(1);
    expect(body.review).toEqual({
      basis: before.body.review.basis,
      reviewedAt: now.toISOString(),
      current: true,
    });
    const friday = body.nights.find((n) => n.date === '2026-10-30')!;
    expect(friday.factors).toContainEqual({
      kind: 'insight',
      label: 'Group asking for six rooms',
      detail: 'A planner asked for a block of six rooms on Friday.',
      percent: 10,
    });

    // Nothing changed: no second model call.
    await review();
    expect(reviews).toBe(1);
  });

  it('needs AI configured', async () => {
    expect((await call('POST', '/api/revenue/review', { days: 30 })).status).toBe(503);
  });
});

describe('rate adjustments', () => {
  const stay = {
    roomTypeId: 'rt_double',
    checkIn: '2026-11-20',
    checkOut: '2026-11-21',
    adults: 2,
    childAges: [],
  };

  it('lets a manager change a night, which new quotes then use', async () => {
    const before = await call<Quote>('POST', '/api/quote', stay);
    const saved = await call<PricingConfig>(
      'POST',
      '/api/rates/adjust',
      { nights: [{ date: '2026-11-20', percent: 20 }] },
      manager.id,
    );
    expect(saved.status).toBe(200);
    expect(saved.body.adjustments).toEqual([{ date: '2026-11-20', percent: 20 }]);
    const after = await call<Quote>('POST', '/api/quote', stay);
    expect(after.body.total).toBe(Math.round(before.body.total * 1.2));
    const outlook = await call<RevenueOutlook>('GET', '/api/revenue/outlook?days=30');
    expect(outlook.body.nights.find((n) => n.date === '2026-11-20')!.currentPercent).toBe(20);
  });

  it('refuses staff who are not managers', async () => {
    const res = await call(
      'POST',
      '/api/rates/adjust',
      { nights: [{ date: '2026-11-20', percent: 20 }] },
      receptionist.id,
    );
    expect(res.status).toBe(403);
  });
});

describe('local events', () => {
  it('lists, creates and deletes events, managers only', async () => {
    const listed = await call<LocalEvent[]>('GET', '/api/events');
    expect(listed.body).toHaveLength(seed.events.length);
    const body = {
      name: 'Food festival',
      firstNight: '2026-11-14',
      lastNight: '2026-11-15',
      impact: 'medium',
    };
    expect((await call('POST', '/api/events', body, receptionist.id)).status).toBe(403);
    expect(
      (await call('POST', '/api/events', { ...body, lastNight: '2026-11-13' }, manager.id)).status,
    ).toBe(400);
    const created = await call<LocalEvent>('POST', '/api/events', body, manager.id);
    expect(created.status).toBe(201);
    expect(
      (await call('DELETE', `/api/events/${created.body.id}`, undefined, manager.id)).status,
    ).toBe(204);
    expect((await call<LocalEvent[]>('GET', '/api/events')).body).toHaveLength(seed.events.length);
  });
});

describe('revenue brief', () => {
  it('needs AI configured', async () => {
    expect((await call('POST', '/api/revenue/brief', { days: 30 })).status).toBe(503);
  });
});
