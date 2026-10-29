import type { NightOutlook } from '@orbit/shared';
import { format, parseISO } from 'date-fns';
import { calendarWeeks, occupancy, signed, weatherLabels } from '@/lib/revenue';
import { weatherIcons } from '@/lib/weather-icons';
import { cn } from '@/lib/utils';

const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * The coming nights as a month-style grid from Monday: how full each is, its rate change, and the
 * suggested one where it differs. Events mark the top of a night; the forecast shows as an icon.
 */
export function RateCalendar({
  nights,
  selected,
  onSelect,
}: {
  nights: NightOutlook[];
  selected: string | null;
  onSelect: (date: string) => void;
}) {
  const weeks = calendarWeeks(nights);
  return (
    <div className="scrollbar-thin overflow-x-auto">
      <div className="grid min-w-[36rem] grid-cols-7 gap-1">
        {weekdays.map((d) => (
          <div key={d} className="px-2 pt-1 pb-0.5 text-[0.6875rem] text-subtle-foreground">
            {d}
          </div>
        ))}
        {weeks
          .flat()
          .map((night, i) =>
            night ? (
              <NightCell
                key={night.date}
                night={night}
                first={i === weeks[0]!.findIndex((n) => n !== null)}
                selected={night.date === selected}
                onSelect={() => onSelect(night.date)}
              />
            ) : (
              <div key={`pad-${i}`} aria-hidden />
            ),
          )}
      </div>
    </div>
  );
}

function NightCell({
  night,
  first,
  selected,
  onSelect,
}: {
  night: NightOutlook;
  first: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const date = parseISO(night.date);
  const share = occupancy(night);
  const changes = night.suggestedPercent !== night.currentPercent;
  const Weather = night.weather && weatherIcons[night.weather.kind];
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
      onClick={onSelect}
      className={cn(
        'relative flex h-[5.25rem] min-w-0 flex-col gap-1 overflow-hidden rounded-[10px] bg-background p-2 text-left ring-1 ring-ink/6 transition-[box-shadow,background-color] duration-150 ease-snap ring-inset hover:bg-surface-raised',
        selected && 'ring-2 ring-primary',
      )}
    >
      {night.events.length > 0 && (
        <span aria-hidden className="absolute inset-x-0 top-0 h-[3px] bg-accent-peach" />
      )}
      <span className="flex items-center gap-1 text-xs">
        <span className="font-medium tabular-nums">{format(date, 'd')}</span>
        {(first || date.getDate() === 1) && (
          <span className="text-subtle-foreground">{format(date, 'MMM')}</span>
        )}
        {Weather && (
          <Weather
            aria-label={weatherLabels[night.weather!.kind]}
            className="ml-auto size-3.5 shrink-0 text-muted-foreground"
          />
        )}
      </span>
      {night.events.length > 0 && (
        <span className="truncate text-[0.6875rem] leading-tight text-muted-foreground">
          {night.events[0]}
        </span>
      )}
      <span className="mt-auto flex items-end justify-between gap-1">
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="font-mono text-[0.6875rem] leading-none text-muted-foreground tabular-nums">
            {Math.round(share * 100)}%
          </span>
          <span className="h-1 overflow-hidden rounded-full bg-ink/6">
            <span
              className={cn(
                'block h-full rounded-full',
                share >= 0.9 ? 'bg-warning' : 'bg-primary/70',
              )}
              style={{ width: `${Math.min(100, Math.round(share * 100))}%` }}
            />
          </span>
        </span>
        {changes ? (
          <span className="shrink-0 rounded-[5px] bg-primary-soft px-1 font-mono text-[0.6875rem] leading-4 font-medium text-primary-text">
            {signed(night.suggestedPercent)}
          </span>
        ) : night.currentPercent !== 0 ? (
          <span className="shrink-0 font-mono text-[0.6875rem] leading-4 text-muted-foreground">
            {signed(night.currentPercent)}
          </span>
        ) : null}
      </span>
    </button>
  );
}
