import { describe, expect, it } from 'vitest';
import { addDaysIso, buildWindow, isIsoDate, placeBooking } from './tape-chart';

const start = '2026-10-27'; // Tuesday

describe('tape-chart window', () => {
  it('builds consecutive dates across a month boundary', () => {
    expect(buildWindow('2026-10-30', 4)).toEqual([
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
    ]);
    expect(addDaysIso(start, -14)).toBe('2026-10-13');
  });

  it('accepts only YYYY-MM-DD window starts', () => {
    expect(isIsoDate('2026-10-27')).toBe(true);
    expect(isIsoDate('27.10.2026')).toBe(false);
    expect(isIsoDate(null)).toBe(false);
  });
});

describe('placeBooking', () => {
  it('places a stay fully inside the window', () => {
    expect(placeBooking({ checkIn: '2026-10-29', checkOut: '2026-11-01' }, start)).toEqual({
      startIndex: 2,
      span: 3,
      continuesBefore: false,
      continuesAfter: false,
    });
  });

  it('clips stays that start before or end after the window', () => {
    expect(placeBooking({ checkIn: '2026-10-20', checkOut: '2026-10-29' }, start)).toEqual({
      startIndex: 0,
      span: 2,
      continuesBefore: true,
      continuesAfter: false,
    });
    expect(placeBooking({ checkIn: '2026-11-08', checkOut: '2026-11-20' }, start)).toEqual({
      startIndex: 12,
      span: 2,
      continuesBefore: false,
      continuesAfter: true,
    });
  });

  it('treats stays as half-open: same-day turnover does not spill over', () => {
    // Leaves on the first window day: no visible night.
    expect(placeBooking({ checkIn: '2026-10-25', checkOut: '2026-10-27' }, start)).toBeNull();
    // Arrives the day after the last visible night (window ends 2026-11-10 exclusive).
    expect(placeBooking({ checkIn: '2026-11-10', checkOut: '2026-11-12' }, start)).toBeNull();
    // One-night stay on the last visible day.
    expect(placeBooking({ checkIn: '2026-11-09', checkOut: '2026-11-10' }, start)).toEqual({
      startIndex: 13,
      span: 1,
      continuesBefore: false,
      continuesAfter: false,
    });
  });
});
