import type { NightOutlook, WeatherKind } from '@orbit/shared';
import { addDays, format, parseISO } from 'date-fns';
import { calendarWeeks, occupancy, signed, weatherLabels } from '@/lib/revenue';
import { weatherIcons } from '@/lib/weather-icons';
import { cn } from '@/lib/utils';

const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
/** Forecasts worth an icon on the grid; clear and cloudy days go without. */
const notableWeather: ReadonlySet<WeatherKind> = new Set(['fog', 'rain', 'snow', 'storm']);

/**
 * The coming nights as a month-style grid from Monday: how full each is, its rate change, and the
 * suggested one where it differs. Events mark the top of a night; rain, snow, fog and storms show
 * as an icon. The days of this week already gone are greyed out.
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
  const lead = weeks[0]?.findIndex((n) => n !== null) ?? 0;
  return (
    // Phones get a narrower week, with the badge under the bar, rather than a sideways scroll
    // that hides the weekend.
    <div className="scrollbar-thin overflow-x-auto">
      <div className="grid grid-cols-7 gap-1 sm:min-w-[36rem]">
        {weekdays.map((d) => (
          <div key={d} className="px-1 pt-1 pb-0.5 text-[0.6875rem] text-subtle-foreground sm:px-2">
            {d}
          </div>
        ))}
        {weeks.flat().map((night, i) =>
          night ? (
            <NightCell
              key={night.date}
              night={night}
              first={i === lead}
              selected={night.date === selected}
              onSelect={() => onSelect(night.date)}
            />
          ) : i < lead ? (
            <span
              key={`past-${i}`}
              aria-hidden
              className="px-1.5 pt-1.5 text-xs text-subtle-foreground/60 tabular-nums sm:px-2 sm:pt-2"
            >
              {format(addDays(parseISO(nights[0]!.date), i - lead), 'd')}
            </span>
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
      onClick={onSelect}
      className={cn(
        'relative flex h-[4.75rem] min-w-0 flex-col gap-1 overflow-hidden rounded-[10px] bg-background p-1.5 text-left sm:p-2 ring-1 ring-ink/6 transition-[box-shadow,background-color] duration-150 ease-snap ring-inset hover:bg-surface-raised',
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
