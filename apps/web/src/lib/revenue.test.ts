import type { NightOutlook } from '@orbit/shared';
import { describe, expect, it } from 'vitest';
import { calendarWeeks, occupancy, ratePercent, signed, suggestions } from './revenue';

const night = (date: string, overrides: Partial<NightOutlook> = {}): NightOutlook => ({
  date,
  roomsSold: 10,
  roomsTotal: 40,
  typicalOccupancy: null,
  currentPercent: 0,
  suggestedPercent: 0,
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

describe('calendarWeeks', () => {
  it('lays nights out in weeks from Monday', () => {
    // 2026-10-30 is a Friday.
    const nights = ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02'].map((d) => night(d));
    const weeks = calendarWeeks(nights);
    expect(weeks).toHaveLength(2);
    expect(weeks[0]!.map((n) => n?.date ?? null)).toEqual([
      null,
      null,
      null,
      null,
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
    ]);
    expect(weeks[1]!.map((n) => n?.date ?? null)).toEqual([
      '2026-11-02',
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
    expect(calendarWeeks([])).toEqual([]);
  });
});
