import type { Booking, IsoDate } from '@orbit/shared';
import { addDays, differenceInCalendarDays, format, getDay, parseISO } from 'date-fns';

/** How many days the tape chart can show at once: a week, two weeks or a month. */
export const TAPE_SPANS = [7, 14, 30] as const;
export type TapeSpan = (typeof TAPE_SPANS)[number];

/** Days shown at once on the tape chart until someone picks another span. */
export const TAPE_DAYS: TapeSpan = 14;

export function isTapeSpan(value: number): value is TapeSpan {
  return (TAPE_SPANS as readonly number[]).includes(value);
}

/**
 * Tape chart geometry in px at the default type size. Drag math depends on these, so they live
 * in code, not CSS; `tapeGeometry` scales them with the root font size.
 */
export const TAPE_ROOM_COLUMN = 156;
export const TAPE_ROW_HEIGHT = 44;
export const TAPE_MIN_DAY_WIDTH = 72;
/** A month's days may be narrower: they show a weekday letter and bars without icons. */
export const TAPE_MIN_DAY_WIDTH_MONTH = 40;

/** Day column width that fills the available width, but never narrower than the minimum. */
export function dayWidthFor(
  containerWidth: number,
  days: number = TAPE_DAYS,
  roomColumn = TAPE_ROOM_COLUMN,
  scale = 1,
): number {
  const min = (days > 14 ? TAPE_MIN_DAY_WIDTH_MONTH : TAPE_MIN_DAY_WIDTH) * scale;
  return Math.max(Math.round(min), Math.floor((containerWidth - roomColumn) / days));
}

export interface TapeGeometry {
  roomColumn: number;
  rowHeight: number;
  dayWidth: number;
  /**
   * Days narrower than the usual minimum (a month on most screens) are too narrow for the full
   * header, so it shows a weekday letter and the date, with occupancy on hover.
   */
  compactDays: boolean;
}

/** The chart's sizes in px for a container width, a span and the root font scale (1 = 16px). */
export function tapeGeometry(containerWidth: number, days: number, scale = 1): TapeGeometry {
  const roomColumn = Math.round(TAPE_ROOM_COLUMN * scale);
  const dayWidth = dayWidthFor(containerWidth, days, roomColumn, scale);
  return {
    roomColumn,
    rowHeight: Math.round(TAPE_ROW_HEIGHT * scale),
    dayWidth,
    compactDays: dayWidth < Math.round(TAPE_MIN_DAY_WIDTH * scale),
  };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string | null): value is IsoDate {
  return value !== null && ISO_DATE.test(value);
}

export function addDaysIso(date: IsoDate, days: number): IsoDate {
  return format(addDays(parseISO(date), days), 'yyyy-MM-dd');
}

/**
 * The tape chart opened on a booking: the window starts the day before arrival, and the chart
 * scrolls to the bar and highlights it. `focus`, not `booking`, which would open the inspector.
 */
export function tapeChartHref(booking: Pick<Booking, 'id' | 'checkIn'>): string {
  const params = new URLSearchParams({ from: addDaysIso(booking.checkIn, -1), focus: booking.id });
  return `/tape-chart?${params}`;
}

/** The `count` dates of a window starting at `start`. */
export function buildWindow(start: IsoDate, count: number = TAPE_DAYS): IsoDate[] {
  return Array.from({ length: count }, (_, i) => addDaysIso(start, i));
}

export function isWeekend(date: IsoDate): boolean {
  const day = getDay(parseISO(date));
  return day === 0 || day === 6;
}

export interface BarPlacement {
  /** Left edge in days from the window start: the middle of the arrival day, or 0 when clipped. */
  start: number;
  /** Right edge in days: the middle of the departure day, or the window's end when clipped. */
  end: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
}

/**
 * Places a stay on the window, from midday of the arrival day to midday of the departure day,
 * the way guests use a room: in the afternoon, out by the morning. A departure and an arrival
 * on the same day share that day's cell, each taking half of it. A stay leaving on the window's
 * first day still shows its morning there. Returns `null` when no part of it falls in the window.
 */
export function placeBooking(
  booking: Pick<Booking, 'checkIn' | 'checkOut'>,
  windowStart: IsoDate,
  windowDays: number = TAPE_DAYS,
): BarPlacement | null {
  const arrives = differenceInCalendarDays(parseISO(booking.checkIn), parseISO(windowStart)) + 0.5;
  const leaves = differenceInCalendarDays(parseISO(booking.checkOut), parseISO(windowStart)) + 0.5;
  const start = Math.max(0, arrives);
  const end = Math.min(windowDays, leaves);
  if (end <= start) return null;
  return { start, end, continuesBefore: arrives < 0, continuesAfter: leaves > windowDays };
}

/** Space between a bar and the midday line, so a turnover's two bars don't touch. */
export const TAPE_BAR_INSET = 2;

/** A placed bar in px: inset from the midday lines, flush with the window edge where clipped. */
export function barGeometry(
  place: BarPlacement,
  dayWidth: number,
): { left: number; width: number } {
  const left = place.start * dayWidth + (place.continuesBefore ? 0 : TAPE_BAR_INSET);
  const right = place.end * dayWidth - (place.continuesAfter ? 0 : TAPE_BAR_INSET);
  return { left, width: right - left };
}

/** Whole nights a horizontal drag covers, snapped to the nearest day column. */
export function nightsFromDelta(deltaX: number, dayWidth: number): number {
  return Math.round(deltaX / dayWidth) || 0;
}

export interface DropTarget {
  roomId: string;
  checkIn: IsoDate;
  checkOut: IsoDate;
}

/** Where a dragged bar lands: the room under the pointer, shifted by whole days. Null if unchanged. */
export function moveTarget(
  booking: Pick<Booking, 'roomId' | 'checkIn' | 'checkOut'>,
  deltaX: number,
  dayWidth: number,
  overRoomId: string | null,
): DropTarget | null {
  const shift = nightsFromDelta(deltaX, dayWidth);
  const roomId = overRoomId ?? booking.roomId;
  if (shift === 0 && roomId === booking.roomId) return null;
  return {
    roomId,
    checkIn: addDaysIso(booking.checkIn, shift),
    checkOut: addDaysIso(booking.checkOut, shift),
  };
}

/** New check-out after dragging a bar's right edge, keeping at least one night. Null if unchanged. */
export function resizeTarget(
  booking: Pick<Booking, 'checkIn' | 'checkOut'>,
  deltaX: number,
  dayWidth: number,
): IsoDate | null {
  const nights = differenceInCalendarDays(parseISO(booking.checkOut), parseISO(booking.checkIn));
  const change = Math.max(nightsFromDelta(deltaX, dayWidth), 1 - nights);
  return change === 0 ? null : addDaysIso(booking.checkOut, change);
}
