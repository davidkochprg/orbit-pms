import type { RateReviewInput } from '@orbit/domain';
import type { NightOutlook, RateSignal } from '@orbit/shared';
import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { createRateReviewer, reviewData } from './revenue-review';
import type { UsageRecord } from './usage';

const night: NightOutlook = {
  date: '2026-11-06',
  roomsSold: 20,
  roomsTotal: 50,
  typicalOccupancy: 0.5,
  currentPercent: 0,
  suggestedPercent: 0,
  rates: [],
  factors: [{ kind: 'event', label: 'Night before Ski opening', percent: 10 }],
  events: [],
  weather: {
    date: '2026-11-06',
    kind: 'snow',
    tempMinC: -3,
    tempMaxC: 1,
    precipitationMm: 8,
    snowfallCm: 6,
  },
  expectedNoShows: 0,
};
const input: RateReviewInput = {
  today: '2026-10-31',
  hotel: { name: 'Test Lodge', location: 'Test Valley', country: 'US' },
  nights: [night],
  events: [
    {
      id: 'evt_1',
      name: 'Ski opening',
      firstNight: '2026-11-07',
      lastNight: '2026-11-08',
      impact: 'high',
    },
  ],
  inquiries: [
    {
      id: 'inq_1',
      receivedAt: '2026-10-30T09:00:00.000Z',
      subject: 'Team retreat',
      message: 'Could we have eight rooms next Friday?',
      checkIn: null,
      checkOut: null,
      adults: null,
    },
  ],
};

const signal = (overrides: Partial<RateSignal> = {}): RateSignal => ({
  firstNight: '2026-11-06',
  lastNight: '2026-11-06',
  direction: 'up',
  strength: 'strong',
  label: 'Team retreat asking for eight rooms',
  reason: 'A team asked for eight rooms next Friday, on top of the ski opening.',
  ...overrides,
});

function reviewer(signals: RateSignal[]) {
  const calls: { prompt: string; reasoning: unknown }[] = [];
  const model = new MockLanguageModelV4({
    doGenerate: (options) => {
      calls.push({
        prompt: JSON.stringify(options.prompt),
        reasoning: options.reasoning,
      });
      return Promise.resolve({
        content: [{ type: 'text', text: JSON.stringify({ signals }) }],
        finishReason: { unified: 'stop', raw: undefined },
        usage: {
          inputTokens: { total: 4000, noCache: 4000, cacheRead: 0, cacheWrite: undefined },
          outputTokens: { total: 3000, text: 400, reasoning: 2600 },
        },
        warnings: [],
      });
    },
  });
  const records: UsageRecord[] = [];
  const review = createRateReviewer({
    model,
    modelId: 'muse-spark-1.3',
    usage: {
      record: (r) => {
        records.push(r);
        return Promise.resolve();
      },
      monthToDateMicroUsd: () => Promise.resolve(0),
    },
  });
  return { review, calls, records };
}

describe('reviewData', () => {
  it('spells out weekdays and rooms, and leaves out guest names and percents', () => {
    const data = reviewData(input);
    expect(data.today).toBe('Sat 2026-10-31');
    expect(data.nights).toEqual([
      {
        night: 'Fri 2026-11-06',
        booked: '20 of 50 rooms',
        usualForWeekday: '25 of 50 rooms',
        rules: ['Night before Ski opening'],
        weather: 'snow, -3 to 1 °C, 6 cm snow',
      },
    ]);
    expect(data.inquiries).toEqual([
      {
        sent: 'Fri 2026-10-30',
        subject: 'Team retreat',
        message: 'Could we have eight rooms next Friday?',
      },
    ]);
    expect(JSON.stringify(data)).not.toMatch(/%/);
  });
});

describe('createRateReviewer', () => {
  it('reviews at high reasoning, records the cost and returns the signals', async () => {
    const { review, calls, records } = reviewer([signal()]);
    expect(await review.review(input)).toEqual([signal()]);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.reasoning).toBe('high');
    expect(calls[0]!.prompt).toContain('eight rooms next Friday');
    expect(records).toEqual([
      expect.objectContaining({ feature: 'rate_review', model: 'muse-spark-1.3' }),
    ]);
  });

  it('drops signals that state a percent or a price', async () => {
    const { review } = reviewer([
      signal(),
      signal({ label: 'Raise by 20%' }),
      signal({ reason: 'Guests would pay $250 a night.' }),
      signal({ reason: 'Worth 15 percent more.' }),
    ]);
    expect(await review.review(input)).toEqual([signal()]);
  });
});
