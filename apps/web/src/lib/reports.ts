import type { ReportQuery } from '@orbit/shared';
import { addDays, addMonths, format, parseISO, startOfMonth } from 'date-fns';

export type ReportPeriod = 'last7' | 'last30' | 'month' | 'lastMonth' | 'next30';

export const reportPeriods: { value: ReportPeriod; label: string }[] = [
  { value: 'last7', label: 'Last 7 days' },
  { value: 'last30', label: 'Last 30 days' },
  { value: 'month', label: 'This month' },
  { value: 'lastMonth', label: 'Last month' },
  { value: 'next30', label: 'Next 30 days' },
];

export function isReportPeriod(value: string | null): value is ReportPeriod {
  return reportPeriods.some((p) => p.value === value);
}

const iso = (d: Date) => format(d, 'yyyy-MM-dd');

/** The nights a preset covers, relative to the hotel's today. "Next 30 days" is what is on the books. */
export function periodRange(period: ReportPeriod, today: string): ReportQuery {
  const day = parseISO(today);
  const month = startOfMonth(day);
  switch (period) {
    case 'last7':
      return { from: iso(addDays(day, -7)), to: today };
    case 'last30':
      return { from: iso(addDays(day, -30)), to: today };
    case 'month':
      return { from: iso(month), to: iso(addMonths(month, 1)) };
    case 'lastMonth':
      return { from: iso(addMonths(month, -1)), to: iso(month) };
    case 'next30':
      return { from: today, to: iso(addDays(day, 30)) };
  }
}

/** The same number of nights right before, to compare against. */
export function comparisonRange({ from, to }: ReportQuery): ReportQuery {
  const nights = Math.round((parseISO(to).getTime() - parseISO(from).getTime()) / 86_400_000);
  return { from: iso(addDays(parseISO(from), -nights)), to: from };
}

/** Whole percent of a 0–1 fraction. */
export function percent(fraction: number): number {
  return Math.round(fraction * 100);
}

export interface Change {
  /** Shown as "+12%" or "+3 pts". */
  label: string;
  direction: 'up' | 'down' | 'flat';
}

/** Relative change of an amount; null when there is nothing to compare with. */
export function relativeChange(current: number, previous: number): Change | null {
  if (previous === 0) return null;
  const pct = Math.round(((current - previous) / Math.abs(previous)) * 100);
  return { label: `${pct > 0 ? '+' : ''}${pct}%`, direction: direction(pct) };
}

/** Change of a fraction in percentage points, e.g. occupancy 0.52 → 0.61 is "+9 pts". */
export function pointChange(current: number, previous: number): Change {
  const pts = percent(current) - percent(previous);
  return { label: `${pts > 0 ? '+' : ''}${pts} pts`, direction: direction(pts) };
}

function direction(n: number): Change['direction'] {
  return n > 0 ? 'up' : n < 0 ? 'down' : 'flat';
}
