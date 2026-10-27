import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb } from './client';
import { aiUsage } from './schema';
import { createUsageStore } from './usage';

const handle = createDb('memory://');
const store = createUsageStore(handle.db);
const tokens = { input: 1000, cachedInput: 400, output: 100 };

beforeAll(() => handle.migrate());
afterAll(() => handle.close());

describe('usage store (PGlite)', () => {
  it('sums cost for the current month only, per feature', async () => {
    await store.record({
      feature: 'agent',
      model: 'm',
      tokens,
      audioSeconds: 0,
      costMicroUsd: 1200,
    });
    await store.record({
      feature: 'agent',
      model: 'm',
      tokens,
      audioSeconds: 0,
      costMicroUsd: 800,
    });
    await store.record({
      feature: 'voice',
      model: 'v',
      tokens: { input: 0, cachedInput: 0, output: 0 },
      audioSeconds: 12.7,
      costMicroUsd: 600,
    });
    await handle.db.insert(aiUsage).values({
      feature: 'agent',
      model: 'm',
      inputTokens: 1,
      cachedInputTokens: 0,
      outputTokens: 1,
      costMicroUsd: 999_999,
      createdAt: new Date('2026-09-30T23:59:59Z'),
    });

    const now = new Date('2026-10-27T10:00:00Z');
    expect(await store.monthToDateMicroUsd(now)).toBe(2600);
    expect(await store.monthToDateByFeature(now)).toEqual([
      {
        feature: 'agent',
        calls: 2,
        inputTokens: 2000,
        cachedInputTokens: 800,
        outputTokens: 200,
        audioSeconds: 0,
        costMicroUsd: 2000,
      },
      {
        feature: 'voice',
        calls: 1,
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
        audioSeconds: 12,
        costMicroUsd: 600,
      },
    ]);
  });
});
