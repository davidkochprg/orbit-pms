import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { createTranslator, sameAmounts } from './translate';
import type { UsageRecord } from './usage';

function setup(replies: string[], budgetLeft = true) {
  const prompts: string[] = [];
  const model = new MockLanguageModelV4({
    doGenerate: (options) => {
      prompts.push(JSON.stringify(options.prompt));
      return Promise.resolve({
        content: [{ type: 'text', text: replies[prompts.length - 1] ?? '' }],
        finishReason: { unified: 'stop', raw: undefined },
        usage: {
          inputTokens: { total: 200, noCache: 200, cacheRead: 0, cacheWrite: undefined },
          outputTokens: { total: 60, text: 60, reasoning: undefined },
        },
        warnings: [],
      });
    },
  });
  const records: UsageRecord[] = [];
  const translator = createTranslator({
    model,
    modelId: 'muse-spark-1.3',
    usage: {
      record: (r) => {
        records.push(r);
        return Promise.resolve();
      },
      monthToDateMicroUsd: () => Promise.resolve(0),
    },
    canSpend: () => Promise.resolve(budgetLeft),
  });
  return { translator, prompts, records };
}

describe('sameAmounts', () => {
  it('compares amounts however they are written and ordered', () => {
    expect(
      sameAmounts('Total 12 500 CZK, deposit 2 000 CZK', 'Záloha 2 000 Kč, celkem 12 500 CZK'),
    ).toBe(true);
    expect(sameAmounts('Total 12 500 CZK', 'Celkem 12 000 CZK')).toBe(false);
    expect(sameAmounts('No prices here', 'Žádné ceny')).toBe(true);
  });
});

describe('translator', () => {
  it('translates into the asked language and records the usage', async () => {
    const { translator, prompts, records } = setup(['Pokoj stojí 5 000 CZK.']);
    expect(await translator.translate('The room costs 5 000 CZK.', 'cs')).toBe(
      'Pokoj stojí 5 000 CZK.',
    );
    expect(prompts[0]).toContain('into Czech');
    expect(records.map((r) => r.feature)).toEqual(['translate']);
  });

  it('redoes a translation that changed an amount, then refuses it', async () => {
    const fixed = setup(['Pokoj stojí 5 500 CZK.', 'Pokoj stojí 5 000 CZK.']);
    expect(await fixed.translator.translate('The room costs 5 000 CZK.', 'cs')).toBe(
      'Pokoj stojí 5 000 CZK.',
    );
    expect(fixed.prompts[1]).toContain('changed an amount');

    const wrong = setup(['5 500 CZK', '5 500 CZK']);
    await expect(wrong.translator.translate('5 000 CZK', 'cs')).rejects.toThrow(
      /changed an amount/,
    );
  });

  it('does not call the model once the budget is spent', async () => {
    const { translator, prompts } = setup(['x'], false);
    await expect(translator.translate('Hello', 'cs')).rejects.toThrow(/budget/);
    expect(prompts).toEqual([]);
  });
});
