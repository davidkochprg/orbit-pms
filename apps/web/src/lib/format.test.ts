import { describe, expect, it } from 'vitest';
import { formatCzk, formatDate, formatParty, formatRange } from './format';

describe('format', () => {
  it('formats dates without timezone shifts', () => {
    expect(formatDate('2026-10-27')).toBe('Tue 27 Oct');
    expect(formatRange('2026-12-31', '2027-01-02')).toBe('Thu 31 Dec – Sat 2 Jan');
  });

  it('formats whole CZK with separators', () => {
    expect(formatCzk(12500)).toBe('12,500 CZK');
    expect(formatCzk(-1250)).toBe('-1,250 CZK');
  });

  it('describes the party', () => {
    expect(formatParty(1, [])).toBe('1 adult');
    expect(formatParty(2, [4])).toBe('2 adults, 1 child (4)');
    expect(formatParty(2, [4, 9])).toBe('2 adults, 2 children (4, 9)');
  });
});
