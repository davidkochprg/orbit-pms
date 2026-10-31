import type { NightOutlook, WeatherKind } from '@orbit/shared';
import { addDays, format, parseISO } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { calendarMonths, monthPageOf, occupancy, signed, weatherLabels } from '@/lib/revenue';
import { weatherIcons } from '@/lib/weather-icons';
import { cn } from '@/lib/utils';

const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
/** Forecasts worth an icon on the grid; clear and cloudy days go without. */
const notableWeather: ReadonlySet<WeatherKind> = new Set(['fog', 'rain', 'snow', 'storm']);
/** Arrow keys and the days they move by. */
const steps: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };

/**
 * The coming nights a month at a time, in weeks from Monday: how full each is, its rate change,
 * and the suggested one where it differs. Events mark the top of a night; rain, snow, fog and
 * storms show as an icon. Days before today and past the outlook are greyed out. Arrow keys move
 * between nights and turn the page at a month's edge.
 */
export function RateCalendar({
  nights,
  selected,
  onSelect,
}: {
  nights: NightOutlook[];
  selected: string | null;
  /** `via` says whether the night was clicked or reached with the arrow keys. */
  onSelect: (date: string, via: 'click' | 'key') => void;
}) {
  const pages = calendarMonths(nights);
  const [page, setPage] = useState(() => (selected ? monthPageOf(pages, selected) : 0));
  const grid = useRef<HTMLDivElement>(null);
  const focusAfterRender = useRef<string | null>(null);
  const current = pages[Math.min(page, pages.length - 1)];

  useEffect(() => {
    const date = focusAfterRender.current;
    if (!date) return;
    focusAfterRender.current = null;
    grid.current?.querySelector<HTMLElement>(`[data-date="${date}"]`)?.focus();
  });

  if (!current) return null;
  const days = current.weeks.flat();
  const onPage = (date: string | null) => days.some((d) => d.night && d.date === date);
  // One night in the grid takes Tab; the arrow keys move from there.
  const tabStop = onPage(selected) ? selected : days.find((d) => d.night)?.date;

  function move(e: KeyboardEvent, from: string) {
    const step = steps[e.key];
    if (step === undefined) return;
    e.preventDefault();
    const to = format(addDays(parseISO(from), step), 'yyyy-MM-dd');
    if (!nights.some((n) => n.date === to)) return;
    if (!onPage(to)) setPage(monthPageOf(pages, to));
    focusAfterRender.current = to;
    onSelect(to, 'key');
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 px-2 pt-1">
        <h3 className="text-[0.9375rem] font-medium" aria-live="polite">
          {format(parseISO(`${current.month}-01`), 'MMMM yyyy')}
        </h3>
        {pages.length > 1 && (
          <div className="ml-auto flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Previous month"
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Next month"
              disabled={page >= pages.length - 1}
              onClick={() => setPage(page + 1)}
            >
              <ChevronRight />
            </Button>
          </div>
        )}
      </div>
      {/* Phones get a narrower week, with the badge under the bar, rather than a sideways scroll
          that hides the weekend. */}
      <div className="scrollbar-thin overflow-x-auto">
        <div ref={grid} className="grid grid-cols-7 gap-1 sm:min-w-[36rem]">
          {weekdays.map((d) => (
            <div
              key={d}
              className="px-1 pt-1 pb-0.5 text-[0.6875rem] text-subtle-foreground sm:px-2"
            >
              {d}
            </div>
          ))}
          {days.map((day) =>
            day.night ? (
              <NightCell
                key={day.date}
                night={day.night}
                outside={!day.inMonth}
                selected={day.date === selected}
                tabbable={day.date === tabStop}
                onSelect={() => onSelect(day.date, 'click')}
                onKeyDown={(e) => move(e, day.date)}
              />
            ) : (
              <span
                key={day.date}
                aria-hidden
                className="px-1.5 pt-1.5 text-xs text-subtle-foreground/60 tabular-nums sm:px-2 sm:pt-2"
              >
                {format(parseISO(day.date), 'd')}
              </span>
            ),
          )}
        </div>
      </div>
    </div>
  );
}

function NightCell({
  night,
  outside,
  selected,
  tabbable,
  onSelect,
  onKeyDown,
}: {
  night: NightOutlook;
  /** In the month before or after the page's. */
  outside: boolean;
  selected: boolean;
  tabbable: boolean;
  onSelect: () => void;
  onKeyDown: (e: KeyboardEvent) => void;
}) {
  const date = parseISO(night.date);
  const share = occupancy(night);
  const changes = night.suggestedPercent !== night.currentPercent;
  const weather = night.weather && notableWeather.has(night.weather.kind) ? night.weather : null;
  const Weather = weather && weatherIcons[weather.kind];
  const label = [
    format(date, 'EEEE, MMMM d'),
    `${Math.round(share * 100)}% booked`,
    night.events.join(', '),
    changes ? `suggested ${signed(night.suggestedPercent)}` : '',
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      data-date={night.date}
      tabIndex={tabbable ? 0 : -1}
      onClick={onSelect}
      onKeyDown={onKeyDown}
      className={cn(
        'relative flex h-[4.75rem] min-w-0 flex-col gap-1 overflow-hidden rounded-[10px] bg-background p-1.5 text-left sm:p-2 ring-1 ring-ink/6 transition-[box-shadow,background-color] duration-150 ease-snap ring-inset hover:bg-surface-raised',
        outside && !selected && 'bg-transparent opacity-60 hover:opacity-100',
        selected && 'ring-2 ring-primary',
      )}
    >
      {night.events.length > 0 && (
        <span aria-hidden className="absolute inset-x-0 top-0 h-[3px] bg-accent-peach" />
      )}
      <span className="flex items-center gap-1 text-xs">
        <span className={cn('tabular-nums', outside ? 'text-muted-foreground' : 'font-medium')}>
          {format(date, 'd')}
        </span>
        {date.getDate() === 1 && (
          <span className="text-subtle-foreground">{format(date, 'MMM')}</span>
        )}
        {Weather && (
          <Weather
            aria-label={weatherLabels[weather.kind]}
            className="ml-auto size-3.5 shrink-0 text-muted-foreground max-sm:hidden"
          />
        )}
      </span>
      {night.events.length > 0 && (
        <span className="truncate text-[0.6875rem] leading-tight text-muted-foreground max-sm:hidden">
          {night.events[0]}
        </span>
      )}
      <span className="mt-auto flex justify-between gap-1 max-sm:flex-col-reverse sm:items-end">
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="font-mono text-[0.6875rem] leading-none text-muted-foreground tabular-nums">
            {Math.round(share * 100)}%
          </span>
          <span className="h-1 overflow-hidden rounded-full bg-ink/6">
            <span
              className={cn(
                'block h-full rounded-full',
                share >= 0.9 ? 'bg-primary' : 'bg-primary/70',
              )}
              style={{ width: `${Math.min(100, Math.round(share * 100))}%` }}
            />
          </span>
        </span>
        {changes ? (
          <span className="shrink-0 self-start rounded-[5px] bg-primary-soft px-1 font-mono sm:self-auto text-[0.6875rem] leading-4 font-medium text-primary-text">
            {signed(night.suggestedPercent)}
          </span>
        ) : night.currentPercent !== 0 ? (
          <span className="shrink-0 self-start font-mono text-[0.6875rem] leading-4 text-muted-foreground sm:self-auto">
            {signed(night.currentPercent)}
          </span>
        ) : null}
      </span>
    </button>
  );
}
