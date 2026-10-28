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
import { Panel } from '@/components/panel';
import { Button } from '@/components/ui/button';
import { useBookingDrawer } from '@/hooks/use-booking-drawer';
import { type AttentionItem, type AttentionKind, attentionItems, gapItems } from '@/lib/brief';
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

/** What needs attention today and the empty nights worth selling. */
export function DailyBriefPanel({ brief }: { brief: DailyBrief }) {
  const items = attentionItems(brief);
  const gaps = gapItems(brief);
  const [allGaps, setAllGaps] = useState(false);

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[3fr_2fr]">
      <Panel title="Needs attention" count={items.length}>
        {items.length === 0 ? (
          <EmptyState icon={CircleCheck} title="Nothing needs attention" className="py-8" />
        ) : (
          <AttentionList items={items} />
        )}
      </Panel>
      <Panel
        title="Empty nights to sell"
        count={gaps.length}
        actions={
          gaps.length > GAPS_SHOWN && (
            <Button variant="secondary" size="xs" onClick={() => setAllGaps((v) => !v)}>
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
      </Panel>
    </div>
  );
}

function AttentionList({ items }: { items: AttentionItem[] }) {
  return (
    <ul className="flex flex-col">
      {items.map((item) => (
        <li key={item.id}>
          <AttentionRow item={item} />
        </li>
      ))}
    </ul>
  );
}

const rowClass =
  'group flex w-full items-center gap-3 rounded-control px-2.5 py-2 text-left outline-none transition-colors duration-150 ease-snap hover:bg-accent focus-visible:bg-accent';

function AttentionRow({ item }: { item: AttentionItem }) {
  const { open } = useBookingDrawer();
  const { icon: Icon, className } = kindIcons[item.kind];
  const body = (
    <>
      <span className="relative flex size-8 shrink-0 items-center justify-center rounded-lg fill-action shadow-[0_1px_2px_var(--shadow-soft)] stroke-lit">
        <Icon className={cn('size-4', className)} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate">{item.title}</span>
        <span className="truncate text-xs text-muted-foreground">{item.detail}</span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-subtle-foreground opacity-0 transition-[opacity,transform] duration-150 ease-snap group-hover:translate-x-0.5 group-hover:opacity-100 group-focus-visible:opacity-100" />
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
