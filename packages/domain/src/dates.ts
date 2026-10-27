import type { IsoDate } from '@orbit/shared';
import { addDays as addDaysFns, differenceInCalendarDays, format, parseISO } from 'date-fns';
import { DomainError } from './errors';

export const HOTEL_TIMEZONE = 'Europe/Prague';

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
export function hotelToday(now: Date): IsoDate {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: HOTEL_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
