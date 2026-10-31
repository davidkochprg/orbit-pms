import { describe, expect, it } from 'vitest';
import { MAX_KEYWORDS, speechKeywords } from './speech';

describe('speechKeywords', () => {
  it('lists guests first, then room names that are not plain numbers, once each', () => {
    expect(
      speechKeywords(['Kateřina Čermáková', ' Jan Novák ', 'Jan Novák'], ['101', 'A1']),
    ).toEqual(['Kateřina Čermáková', 'Jan Novák', 'A1']);
  });

  it(`keeps at most ${MAX_KEYWORDS}`, () => {
    const names = Array.from({ length: 150 }, (_, i) => `Guest ${i}`);
    expect(speechKeywords(names, ['A1'])).toHaveLength(MAX_KEYWORDS);
  });
});
