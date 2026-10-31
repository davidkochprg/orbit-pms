import type { ArrivalNotes, DailyBrief, KnockOn } from '@orbit/shared';
import {
  BrushCleaning,
  CalendarCheck,
  CalendarX2,
  ChevronRight,
  CircleCheck,
  Clock,
  Inbox,
  type LucideIcon,
  MailCheck,
  OctagonAlert,
  Phone,
  ScanLine,
  Wrench,
} from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrivalNotesDialog } from '@/components/arrival-notes-dialog';
import { EmptyState } from '@/components/empty-state';
import { ErrorNotice } from '@/components/error-notice';
import { Panel, ScrollBox } from '@/components/panel';
import { RelocateDialog } from '@/components/relocate-dialog';
import { RepairDialog } from '@/components/repair-panel';
import { Button } from '@/components/ui/button';
import { useBookingDrawer } from '@/hooks/use-booking-drawer';
import {
  useArrivalNotes,
  useAskToRepair,
  useHealth,
  useKnockOns,
  useRefreshInboxRooms,
} from '@/lib/api';
import { type AttentionItem, type AttentionKind, attentionItems, gapItems } from '@/lib/brief';
import { contactName, telHref } from '@/lib/repairs';
import { cn } from '@/lib/utils';

const kindIcons: Record<AttentionKind, { icon: LucideIcon; className: string }> = {
  prepare: { icon: BrushCleaning, className: 'text-warning' },
  ids: { icon: ScanLine, className: 'text-warning' },
  hold: { icon: Clock, className: 'text-status-hold' },
  opening: { icon: CalendarCheck, className: 'text-primary-text' },
  messages: { icon: Inbox, className: 'text-primary-text' },
  welcome: { icon: MailCheck, className: 'text-primary-text' },
  out_of_order: { icon: OctagonAlert, className: 'text-destructive' },
  maintenance: { icon: Wrench, className: 'text-muted-foreground' },
  gap: { icon: CalendarX2, className: 'text-muted-foreground' },
};

/**
 * What needs attention today, most urgent first, each linking to where it is handled. What a
 * change made worth doing (stays to move, who to ask for a repair, a room free for a request) is
 * fixed from the row itself.
 */
export function AttentionPanel({ brief, className }: { brief: DailyBrief; className?: string }) {
  const knockOns = useKnockOns();
  const health = useHealth();
  // Notes before a stay are written by the model, so the row only shows when AI is on.
  const aiOn = health.data?.ai.configured ?? false;
  const arrivalNotes = useArrivalNotes(aiOn);
  const items = attentionItems(brief, knockOns.data, arrivalNotes.data);
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
        {item.detail && (
          <span className="truncate text-xs text-muted-foreground">{item.detail}</span>
        )}
      </span>
      <ChevronRight className="size-4 shrink-0 text-subtle-foreground opacity-0 transition-[opacity,transform] duration-150 ease-snap group-hover:translate-x-0.5 group-hover:opacity-100 group-focus-visible:opacity-100" />
    </>
  );
  if (item.knockOn) return <KnockOnRow knockOn={item.knockOn} body={body} />;
  if (item.arrivalNotes) return <ArrivalNotesRow notes={item.arrivalNotes} body={body} />;
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

/** Opens tomorrow's guests with a note for each to draft, read and send. */
function ArrivalNotesRow({ notes, body }: { notes: ArrivalNotes; body: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={rowClass}>
        {body}
      </button>
      <ArrivalNotesDialog notes={notes} open={open} onOpenChange={setOpen} />
    </>
  );
}

/** A row whose click is the fix: the moves to confirm, the repair's contacts, or the request. */
function KnockOnRow({ knockOn, body }: { knockOn: KnockOn; body: ReactNode }) {
  const [open, setOpen] = useState(false);
  if (knockOn.kind === 'relocate') {
    return (
      <>
        <button type="button" onClick={() => setOpen(true)} className={rowClass}>
          {body}
        </button>
        <RelocateDialog knockOn={knockOn} open={open} onOpenChange={setOpen} />
      </>
    );
  }
  if (knockOn.kind === 'repair') return <RepairRow knockOn={knockOn} body={body} />;
  return <OpeningRow knockOn={knockOn} body={body} />;
}

/** Opens the repair's contacts on the email to the first one, with a call button beside it. */
function RepairRow({
  knockOn,
  body,
}: {
  knockOn: Extract<KnockOn, { kind: 'repair' }>;
  body: ReactNode;
}) {
  const [writing, setWriting] = useState(false);
  const ask = useAskToRepair(knockOn.taskId);
  const { contact } = knockOn;
  return (
    <span className="flex items-center gap-1 pr-2">
      <button type="button" onClick={() => setWriting(true)} className={cn(rowClass, 'flex-1')}>
        {body}
      </button>
      {contact.phone && (
        <Button
          asChild
          variant="outline"
          size="icon-sm"
          aria-label={`Call ${contactName(contact)}`}
          tooltip={`Call ${contact.phone}`}
        >
          <a href={telHref(contact.phone)} onClick={() => ask.mutate(contact.id)}>
            <Phone />
          </a>
        </Button>
      )}
      <RepairDialog
        taskId={writing ? knockOn.taskId : null}
        writeTo={contact.email ? contact.id : undefined}
        onOpenChange={setWriting}
      />
    </span>
  );
}

/** Looks for rooms again for the request, then opens the conversation to offer one. */
function OpeningRow({
  knockOn,
  body,
}: {
  knockOn: Extract<KnockOn, { kind: 'opening' }>;
  body: ReactNode;
}) {
  const refresh = useRefreshInboxRooms();
  const navigate = useNavigate();
  return (
    <>
      <button
        type="button"
        disabled={refresh.isPending}
        onClick={() =>
          refresh.mutate(knockOn.inquiryId, {
            onSuccess: () => void navigate(`/inbox/${knockOn.inquiryId}`),
          })
        }
        className={rowClass}
      >
        {body}
      </button>
      {refresh.error && <ErrorNotice message={refresh.error.message} className="mx-2" />}
    </>
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
