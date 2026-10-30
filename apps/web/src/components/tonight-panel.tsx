import type { DailyBrief, DayOverview, HousekeepingRoom } from '@orbit/shared';
import { type ReactNode, useMemo } from 'react';
import { Link } from 'react-router';
import { HouseMap } from '@/components/house-map';
import { Panel } from '@/components/panel';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useBookingDrawer } from '@/hooks/use-booking-drawer';
import { useBookingEditor } from '@/hooks/use-booking-editor';
import { doneOf, occupancyPercent } from '@/lib/brief';
import { stayByRoom } from '@/lib/house-map';

/** Tonight at a glance: the day's figures in a row over the house map. */
export function TonightPanel({
  brief,
  day,
  rooms,
  className,
}: {
  brief: DailyBrief;
  day: DayOverview | undefined;
  rooms: HousekeepingRoom[] | undefined;
  className?: string;
}) {
  const percent = occupancyPercent(brief.occupancy);
  const { open } = useBookingDrawer();
  const { openNew } = useBookingEditor();
  const stays = useMemo(() => day && stayByRoom(day), [day]);
  return (
    <Panel
      title="Tonight"
      className={className}
      actions={
        <Button variant="secondary" size="xs" asChild>
          <Link to="/housekeeping">Housekeeping</Link>
        </Button>
      }
      contentClassName="flex flex-col p-0"
    >
      {/* Hairlines between the figures are the border color showing through a 1px gap. */}
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-t-stage border-b bg-border lg:grid-cols-5">
        <Figure
          label="Occupancy"
          aside={
            <span
              role="meter"
              aria-label="Occupancy tonight"
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
              className="h-1 w-16 overflow-hidden rounded-full bg-ink/6"
            >
              <span
                className="block h-full rounded-full bg-linear-to-r from-accent-violet to-primary motion-safe:transition-[width] motion-safe:duration-700"
                style={{ width: `${Math.min(percent, 100)}%` }}
              />
            </span>
          }
          detail={`${brief.occupancy.occupied} of ${brief.occupancy.sellable}`}
        >
          {percent}
          <span className="text-base text-subtle-foreground">%</span>
        </Figure>
        <Figure label="Arrivals" detail={day && `${doneOf(day.arrivals, 'checked_in')} in`}>
          {brief.arrivals}
        </Figure>
        <Figure label="Departures" detail={day && `${doneOf(day.departures, 'checked_out')} out`}>
          {brief.departures}
        </Figure>
        <Figure label="Guests" detail="tonight">
          {brief.guestsTonight}
        </Figure>
        <Figure label="Turnovers" detail="today">
          {brief.turnovers.length}
        </Figure>
      </dl>
      <div className="flex-1 p-4">
        {rooms ? (
          <HouseMap
            rooms={rooms}
            stays={stays}
            onOpenStay={(id) => open(id)}
            onBook={(roomId) => openNew({ roomId, checkIn: brief.date })}
          />
        ) : (
          <Skeleton className="h-44 w-full" />
        )}
      </div>
    </Panel>
  );
}

function Figure({
  label,
  aside,
  detail,
  children,
}: {
  label: string;
  /** Shown at the right of the label, e.g. a meter. */
  aside?: ReactNode;
  /** Small text after the figure. */
  detail: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 bg-background px-4 py-3 first:max-lg:col-span-2">
      <dt className="flex h-4 items-center justify-between gap-2 text-xs text-muted-foreground">
        {label}
        {aside}
      </dt>
      <dd className="flex min-w-0 items-baseline gap-2">
        <span className="text-2xl font-semibold tracking-tight tabular-nums">{children}</span>
        {detail && (
          <span className="truncate text-xs text-subtle-foreground tabular-nums">{detail}</span>
        )}
      </dd>
    </div>
  );
}
