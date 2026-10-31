import type { NightOutlook } from '@orbit/shared';
import { describe, expect, it } from 'vitest';
import {
  type CalendarDay,
  calendarMonths,
  monthPageOf,
  occupancy,
  ratePercent,
  signed,
  suggestions,
} from './revenue';

const night = (date: string, overrides: Partial<NightOutlook> = {}): NightOutlook => ({
  date,
  roomsSold: 10,
  roomsTotal: 40,
  typicalOccupancy: null,
  currentPercent: 0,
  suggestedPercent: 0,
  rates: [],
  factors: [],
  events: [],
  weather: null,
  expectedNoShows: 0,
  ...overrides,
});

describe('rate percents', () => {
  it('signs changes and names no change', () => {
    expect([15, -10, 0].map(ratePercent)).toEqual(['+15%', '-10%', 'Season rate']);
    expect(signed(0)).toBe('0%');
  });
});

describe('occupancy and suggestions', () => {
  it('shares rooms sold and finds nights to change', () => {
    expect(occupancy(night('2026-11-06'))).toBe(0.25);
    expect(occupancy(night('2026-11-06', { roomsTotal: 0 }))).toBe(0);
    const nights = [night('2026-11-06', { suggestedPercent: 10 }), night('2026-11-07')];
    expect(suggestions(nights).map((n) => n.date)).toEqual(['2026-11-06']);
  });
});

describe('calendarMonths', () => {
  const days = (from: string, count: number) =>
    Array.from({ length: count }, (_, i) => {
      const d = new Date(`${from}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() + i);
      return night(d.toISOString().slice(0, 10));
    });
  const dates = (week: CalendarDay[]) => week.map((d) => (d.night ? d.date : null));

  it('pages by month in weeks from Monday, filling the weeks with the days around', () => {
    // 2026-10-20 is a Tuesday; 60 nights reach 2026-12-18.
    const pages = calendarMonths(days('2026-10-20', 60));
    expect(pages.map((p) => p.month)).toEqual(['2026-10', '2026-11', '2026-12']);
    const [oct, nov, dec] = pages;
    expect(oct!.weeks[0]!.map((d) => d.date)[0]).toBe('2026-10-19');
    expect(dates(oct!.weeks[0]!)[0]).toBeNull();
    // October's last week runs into November, whose first week starts in October.
    expect(oct!.weeks.at(-1)!.map((d) => d.inMonth)).toEqual([
      true,
      true,
      true,
      true,
      true,
      true,
      false,
    ]);
    expect(nov!.weeks[0]![0]!.date).toBe('2026-10-26');
    // November 2026 starts on a Sunday and ends on a Monday.
    expect(nov!.weeks).toHaveLength(6);
    // December stops at the week of the last night; days after it have no night.
    expect(dec!.weeks.at(-1)!.at(-1)!.date).toBe('2026-12-20');
    expect(dates(dec!.weeks.at(-1)!)).toEqual([
      '2026-12-14',
      '2026-12-15',
      '2026-12-16',
      '2026-12-17',
      '2026-12-18',
      null,
      null,
    ]);
  });

  it('leaves out a month whose nights all show on the next page', () => {
    // From Saturday the 31st, October's one night is in November's first week.
    const pages = calendarMonths(days('2026-10-31', 60));
    expect(pages.map((p) => p.month)).toEqual(['2026-11', '2026-12']);
    expect(dates(pages[0]!.weeks[0]!)).toEqual([
      null,
      null,
      null,
      null,
      null,
      '2026-10-31',
      '2026-11-01',
    ]);
    // A week inside two months keeps one page.
    expect(calendarMonths(days('2026-10-31', 2))).toHaveLength(1);
    expect(calendarMonths([])).toEqual([]);
  });

  it('finds the page a night belongs on', () => {
    const pages = calendarMonths(days('2026-10-31', 60));
    expect(monthPageOf(pages, '2026-10-31')).toBe(0);
    expect(monthPageOf(pages, '2026-11-30')).toBe(0);
    expect(monthPageOf(pages, '2026-12-01')).toBe(1);
  });
});
