import type { NightOutlook, RevenueOutlook } from '@orbit/shared';
import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { unknownPercents } from './outlook';
import { createRevenueBriefWriter, RevenueBriefError } from './revenue-brief';
import type { UsageRecord } from './usage';

const night = (overrides: Partial<NightOutlook>): NightOutlook => ({
  date: '2026-11-06',
  roomsSold: 45,
  roomsTotal: 50,
  typicalOccupancy: 0.52,
  currentPercent: 0,
  suggestedPercent: 30,
  factors: [
    { kind: 'demand', label: 'Almost full', percent: 20 },
    { kind: 'event', label: 'Ski area opening weekend', percent: 15 },
  ],
  events: ['Ski area opening weekend'],
  weather: null,
  expectedNoShows: 0.2,
  ...overrides,
});
const outlook: RevenueOutlook = {
  today: '2026-10-30',
  nights: [night({}), night({ date: '2026-11-10', suggestedPercent: 0, factors: [], events: [] })],
  events: [],
  arrivalRisks: [],
  weatherAvailable: false,
};

function writer(replies: string[]) {
  const prompts: string[] = [];
  const model = new MockLanguageModelV4({
    doGenerate: (options) => {
      prompts.push(JSON.stringify(options.prompt));
      return Promise.resolve({
        content: [{ type: 'text', text: replies[prompts.length - 1] ?? '' }],
        finishReason: { unified: 'stop', raw: undefined },
        usage: {
          inputTokens: { total: 900, noCache: 900, cacheRead: 0, cacheWrite: undefined },
          outputTokens: { total: 80, text: 80, reasoning: undefined },
        },
        warnings: [],
      });
    },
  });
  const records: UsageRecord[] = [];
  const brief = createRevenueBriefWriter({
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
  return { brief, prompts, records };
}

describe('unknownPercents', () => {
  it('finds percents the outlook does not state', () => {
    expect(
      unknownPercents('Fri is 90% booked; raise it 30%, not 35 percent.', new Set([90, 30])),
    ).toEqual([35]);
  });
});

describe('createRevenueBriefWriter', () => {
  it('writes from the notable nights only and records the cost', async () => {
    const { brief, prompts, records } = writer([
      'Fri Nov 6 is 90% booked for the Ski area opening weekend: raise it +30%.',
    ]);
    expect(await brief.write(outlook)).toBe(
      'Fri Nov 6 is 90% booked for the Ski area opening weekend: raise it +30%.',
    );
    expect(prompts[0]).toContain('2026-11-06');
    expect(prompts[0]).not.toContain('2026-11-10');
    expect(records).toMatchObject([{ feature: 'rate_brief' }]);
  });

  it('writes again when a percent is made up, and refuses after the second time', async () => {
    const retried = writer(['Raise Friday 37%.', 'Raise Friday +30%.']);
    expect(await retried.brief.write(outlook)).toBe('Raise Friday +30%.');
    expect(retried.prompts).toHaveLength(2);

    const failing = writer(['Raise Friday 37%.', 'Raise Friday 33%.']);
    await expect(failing.brief.write(outlook)).rejects.toThrow(RevenueBriefError);
  });
});
