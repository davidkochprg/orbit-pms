import { describe, expect, it } from 'vitest';
import {
  addDaysIso,
  buildWindow,
  isIsoDate,
  moveTarget,
  nightsFromDelta,
  placeBooking,
  resizeTarget,
} from './tape-chart';

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

describe('drag targets', () => {
  const b = { roomId: 'rm_101', checkIn: '2026-10-29', checkOut: '2026-11-01' };

  it('snaps a drag to whole days', () => {
    expect(nightsFromDelta(100, 72)).toBe(1);
    expect(nightsFromDelta(30, 72)).toBe(0);
    expect(nightsFromDelta(-110, 72)).toBe(-2);
  });

  it('moves a bar to another room and shifts its dates', () => {
    expect(moveTarget(b, 144, 72, 'rm_201')).toEqual({
      roomId: 'rm_201',
      checkIn: '2026-10-31',
      checkOut: '2026-11-03',
    });
    expect(moveTarget(b, 0, 72, 'rm_201')).toEqual({
      roomId: 'rm_201',
      checkIn: b.checkIn,
      checkOut: b.checkOut,
    });
  });

  it('treats a drop in place, or off the grid without moving, as no change', () => {
    expect(moveTarget(b, 20, 72, 'rm_101')).toBeNull();
    expect(moveTarget(b, 10, 72, null)).toBeNull();
  });

  it('extends and shortens by the right edge, never below one night', () => {
    expect(resizeTarget(b, 72, 72)).toBe('2026-11-02');
    expect(resizeTarget(b, -72, 72)).toBe('2026-10-31');
    expect(resizeTarget(b, -1000, 72)).toBe('2026-10-30');
    expect(resizeTarget(b, 10, 72)).toBeNull();
  });
});
