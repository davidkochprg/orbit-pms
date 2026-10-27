import type { Booking, IsoDate } from '@orbit/shared';

/** Guests due to arrive on `date`, including those already checked in that day. */
export function arrivalsOn(bookings: Booking[], date: IsoDate): Booking[] {
  return bookings.filter(
    (b) => b.checkIn === date && ['hold', 'confirmed', 'checked_in'].includes(b.status),
  );
}

/** Guests due to leave on `date`, including those already checked out that day. */
export function departuresOn(bookings: Booking[], date: IsoDate): Booking[] {
  return bookings.filter(
    (b) => b.checkOut === date && ['checked_in', 'checked_out'].includes(b.status),
  );
}

/** Guests who arrived before `date` and stay past it. */
export function stayingOver(bookings: Booking[], date: IsoDate): Booking[] {
  return bookings.filter(
    (b) => b.checkIn < date && date < b.checkOut && ['confirmed', 'checked_in'].includes(b.status),
  );
}
