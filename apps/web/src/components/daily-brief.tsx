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
  ScanLine,
  Wrench,
} from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Link } from 'react-router';
import { EmptyState } from '@/components/empty-state';
import { Panel, ScrollBox } from '@/components/panel';
import { useBookingDrawer } from '@/hooks/use-booking-drawer';
import { type AttentionItem, type AttentionKind, attentionItems, gapItems } from '@/lib/brief';
import { cn } from '@/lib/utils';

const kindIcons: Record<AttentionKind, { icon: LucideIcon; className: string }> = {
  prepare: { icon: BrushCleaning, className: 'text-warning' },
  ids: { icon: ScanLine, className: 'text-warning' },
  hold: { icon: Clock, className: 'text-status-hold' },
  messages: { icon: Inbox, className: 'text-primary-text' },
  out_of_order: { icon: OctagonAlert, className: 'text-destructive' },
  maintenance: { icon: Wrench, className: 'text-muted-foreground' },
  gap: { icon: CalendarX2, className: 'text-muted-foreground' },
};

/** What needs attention today, most urgent first, each linking to where it is handled. */
export function AttentionPanel({ brief, className }: { brief: DailyBrief; className?: string }) {
  const items = attentionItems(brief);
  return (
    <Panel
      title="Needs attention"
      count={items.length}
      className={className}
      contentClassName="p-0"
    >
      <ScrollBox className="max-h-80 xl:absolute xl:inset-0 xl:max-h-none">
        {items.length === 0 ? (
          <EmptyState icon={CircleCheck} title="Nothing needs attention" className="py-8" />
        ) : (
          <AttentionList items={items} />
        )}
      </ScrollBox>
    </Panel>
  );
}

/** Short empty runs between stays in the next two weeks, worth offering. */
export function GapsPanel({
  brief,
  className,
  listClassName,
}: {
  brief: DailyBrief;
  className?: string;
  /** Sizes the scrolling list. */
  listClassName?: string;
}) {
  const gaps = gapItems(brief);
  return (
    <Panel
      title="Empty nights to sell"
      count={gaps.length}
      className={className}
      contentClassName="p-0"
    >
      <ScrollBox className={listClassName}>
        {gaps.length === 0 ? (
          <EmptyState
            icon={CalendarCheck}
            title="No short gaps in the next two weeks"
            className="h-full"
          />
        ) : (
          <AttentionList items={gaps} />
        )}
      </ScrollBox>
    </Panel>
  );
}

/**
 * Attention items as rows that open where each is handled. `onOpen` runs before a page opens, e.g.
 * to close a dialog; `openBooking` replaces opening a booking's inspector.
 */
export function AttentionList({
  items,
  onOpen,
  openBooking,
}: {
  items: AttentionItem[];
  onOpen?: () => void;
  openBooking?: (bookingId: string) => void;
}) {
  return (
    <ul className="flex flex-col">
      {items.map((item) => (
        <li key={item.id}>
          <AttentionRow item={item} onOpen={onOpen} openBooking={openBooking} />
        </li>
      ))}
    </ul>
  );
}

const rowClass =
  'group flex w-full items-center gap-3 rounded-control px-2.5 py-2 text-left outline-none transition-colors duration-150 ease-snap hover:bg-accent focus-visible:bg-accent';

function AttentionRow({
  item,
  onOpen,
  openBooking,
}: {
  item: AttentionItem;
  onOpen?: () => void;
  openBooking?: (bookingId: string) => void;
}) {
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
  if ('items' in item.target) {
    return (
      <AttentionGroup
        item={item}
        items={item.target.items}
        onOpen={onOpen}
        openBooking={openBooking}
        body={body}
      />
    );
  }
  if ('bookingId' in item.target) {
    const { bookingId } = item.target;
    return (
      <button
        type="button"
        onClick={() => (openBooking ? openBooking(bookingId) : open(bookingId))}
        className={rowClass}
      >
        {body}
      </button>
    );
  }
  return (
    <Link to={item.target.path} onClick={onOpen} className={rowClass}>
      {body}
    </Link>
  );
}

/** A row standing for several items of one kind, opening into them in place. */
function AttentionGroup({
  item,
  items,
  body,
  onOpen,
  openBooking,
}: {
  item: AttentionItem;
  items: AttentionItem[];
  body: ReactNode;
  onOpen?: () => void;
  openBooking?: (bookingId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-label={`${item.title}: ${open ? 'hide' : 'show'} them`}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          rowClass,
          '[&>svg:last-child]:transition-transform',
          open && '[&>svg:last-child]:rotate-90 [&>svg:last-child]:opacity-100',
        )}
      >
        {body}
      </button>
      {open && (
        <div className="ml-6 border-l pl-2">
          <AttentionList items={items} onOpen={onOpen} openBooking={openBooking} />
        </div>
      )}
    </>
  );
}
