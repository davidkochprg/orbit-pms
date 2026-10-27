import { describe, expect, it } from 'vitest';
import { containsText, normalizeText } from './text';

describe('containsText', () => {
  it('ignores case and accents', () => {
    expect(containsText('Tomáš Novák', 'novak')).toBe(true);
    expect(containsText('Jakub Dvořák', 'DVORAK')).toBe(true);
    expect(containsText('Michał Lewandowski', 'michal')).toBe(true);
    expect(containsText('Lea Hoffmann', 'novak')).toBe(false);
  });

  it('normalizes German umlauts by stripping the mark', () => {
    expect(normalizeText('Krüger')).toBe('kruger');
  });
});
