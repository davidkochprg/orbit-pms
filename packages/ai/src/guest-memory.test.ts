import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { createGuestMemoryReader, tidyMemory } from './guest-memory';
import type { UsageRecord } from './usage';

describe('tidyMemory', () => {
  it('trims, drops empty, overlong and repeated items, and keeps five', () => {
    const items = [
      { kind: 'care' as const, text: '  Allergic to   feathers. ' },
      { kind: 'care' as const, text: 'allergic to feathers.' },
      { kind: 'habit' as const, text: '' },
      { kind: 'habit' as const, text: 'x'.repeat(200) },
      ...['a', 'b', 'c', 'd', 'e'].map((t) => ({ kind: 'preference' as const, text: t })),
    ];
    expect(tidyMemory(items).map((i) => i.text)).toEqual([
      'Allergic to feathers.',
      'a',
      'b',
      'c',
      'd',
    ]);
  });
});

describe('createGuestMemoryReader', () => {
  it('reads the history into items and records the call', async () => {
    const model = new MockLanguageModelV4({
      doGenerate: () =>
        Promise.resolve({
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                items: [{ kind: 'preference', text: 'Prefers a quiet room.' }],
              }),
            },
          ],
          finishReason: { unified: 'stop', raw: undefined },
          usage: {
            inputTokens: { total: 500, noCache: 500, cacheRead: undefined, cacheWrite: undefined },
            outputTokens: { total: 40, text: 40, reasoning: undefined },
          },
          warnings: [],
        }),
    });
    const records: UsageRecord[] = [];
    const reader = createGuestMemoryReader({
      model,
      modelId: 'm',
      usage: {
        record: (r) => {
          records.push(r);
          return Promise.resolve();
        },
        monthToDateMicroUsd: () => Promise.resolve(0),
      },
    });
    expect(await reader.read('Guest: Anna')).toEqual([
      { kind: 'preference', text: 'Prefers a quiet room.' },
    ]);
    expect(records.map((r) => r.feature)).toEqual(['guest_memory']);
  });
});
