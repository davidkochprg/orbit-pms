import type { NightOutlook, RateFactor } from '@orbit/shared';
import { format, parseISO } from 'date-fns';
import { CalendarDays, Cloud, type LucideIcon, TrendingUp, UserX } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatLongDate } from '@/lib/format';
import { occupancy, ratePercent, signed, weatherLabels } from '@/lib/revenue';
import { weatherIcons } from '@/lib/weather-icons';
import { cn } from '@/lib/utils';

const factorIcons: Record<Exclude<RateFactor['kind'], 'weather'>, LucideIcon> = {
  demand: TrendingUp,
  event: CalendarDays,
};

/**
 * One night of the outlook: how full it is against its usual, why a rate is suggested, and, for a
 * manager, buttons to take the suggestion, set another percent or go back to the season rate.
 */
export function RateNightPanel({
  night,
  canManage,
  busy,
  onSet,
}: {
  night: NightOutlook;
  canManage: boolean;
  busy: boolean;
  onSet: (percent: number) => void;
}) {
  const [custom, setCustom] = useState('');
  const share = occupancy(night);
  const changes = night.suggestedPercent !== night.currentPercent;
  const weekday = format(parseISO(night.date), 'EEEE');
  const customValue = Number(custom);
  const customValid =
    custom.trim() !== '' &&
    Number.isInteger(customValue) &&
    customValue >= -50 &&
    customValue <= 100 &&
    customValue !== night.currentPercent;

  return (
    <div className="flex flex-col gap-4 p-3">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-[0.9375rem] font-medium">{formatLongDate(night.date)}</h3>
        <p className="text-xs text-muted-foreground">
          {night.roomsSold} of {night.roomsTotal} rooms booked · {Math.round(share * 100)}%
          {night.typicalOccupancy !== null &&
            ` · usually ${Math.round(night.typicalOccupancy * 100)}% on ${weekday}s`}
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-2">
        <Figure label="Current rate" value={ratePercent(night.currentPercent)} />
        <Figure label="Suggested" value={ratePercent(night.suggestedPercent)} highlight={changes} />
      </dl>

      <section className="flex flex-col gap-1.5">
        <h4 className="text-xs text-subtle-foreground">Why</h4>
        {night.factors.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nothing unusual</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {night.factors.map((f) => {
              const Icon =
                f.kind === 'weather'
                  ? night.weather
                    ? weatherIcons[night.weather.kind]
                    : Cloud
                  : factorIcons[f.kind];
              return (
                <li key={f.label} className="flex items-center gap-2 text-[0.8125rem]">
                  <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{f.label}</span>
                  <span
                    className={cn(
                      'font-mono text-xs tabular-nums',
                      f.percent < 0 ? 'text-muted-foreground' : 'text-foreground',
                    )}
                  >
                    {signed(f.percent)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {(night.weather || night.expectedNoShows > 0) && (
        <section className="flex flex-col gap-1.5 text-xs text-muted-foreground">
          {night.weather && (
            <p className="flex items-center gap-2">
              <WeatherIcon kind={night.weather.kind} />
              {weatherLabels[night.weather.kind]}, {night.weather.tempMinC}° to{' '}
              {night.weather.tempMaxC}°C
              {night.weather.snowfallCm > 0 && `, ${night.weather.snowfallCm} cm snow`}
              {night.weather.snowfallCm === 0 &&
                night.weather.precipitationMm > 0 &&
                `, ${night.weather.precipitationMm} mm`}
            </p>
          )}
          {night.expectedNoShows > 0 && (
            <p className="flex items-center gap-2">
              <UserX className="size-3.5 shrink-0" />
              About {night.expectedNoShows.toFixed(1)} rooms may stay empty from no-shows
            </p>
          )}
        </section>
      )}

      {canManage ? (
        <div className="flex flex-col gap-2 border-t pt-3">
          {changes && (
            <Button size="sm" disabled={busy} onClick={() => onSet(night.suggestedPercent)}>
              {night.suggestedPercent === 0
                ? 'Go back to the season rate'
                : `Set ${signed(night.suggestedPercent)}`}
            </Button>
          )}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (customValid) {
                onSet(customValue);
                setCustom('');
              }
            }}
          >
            <div className="relative flex-1">
              <Input
                aria-label="Another percent"
                inputMode="numeric"
                placeholder="Another %, e.g. 10"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                className="h-8 pr-7 text-[0.8125rem]"
              />
              <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-subtle-foreground">
                %
              </span>
            </div>
            <Button type="submit" variant="outline" size="sm" disabled={busy || !customValid}>
              Set
            </Button>
          </form>
          {night.currentPercent !== 0 && night.suggestedPercent !== 0 && (
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => onSet(0)}>
              Back to the season rate
            </Button>
          )}
        </div>
      ) : (
        <p className="border-t pt-3 text-xs text-muted-foreground">
          Only a manager can change rates.
        </p>
      )}
    </div>
  );
}

function WeatherIcon({ kind }: { kind: keyof typeof weatherIcons }) {
  const Icon = weatherIcons[kind];
  return <Icon className="size-3.5 shrink-0" />;
}

function Figure({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-0.5 rounded-[10px] px-3 py-2 ring-1 ring-ink/6 ring-inset',
        highlight && 'bg-primary-soft ring-primary/20',
      )}
    >
      <dt className="text-[0.6875rem] text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          'text-[0.9375rem]',
          /\d/.test(value) && 'font-mono',
          highlight && 'text-primary-text',
        )}
      >
        {value}
      </dd>
    </div>
  );
}
