import { describe, expect, it } from 'vitest';
import {
  addDays,
  assertValidRange,
  eachNight,
  hotelToday,
  nightsBetween,
  rangesOverlap,
} from './dates';
import { DomainError } from './errors';

describe('nightsBetween', () => {
  it('counts nights across a month boundary', () => {
    expect(nightsBetween('2026-01-30', '2026-02-02')).toBe(3);
  });

  it('is unaffected by the DST change in Prague', () => {
    expect(nightsBetween('2026-03-28', '2026-03-30')).toBe(2);
    expect(nightsBetween('2026-10-24', '2026-10-26')).toBe(2);
  });
});

describe('addDays', () => {
  it('handles leap years', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
  });
});

describe('eachNight', () => {
  it('lists nights, excluding the check-out date', () => {
    expect(eachNight({ checkIn: '2026-12-30', checkOut: '2027-01-02' })).toEqual([
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
    ]);
  });
});

describe('assertValidRange', () => {
  it('rejects zero-night and reversed ranges', () => {
    expect(() => assertValidRange({ checkIn: '2026-05-01', checkOut: '2026-05-01' })).toThrow(
      DomainError,
    );
    expect(() => assertValidRange({ checkIn: '2026-05-02', checkOut: '2026-05-01' })).toThrow(
      DomainError,
    );
  });

  it('rejects malformed dates', () => {
    expect(() => assertValidRange({ checkIn: '1.5.2026', checkOut: '2026-05-03' })).toThrow(
      DomainError,
    );
  });
});

describe('rangesOverlap', () => {
  const stay = { checkIn: '2026-05-10', checkOut: '2026-05-13' };

  it('detects partial and full overlaps', () => {
    expect(rangesOverlap(stay, { checkIn: '2026-05-12', checkOut: '2026-05-15' })).toBe(true);
    expect(rangesOverlap(stay, { checkIn: '2026-05-08', checkOut: '2026-05-11' })).toBe(true);
    expect(rangesOverlap(stay, { checkIn: '2026-05-11', checkOut: '2026-05-12' })).toBe(true);
    expect(rangesOverlap(stay, { checkIn: '2026-05-01', checkOut: '2026-05-30' })).toBe(true);
  });

  it('allows same-day turnover', () => {
    expect(rangesOverlap(stay, { checkIn: '2026-05-13', checkOut: '2026-05-15' })).toBe(false);
    expect(rangesOverlap(stay, { checkIn: '2026-05-08', checkOut: '2026-05-10' })).toBe(false);
  });
});

describe('hotelToday', () => {
  it('uses Prague time, not UTC', () => {
    // 23:30 UTC on Jun 30 is already Jul 1 in Prague (UTC+2).
    expect(hotelToday(new Date('2026-06-30T23:30:00Z'))).toBe('2026-07-01');
    expect(hotelToday(new Date('2026-06-30T21:30:00Z'))).toBe('2026-06-30');
  });
});
