import type { DailyBrief } from '@orbit/shared';
import {
  BrushCleaning,
  CalendarCheck,
  CalendarX2,
  ChevronRight,
  CircleCheck,
  Clock,
  Inbox,
  type LucideIcon,
  OctagonAlert,
  Wrench,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { EmptyState } from '@/components/empty-state';
import { Section } from '@/components/section';
import { Button } from '@/components/ui/button';
import { useBookingDrawer } from '@/hooks/use-booking-drawer';
import {
  type AttentionItem,
  type AttentionKind,
  attentionItems,
  gapItems,
  occupancyPercent,
} from '@/lib/brief';
import { cn } from '@/lib/utils';

/** Gaps beyond this are behind "Show all". */
const GAPS_SHOWN = 6;

const kindIcons: Record<AttentionKind, { icon: LucideIcon; className: string }> = {
  prepare: { icon: BrushCleaning, className: 'text-warning' },
  hold: { icon: Clock, className: 'text-status-hold' },
  messages: { icon: Inbox, className: 'text-primary-text' },
  out_of_order: { icon: OctagonAlert, className: 'text-destructive' },
  maintenance: { icon: Wrench, className: 'text-muted-foreground' },
  gap: { icon: CalendarX2, className: 'text-muted-foreground' },
};

/** Tonight's numbers and what needs attention today. */
export function DailyBriefPanel({ brief }: { brief: DailyBrief }) {
  const items = attentionItems(brief);
  const gaps = gapItems(brief);
  const [allGaps, setAllGaps] = useState(false);
  const percent = occupancyPercent(brief.occupancy);

  return (
    <div className="flex flex-col gap-8">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <div className="col-span-2 flex flex-col gap-2 rounded-lg bg-surface-raised p-3 shadow-raised sm:col-span-1">
          <dt className="text-xs text-muted-foreground">Occupancy tonight</dt>
          <dd className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold tracking-tight">{percent}%</span>
            <span className="text-xs text-muted-foreground">
              {brief.occupancy.occupied} of {brief.occupancy.sellable} rooms
            </span>
          </dd>
          <div
            role="meter"
            aria-label="Occupancy tonight"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            className="h-1.5 overflow-hidden rounded-full bg-primary-soft"
          >
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${Math.min(percent, 100)}%` }}
            />
          </div>
        </div>
        <Stat label="Guests tonight" value={brief.guestsTonight} />
        <Stat label="Arrivals" value={brief.arrivals} />
        <Stat label="Departures" value={brief.departures} />
        <Stat label="Turnovers" value={brief.turnovers.length} />
      </dl>

      <div className="grid gap-x-10 gap-y-8 lg:grid-cols-[3fr_2fr]">
        <Section title="Needs attention" count={items.length}>
          {items.length === 0 ? (
            <EmptyState icon={CircleCheck} title="Nothing needs attention" className="py-8" />
          ) : (
            <AttentionList items={items} />
          )}
        </Section>
        <Section
          title="Empty nights to sell"
          count={gaps.length}
          actions={
            gaps.length > GAPS_SHOWN && (
              <Button variant="ghost" size="xs" onClick={() => setAllGaps((v) => !v)}>
                {allGaps ? 'Show fewer' : 'Show all'}
              </Button>
            )
          }
        >
          {gaps.length === 0 ? (
            <EmptyState
              icon={CalendarCheck}
              title="No short gaps in the next two weeks"
              className="py-8"
            />
          ) : (
            <AttentionList items={allGaps ? gaps : gaps.slice(0, GAPS_SHOWN)} />
          )}
        </Section>
      </div>
    </div>
  );
}

function AttentionList({ items }: { items: AttentionItem[] }) {
  return (
    <ul className="-mx-2 flex flex-col">
      {items.map((item) => (
        <li key={item.id}>
          <AttentionRow item={item} />
        </li>
      ))}
    </ul>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg bg-surface-raised p-3 shadow-raised">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-2xl font-semibold tracking-tight">{value}</dd>
    </div>
  );
}

const rowClass =
  'group flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left outline-none hover:bg-accent focus-visible:bg-accent';

function AttentionRow({ item }: { item: AttentionItem }) {
  const { open } = useBookingDrawer();
  const { icon: Icon, className } = kindIcons[item.kind];
  const body = (
    <>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
        <Icon className={cn('size-4', className)} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium">{item.title}</span>
        <span className="truncate text-xs text-muted-foreground">{item.detail}</span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-subtle-foreground opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100" />
    </>
  );
  if ('bookingId' in item.target) {
    const { bookingId } = item.target;
    return (
      <button type="button" onClick={() => open(bookingId)} className={rowClass}>
        {body}
      </button>
    );
  }
  return (
    <Link to={item.target.path} className={rowClass}>
      {body}
    </Link>
  );
}
