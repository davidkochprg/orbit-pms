import { describe, expect, it } from 'vitest';
import { blocksRoom, checkAvailability, findConflicts, fitsRoomType } from './availability';
import { DomainError } from './errors';
import { apartment, booking, double, room } from './test-fixtures';

const now = new Date('2026-05-01T10:00:00Z');
const rooms = [room('1'), room('2'), room('A1', { kind: 'apartment', roomTypeId: apartment.id })];
const roomTypes = [double, apartment];
const stay = { checkIn: '2026-05-10', checkOut: '2026-05-13', adults: 2, childAges: [] };

function available(
  query: Parameters<typeof checkAvailability>[0],
  bookings = [booking({ roomId: '1' })],
) {
  return checkAvailability(query, { rooms, roomTypes, bookings, now }).map((r) => r.room.id);
}

describe('checkAvailability', () => {
  it('excludes rooms with an overlapping booking', () => {
    expect(available(stay)).toEqual(['2', 'A1']);
  });

  it('allows check-in on the day another guest checks out', () => {
    expect(available({ ...stay, checkIn: '2026-05-13', checkOut: '2026-05-15' })).toEqual([
      '1',
      '2',
      'A1',
    ]);
  });

  it('ignores cancelled bookings and expired holds', () => {
    const bookings = [
      booking({ roomId: '1', status: 'cancelled' }),
      booking({ roomId: '2', status: 'hold', holdExpiresAt: '2026-04-30T10:00:00Z' }),
    ];
    expect(available(stay, bookings)).toEqual(['1', '2', 'A1']);
  });

  it('respects active holds', () => {
    const bookings = [
      booking({ roomId: '2', status: 'hold', holdExpiresAt: '2026-05-02T10:00:00Z' }),
    ];
    expect(available(stay, bookings)).toEqual(['1', 'A1']);
  });

  it('can exclude the booking being moved', () => {
    const existing = booking({ roomId: '1' });
    expect(available({ ...stay, excludeBookingId: existing.id }, [existing])).toContain('1');
  });

  it('filters by capacity', () => {
    expect(available({ ...stay, adults: 3 })).toEqual(['A1']);
    expect(available({ ...stay, childAges: [4] })).toEqual(['2', 'A1']);
    expect(available({ ...stay, childAges: [4, 8] })).toEqual(['A1']);
  });

  it('filters by kind and room type', () => {
    expect(available({ ...stay, kind: 'apartment' })).toEqual(['A1']);
    expect(available({ ...stay, roomTypeId: double.id })).toEqual(['2']);
  });

  it('skips rooms that are out of order', () => {
    const ctx = {
      rooms: [room('1', { status: 'out_of_order' }), room('2')],
      roomTypes,
      bookings: [],
      now,
    };
    expect(checkAvailability(stay, ctx).map((r) => r.room.id)).toEqual(['2']);
  });

  it('sorts cheapest room type first', () => {
    expect(available(stay, [])).toEqual(['1', '2', 'A1']);
  });

  it('rejects invalid ranges and parties', () => {
    expect(() => available({ ...stay, checkOut: stay.checkIn })).toThrow(DomainError);
    expect(() => available({ ...stay, adults: 0 })).toThrow(DomainError);
    expect(() => available({ ...stay, childAges: [18] })).toThrow(DomainError);
    expect(() => available({ ...stay, childAges: [-1] })).toThrow(DomainError);
  });
});

describe('blocksRoom', () => {
  it('treats a hold without expiry as blocking', () => {
    expect(blocksRoom(booking({ roomId: '1', status: 'hold' }), now)).toBe(true);
  });

  it('does not block after check-out', () => {
    expect(blocksRoom(booking({ roomId: '1', status: 'checked_out' }), now)).toBe(false);
  });
});

describe('fitsRoomType', () => {
  it('lets children use free adult beds', () => {
    expect(fitsRoomType(double, { adults: 1, childAges: [3, 5] })).toBe(true);
  });

  it('counts extra beds toward capacity', () => {
    expect(fitsRoomType(double, { adults: 3, childAges: [] })).toBe(false);
    expect(fitsRoomType(double, { adults: 3, childAges: [] }, 1)).toBe(true);
  });
});

describe('findConflicts', () => {
  it('returns the overlapping bookings for a room', () => {
    const a = booking({ roomId: '1' });
    const b = booking({ roomId: '1', checkIn: '2026-05-13', checkOut: '2026-05-14' });
    expect(
      findConflicts('1', { checkIn: '2026-05-12', checkOut: '2026-05-14' }, [a, b], now),
    ).toEqual([a, b]);
  });
});
