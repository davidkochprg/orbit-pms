import { afterEach, describe, expect, it } from 'vitest';
import {
  formatCount,
  formatDateTime,
  formatRecent,
  formatMoney,
  formatPrice,
  formatTimeOfDay,
  setDisplayRegion,
  formatDate,
  formatDayHeader,
  formatFullDate,
  formatLongDate,
  formatParty,
  formatRange,
  initials,
  orbShift,
} from './format';

const us = {
  currency: 'USD',
  usDates: true,
  timeZone: 'America/Los_Angeles',
  perRoom: true,
  taxAdded: true,
} as const;
const czech = {
  currency: 'CZK',
  usDates: false,
  timeZone: 'Europe/Prague',
  perRoom: false,
  taxAdded: false,
} as const;

describe('format', () => {
  afterEach(() => setDisplayRegion(us));

  it('formats dates US style without timezone shifts, or European style', () => {
    expect(formatDate('2026-10-27')).toBe('Tue, Oct 27');
    expect(formatFullDate('1985-03-14')).toBe('Mar 14, 1985');
    expect(formatRange('2026-12-31', '2027-01-02')).toBe('Thu, Dec 31 – Sat, Jan 2');
    setDisplayRegion(czech);
    expect(formatDate('2026-10-27')).toBe('Tue 27 Oct');
    expect(formatFullDate('1985-03-14')).toBe('14 Mar 1985');
  });

  it("formats whole amounts in the hotel's currency", () => {
    expect(formatMoney(12500)).toBe('$12,500');
    expect(formatMoney(-150)).toBe('-$150');
    setDisplayRegion(czech);
    expect(formatMoney(12500)).toBe('12,500 CZK');
    expect(formatMoney(-1250)).toBe('-1,250 CZK');
    expect(formatMoney(980, 'EUR')).toBe('980 EUR');
  });

  it("shows times in the hotel's time zone and clock", () => {
    // 22:30 UTC is 3:30 PM in California and 23:30 in Prague.
    expect(formatDateTime('2026-10-27T22:30:00Z')).toBe('Oct 27, 3:30 PM');
    expect(formatTimeOfDay('15:00')).toBe('3 PM');
    setDisplayRegion(czech);
    expect(formatDateTime('2026-10-27T22:30:00Z')).toBe('27 Oct, 23:30');
    expect(formatTimeOfDay('15:00')).toBe('15:00');
  });

  it('shows only the time for a moment earlier the same hotel day', () => {
    setDisplayRegion(us);
    // 3:30 PM and 11:30 PM on Oct 27 in Los Angeles, though the second is Oct 28 in UTC.
    const now = new Date('2026-10-28T06:30:00Z');
    expect(formatRecent('2026-10-27T22:30:00Z', now)).toBe('3:30 PM');
    expect(formatRecent('2026-10-26T22:30:00Z', now)).toBe('Oct 26, 3:30 PM');
    setDisplayRegion(czech);
    expect(formatRecent('2026-10-28T05:30:00Z', new Date('2026-10-28T20:00:00Z'))).toBe('6:30');
  });

  it('describes the party', () => {
    expect(formatParty(1, [])).toBe('1 adult');
    expect(formatParty(2, [4])).toBe('2 adults, 1 child (4)');
    expect(formatParty(2, [4, 9])).toBe('2 adults, 2 children (4, 9)');
  });

  it('formats headers and long dates', () => {
    expect(formatDayHeader('2026-10-27')).toEqual({ weekday: 'Tue', day: 'Oct 27' });
    expect(formatLongDate('2026-10-27')).toBe('Tuesday, October 27');
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

describe('formatPrice', () => {
  afterEach(() => setDisplayRegion(us));

  it('says tax comes on top where it is added on the bill, and nothing where it is included', () => {
    setDisplayRegion(us);
    expect(formatPrice(159)).toBe('$159 + tax');
    setDisplayRegion(czech);
    expect(formatPrice(2000)).toBe(formatMoney(2000));
  });
});

describe('formatCount', () => {
  it('groups thousands', () => {
    expect(formatCount(1458)).toBe('1,458');
    expect(formatCount(12)).toBe('12');
  });
});
