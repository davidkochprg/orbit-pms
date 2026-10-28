import type { DailyBrief, HousekeepingRoom } from '@orbit/shared';
import { Link } from 'react-router';
import { HouseMap } from '@/components/house-map';
import { Panel } from '@/components/panel';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { occupancyPercent } from '@/lib/brief';

/** Tonight at a glance: the occupancy and the house map side by side. */
export function TonightPanel({
  brief,
  rooms,
}: {
  brief: DailyBrief;
  rooms: HousekeepingRoom[] | undefined;
}) {
  const percent = occupancyPercent(brief.occupancy);
  return (
    <Panel
      title="Tonight"
      actions={
        <Button variant="secondary" size="xs" asChild>
          <Link to="/housekeeping">Housekeeping</Link>
        </Button>
      }
      bare
      contentClassName="grid gap-1 lg:grid-cols-[15rem_1fr]"
    >
      <div className="flex min-w-0 flex-col justify-between gap-8 p-4">
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">Occupancy</p>
          <p className="text-3xl font-semibold tracking-tight tabular-nums">
            {percent}
            <span className="ml-0.5 text-xl text-subtle-foreground">%</span>
          </p>
          <div
            role="meter"
            aria-label="Occupancy tonight"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            className="h-1.5 overflow-hidden rounded-full bg-ink/6"
          >
            <div
              className="h-full rounded-full bg-linear-to-r from-accent-violet to-primary shadow-[0_0_10px_var(--primary)] motion-safe:transition-[width] motion-safe:duration-700"
              style={{ width: `${Math.min(percent, 100)}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            <span className="font-mono text-foreground">
              {brief.occupancy.occupied}/{brief.occupancy.sellable}
            </span>{' '}
            rooms taken
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
          <Figure label="Guests" value={brief.guestsTonight} />
          <Figure label="Turnovers" value={brief.turnovers.length} />
          <Figure label="Arrivals" value={brief.arrivals} />
          <Figure label="Departures" value={brief.departures} />
        </dl>
      </div>
      <div className="relative min-w-0 rounded-stage bg-background p-4 shadow-[0_1px_2px_var(--shadow-soft)] stroke-lit sm:p-5">
        {rooms ? <HouseMap rooms={rooms} /> : <Skeleton className="h-56 w-full" />}
      </div>
    </Panel>
  );
}

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-xl font-semibold tracking-tight tabular-nums">{value}</dd>
    </div>
  );
}
