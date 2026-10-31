import type { EventImpact, NightOutlook, RateFactor, WeatherKind } from '@orbit/shared';
import {
  eachDayOfInterval,
  endOfISOWeek,
  endOfMonth,
  format,
  parseISO,
  startOfISOWeek,
} from 'date-fns';

/** "+15%", "-10%", or "Season rate" for no change. */
export function ratePercent(percent: number): string {
  return percent === 0 ? 'Season rate' : `${percent > 0 ? '+' : ''}${percent}%`;
}

/** "+15%" or "-10%"; "0%" for none. */
export function signed(percent: number): string {
  return `${percent > 0 ? '+' : ''}${percent}%`;
}

/** Rooms sold as a share of rooms that can be sold, 0 to 1. */
export function occupancy(night: Pick<NightOutlook, 'roomsSold' | 'roomsTotal'>): number {
  return night.roomsTotal ? night.roomsSold / night.roomsTotal : 0;
}

/** Nights whose suggested rate differs from the current one. */
export function suggestions(nights: NightOutlook[]): NightOutlook[] {
  return nights.filter((n) => n.suggestedPercent !== n.currentPercent);
}

/** A day on the calendar: a night of the outlook, or a date before or after it. */
export interface CalendarDay {
  date: string;
  /** Null for days before today or past the outlook. */
  night: NightOutlook | null;
  /** False for the days of the month before or after, filling its first and last week. */
  inMonth: boolean;
}

/** One page of the calendar: a month's weeks from Monday, as far as the outlook reaches. */
export interface CalendarMonth {
  /** `YYYY-MM`. */
  month: string;
  weeks: CalendarDay[][];
}

const isoDate = (d: Date) => format(d, 'yyyy-MM-dd');

/** Whether every night of `page`'s month also shows on `other`. */
function showsWhole(other: CalendarMonth | undefined, page: CalendarMonth): boolean {
  if (!other) return false;
  const days = new Set(other.weeks.flat().map((d) => d.date));
  return page.weeks.flat().every((d) => !d.inMonth || !d.night || days.has(d.date));
}

/**
 * The nights as month pages. A month's first and last week are filled with the days around it,
 * so nights at the turn of a month show on both pages; a month whose few nights all show on its
 * neighbour's page gets none of its own (today the 31st opens on next month).
 */
export function calendarMonths(nights: NightOutlook[]): CalendarMonth[] {
  if (nights.length === 0) return [];
  const byDate = new Map(nights.map((n) => [n.date, n]));
  const first = nights[0]!.date;
  const last = nights.at(-1)!.date;
  const pages = [...new Set(nights.map((n) => n.date.slice(0, 7)))].map((month) => {
    const monthStart = `${month}-01`;
    const monthEnd = isoDate(endOfMonth(parseISO(monthStart)));
    const days = eachDayOfInterval({
      start: startOfISOWeek(parseISO(monthStart > first ? monthStart : first)),
      end: endOfISOWeek(parseISO(monthEnd < last ? monthEnd : last)),
    }).map((d): CalendarDay => {
      const date = isoDate(d);
      return { date, night: byDate.get(date) ?? null, inMonth: date.startsWith(month) };
    });
    return {
      month,
      weeks: Array.from({ length: days.length / 7 }, (_, i) => days.slice(i * 7, i * 7 + 7)),
    };
  });
  const kept = pages.filter((page, i) => !showsWhole(pages[i + 1], page));
  if (kept.length > 1 && showsWhole(kept.at(-2), kept.at(-1)!)) kept.pop();
  return kept;
}

/** The page a date belongs on: its own month's, else the first page that shows it. */
export function monthPageOf(pages: CalendarMonth[], date: string): number {
  const own = pages.findIndex((p) => p.month === date.slice(0, 7));
  if (own !== -1) return own;
  return Math.max(
    0,
    pages.findIndex((p) => p.weeks.some((w) => w.some((d) => d.date === date))),
  );
}

export const weatherLabels: Record<WeatherKind, string> = {
  clear: 'Clear',
  cloudy: 'Cloudy',
  fog: 'Fog',
  rain: 'Rain',
  snow: 'Snow',
  storm: 'Storm',
};

export const impactLabels: Record<EventImpact, string> = {
  low: 'Small',
  medium: 'Medium',
  high: 'Big',
};

export const factorKindLabels: Record<RateFactor['kind'], string> = {
  demand: 'Demand',
  event: 'Event',
  weather: 'Weather',
};
