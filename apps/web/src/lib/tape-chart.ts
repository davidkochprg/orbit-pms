import type { Booking, IsoDate } from '@orbit/shared';
import { addDays, differenceInCalendarDays, format, getDay, parseISO } from 'date-fns';

/** Days shown at once on the tape chart. */
export const TAPE_DAYS = 14;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string | null): value is IsoDate {
  return value !== null && ISO_DATE.test(value);
}

/** The current calendar date at the hotel (`Europe/Prague`), as `YYYY-MM-DD`. */
export function hotelToday(now = new Date()): IsoDate {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Prague',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function addDaysIso(date: IsoDate, days: number): IsoDate {
  return format(addDays(parseISO(date), days), 'yyyy-MM-dd');
}

/** The `count` dates of a window starting at `start`. */
export function buildWindow(start: IsoDate, count = TAPE_DAYS): IsoDate[] {
  return Array.from({ length: count }, (_, i) => addDaysIso(start, i));
}

export function isWeekend(date: IsoDate): boolean {
  const day = getDay(parseISO(date));
  return day === 0 || day === 6;
}

export interface BarPlacement {
  /** First visible night, as a column offset from the window start. */
  startIndex: number;
  /** Visible nights. */
  span: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
}

/**
 * Places a stay on the window. Stays are half-open `[checkIn, checkOut)`, so a booking
 * leaving on the window's first day (or arriving on its last night + 1) is not visible.
 * Returns `null` when no night of the stay falls in the window.
 */
export function placeBooking(
  booking: Pick<Booking, 'checkIn' | 'checkOut'>,
  windowStart: IsoDate,
  windowDays = TAPE_DAYS,
): BarPlacement | null {
  const startOffset = differenceInCalendarDays(parseISO(booking.checkIn), parseISO(windowStart));
  const endOffset = differenceInCalendarDays(parseISO(booking.checkOut), parseISO(windowStart));
  const startIndex = Math.max(0, startOffset);
  const endIndex = Math.min(windowDays, endOffset);
  if (endIndex <= startIndex) return null;
  return {
    startIndex,
    span: endIndex - startIndex,
    continuesBefore: startOffset < 0,
    continuesAfter: endOffset > windowDays,
  };
}
