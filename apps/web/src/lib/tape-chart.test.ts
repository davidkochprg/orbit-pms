import { describe, expect, it } from 'vitest';
import {
  addDaysIso,
  barGeometry,
  buildWindow,
  dayWidthFor,
  isIsoDate,
  moveTarget,
  nightsFromDelta,
  placeBooking,
  resizeTarget,
  TAPE_MIN_DAY_WIDTH,
  TAPE_ROOM_COLUMN,
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
  it('runs a stay from midday of arrival to midday of departure', () => {
    expect(placeBooking({ checkIn: '2026-10-29', checkOut: '2026-11-01' }, start)).toEqual({
      start: 2.5,
      end: 5.5,
      continuesBefore: false,
      continuesAfter: false,
    });
  });

  it('clips stays that start before or end after the window', () => {
    expect(placeBooking({ checkIn: '2026-10-20', checkOut: '2026-10-29' }, start)).toEqual({
      start: 0,
      end: 2.5,
      continuesBefore: true,
      continuesAfter: false,
    });
    expect(placeBooking({ checkIn: '2026-11-08', checkOut: '2026-11-20' }, start)).toEqual({
      start: 12.5,
      end: 14,
      continuesBefore: false,
      continuesAfter: true,
    });
  });

  it('shares the turnover day: one stay ends where the next begins', () => {
    const leaving = placeBooking({ checkIn: '2026-10-28', checkOut: '2026-10-30' }, start);
    const arriving = placeBooking({ checkIn: '2026-10-30', checkOut: '2026-11-02' }, start);
    expect(leaving?.end).toBe(3.5);
    expect(arriving?.start).toBe(3.5);
  });

  it("shows the morning of a stay leaving on the window's first day", () => {
    expect(placeBooking({ checkIn: '2026-10-25', checkOut: '2026-10-27' }, start)).toEqual({
      start: 0,
      end: 0.5,
      continuesBefore: true,
      continuesAfter: false,
    });
    // Left the day before the window: nothing to show.
    expect(placeBooking({ checkIn: '2026-10-24', checkOut: '2026-10-26' }, start)).toBeNull();
  });

  it("shows the afternoon of a stay arriving on the window's last day", () => {
    // The window is 2026-10-27 to 2026-11-09; this arrives on its last day.
    expect(placeBooking({ checkIn: '2026-11-09', checkOut: '2026-11-10' }, start)).toEqual({
      start: 13.5,
      end: 14,
      continuesBefore: false,
      continuesAfter: true,
    });
    expect(placeBooking({ checkIn: '2026-11-10', checkOut: '2026-11-12' }, start)).toBeNull();
  });
});

describe('barGeometry', () => {
  it('insets both ends from the midday lines', () => {
    const place = placeBooking({ checkIn: '2026-10-29', checkOut: '2026-11-01' }, start)!;
    expect(barGeometry(place, 80)).toEqual({ left: 202, width: 236 });
  });

  it('runs flush to the window edge where a stay is clipped', () => {
    const place = placeBooking({ checkIn: '2026-10-20', checkOut: '2026-10-29' }, start)!;
    expect(barGeometry(place, 80)).toEqual({ left: 0, width: 198 });
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

describe('dayWidthFor', () => {
  it('fills the width after the room column', () => {
    expect(dayWidthFor(TAPE_ROOM_COLUMN + 14 * 100)).toBe(100);
    expect(dayWidthFor(TAPE_ROOM_COLUMN + 14 * 100 + 13)).toBe(100);
  });

  it('never goes below the minimum, even before the container is measured', () => {
    expect(dayWidthFor(0)).toBe(TAPE_MIN_DAY_WIDTH);
    expect(dayWidthFor(500)).toBe(TAPE_MIN_DAY_WIDTH);
  });
});
