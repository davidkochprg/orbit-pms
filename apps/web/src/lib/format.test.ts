import { describe, expect, it } from 'vitest';
import {
  formatCzk,
  formatDate,
  formatDayHeader,
  formatFullDate,
  formatLongDate,
  formatParty,
  formatRange,
  initials,
  orbShift,
} from './format';

describe('format', () => {
  it('formats dates without timezone shifts', () => {
    expect(formatDate('2026-10-27')).toBe('Tue 27 Oct');
    expect(formatFullDate('1985-03-14')).toBe('14 Mar 1985');
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

  it('formats headers and long dates', () => {
    expect(formatDayHeader('2026-10-27')).toEqual({ weekday: 'Tue', day: '27 Oct' });
    expect(formatLongDate('2026-10-27')).toBe('Tuesday, 27 October');
  });

  it('builds avatar initials', () => {
    expect(initials('Jana Nováková')).toBe('JN');
    expect(initials('Anna Maria von Berg')).toBe('AB');
    expect(initials('  cher ')).toBe('C');
    expect(initials('')).toBe('');
  });
});

describe('orbShift', () => {
  it('is stable per name and stays within ±36 degrees', () => {
    expect(orbShift('Jana Nováková')).toBe(orbShift('Jana Nováková'));
    for (const name of ['A', 'Guest B', 'Martina Kovářová', '']) {
      expect(Math.abs(orbShift(name))).toBeLessThanOrEqual(36);
    }
  });

  it('turns different names differently', () => {
    const shifts = new Set(['Anna', 'Petr', 'Lucie', 'Jakub', 'Eva'].map(orbShift));
    expect(shifts.size).toBeGreaterThan(1);
  });
});
