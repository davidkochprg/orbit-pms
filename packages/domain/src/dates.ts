import type { IsoDate } from '@orbit/shared';
import { addDays as addDaysFns, differenceInCalendarDays, format, parseISO } from 'date-fns';
import { DomainError } from './errors';

/** The demo inn's time zone; a deployment sets its own with `setHotelTimeZone`. */
export const DEFAULT_HOTEL_TIMEZONE = 'America/Los_Angeles';

let hotelTimeZone = DEFAULT_HOTEL_TIMEZONE;

/**
 * Sets the hotel's IANA time zone, which decides what "today" is everywhere. A hotel doesn't
 * move, so it is configured once at startup (`HOTEL_TIMEZONE`), not per request.
 */
export function setHotelTimeZone(timeZone: string): void {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone });
  } catch {
    throw new DomainError('invalid_input', `Unknown time zone ${timeZone}`);
  }
  hotelTimeZone = timeZone;
}

export function getHotelTimeZone(): string {
  return hotelTimeZone;
}

/** A stay as a half-open range of nights: `[checkIn, checkOut)`. */
export interface DateRange {
  checkIn: IsoDate;
  checkOut: IsoDate;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function parse(date: IsoDate): Date {
  if (!ISO_DATE.test(date)) {
    throw new DomainError('invalid_date_range', `Not a YYYY-MM-DD date: ${date}`);
  }
  return parseISO(date);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return format(addDaysFns(parse(date), days), 'yyyy-MM-dd');
}

export function nightsBetween(checkIn: IsoDate, checkOut: IsoDate): number {
  return differenceInCalendarDays(parse(checkOut), parse(checkIn));
}

/** Throws unless the range covers at least one night. */
export function assertValidRange(range: DateRange): void {
  if (nightsBetween(range.checkIn, range.checkOut) < 1) {
    throw new DomainError(
      'invalid_date_range',
      `Check-out (${range.checkOut}) must be after check-in (${range.checkIn})`,
    );
  }
}

/** Each night of the stay, identified by the date it starts on. */
export function eachNight(range: DateRange): IsoDate[] {
  const count = nightsBetween(range.checkIn, range.checkOut);
  return Array.from({ length: Math.max(count, 0) }, (_, i) => addDays(range.checkIn, i));
}

/** Half-open overlap: a stay ending on the day another starts does not overlap it. */
export function rangesOverlap(a: DateRange, b: DateRange): boolean {
  return a.checkIn < b.checkOut && b.checkIn < a.checkOut;
}

/** The current calendar date at the hotel. */
export function hotelToday(now: Date, timeZone: string = hotelTimeZone): IsoDate {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
