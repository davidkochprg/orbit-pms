import { describe, expect, it } from 'vitest';
import { arrivalsOn, departuresOn, stayingOver } from './day';
import { booking } from './test-fixtures';

const date = '2026-05-10';
const ids = (list: { id: string }[]) => list.map((b) => b.id);

describe('day views', () => {
  const bookings = [
    booking({ id: 'arrive', roomId: '1', checkIn: date, checkOut: '2026-05-12' }),
    booking({
      id: 'arrived',
      roomId: '2',
      checkIn: date,
      checkOut: '2026-05-12',
      status: 'checked_in',
    }),
    booking({ id: 'hold', roomId: '3', checkIn: date, checkOut: '2026-05-11', status: 'hold' }),
    booking({
      id: 'cancelled',
      roomId: '4',
      checkIn: date,
      checkOut: '2026-05-11',
      status: 'cancelled',
    }),
    booking({
      id: 'leave',
      roomId: '5',
      checkIn: '2026-05-08',
      checkOut: date,
      status: 'checked_in',
    }),
    booking({
      id: 'left',
      roomId: '6',
      checkIn: '2026-05-08',
      checkOut: date,
      status: 'checked_out',
    }),
    booking({
      id: 'stay',
      roomId: '7',
      checkIn: '2026-05-08',
      checkOut: '2026-05-12',
      status: 'checked_in',
    }),
  ];

  it('lists arrivals, including holds and early check-ins, but not cancellations', () => {
    expect(ids(arrivalsOn(bookings, date))).toEqual(['arrive', 'arrived', 'hold']);
  });

  it('lists departures, whether or not they have checked out yet', () => {
    expect(ids(departuresOn(bookings, date))).toEqual(['leave', 'left']);
  });

  it('lists guests staying through the day, excluding arrivals and departures', () => {
    expect(ids(stayingOver(bookings, date))).toEqual(['stay']);
  });
});
