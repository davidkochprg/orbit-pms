import type { PendingAction, PendingActionDetails, PendingValue } from '@orbit/shared';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import { ArrowRight, Check, CircleAlert, LoaderCircle, X } from 'lucide-react';
import { Link } from 'react-router';
import { BookingRow } from '@/components/agent-mention';
import { Count } from '@/components/panel';
import { Button } from '@/components/ui/button';
import { MailPreview } from '@/components/mail-proposal';
import { Kbd } from '@/components/ui/kbd';
import { Tip } from '@/components/ui/tooltip';
import { useCommandPalette } from '@/hooks/use-command-palette';
import {
  usePendingAction,
  usePendingActions,
  useResolvePendingAction,
  useResolvePendingActions,
} from '@/lib/api';
import { formatMoney, formatRange } from '@/lib/format';
import { isMailAction } from '@/lib/mail';
import { modShortcut } from '@/lib/platform';
import { cn } from '@/lib/utils';
import { useGuestDrawer } from '@/hooks/use-guest-drawer';

const outcome = {
  confirmed: { icon: Check, text: 'Done', className: 'text-success' },
  rejected: { icon: X, text: 'Rejected', className: 'text-muted-foreground' },
  failed: { icon: CircleAlert, text: 'Could not be applied', className: 'text-destructive' },
} as const;

const titles: Record<PendingAction['kind'], string> = {
  create_hold: 'New hold',
  confirm_booking: 'Confirm the booking',
  cancel_booking: 'Cancel the booking',
  check_in: 'Check in',
  check_out: 'Check out',
  move_booking: 'Move to another room',
  change_dates: 'Change the dates',
  update_booking: 'Edit the booking',
  add_charge: 'Add to the bill',
  record_payment: 'Record a payment',
  update_charge: 'Correct the bill',
  remove_charge: 'Remove from the bill',
  add_stay_guest: 'Add to the guest book',
  update_stay_guest: 'Update the guest book',
  remove_stay_guest: 'Remove from the guest book',
  update_guest: 'Edit the guest profile',
  create_guest: 'Add a guest',
  adjust_rates: 'Change rates',
  save_hotel_info: 'Save to Knowledge',
  remove_hotel_info: 'Delete from Knowledge',
  send_reply: 'Send a reply',
  send_email: 'New email',
  send_arrival_note: 'Email before the stay',
  send_work_order: 'Email about a repair',
  hold_inquiry: 'Hold a room for the request',
  hold_block: 'Hold rooms for the group',
  decline_inquiry: 'Decline the request',
  add_local_event: 'Add a local event',
  remove_local_event: 'Remove a local event',
  update_room: 'Change the room',
  save_contact: 'Save a contact',
  remove_contact: 'Delete a contact',
  issue_invoice: 'Issue a document',
  void_invoice: 'Void a document',
  email_invoice: 'Email a document',
  save_supplier_invoice: 'Add a bill',
  update_supplier_invoice: 'Update a bill',
  pay_supplier_invoice: 'Mark a bill paid',
  remove_supplier_invoice: 'Delete a bill',
  read_bill: 'Read a bill',
};

/** The conversation an action is about, to open once it is done. */
function conversationOf(action: PendingAction): string | null {
  switch (action.kind) {
    case 'send_reply':
    case 'hold_inquiry':
    case 'hold_block':
    case 'decline_inquiry':
      return action.input.inquiryId;
    default:
      return null;
  }
}

/**
 * Confirm card for a change the agent proposed: the booking it concerns, what changes from what
 * to what, and the money it moves, as the domain worked them out. Nothing happens until the user
 * confirms.
 */
export function PendingActionCard({
  id,
  summary,
  targeted = false,
}: {
  id: string;
  summary: string;
  /** The change Ctrl/⌘ ↵ confirms and Ctrl/⌘ ⌫ rejects: outlined, with the shortcuts on its buttons. */
  targeted?: boolean;
}) {
  const action = usePendingAction(id);
  const resolve = useResolvePendingAction(id);
  const { closePalette, openBooking } = useCommandPalette();
  const { open: openGuest } = useGuestDrawer();
  const current = resolve.data ?? action.data;
  const result = current && current.status !== 'pending' ? outcome[current.status] : null;
  const details = current?.details ?? null;
  // A new hold has no booking yet; once confirmed, `bookingId` is the one it created.
  const bookingId =
    current && (current.kind !== 'create_hold' || current.status === 'confirmed')
      ? current.bookingId
      : null;

  return (
    <div
      className={cn(
        'relative flex flex-col gap-3 rounded-control fill-panel p-3.5 shadow-[0_1px_2px_var(--shadow-soft),0_10px_30px_-18px_var(--shadow-deep)] stroke-lit',
        targeted && current?.status === 'pending' && 'ring-2 ring-ring/40',
      )}
    >
      {details && current ? (
        <>
          <p className="text-xs font-medium text-muted-foreground">{titles[current.kind]}</p>
          {bookingId && (
            <div className="-mx-1.5 -my-1">
              <BookingRow id={bookingId} />
            </div>
          )}
          {isMailAction(current) ? (
            <>
              {current.kind === 'send_work_order' && (
                <Details
                  details={{ ...details, changes: details.changes.filter((c) => c.label !== 'To') }}
                />
              )}
              <MailPreview
                action={current}
                lines={10}
                onEdit={
                  current.status === 'pending' && !resolve.isPending
                    ? () => resolve.mutate('reject')
                    : undefined
                }
              />
            </>
          ) : (
            <Details details={details} />
          )}
        </>
      ) : (
        <p className="text-sm">{current?.summary ?? summary}</p>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        {current?.status === 'pending' && (
          <>
            <Button
              size="sm"
              disabled={resolve.isPending}
              onClick={() => resolve.mutate('confirm')}
            >
              Confirm
              {targeted && <Kbd className="ml-1 bg-white/15 text-inherit">{modShortcut('↵')}</Kbd>}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={resolve.isPending}
              onClick={() => resolve.mutate('reject')}
            >
              Reject
              {targeted && <Kbd className="ml-1">{modShortcut('⌫')}</Kbd>}
            </Button>
          </>
        )}
        {result && current && (
          <span className={cn('flex items-center gap-1 text-xs font-medium', result.className)}>
            <result.icon className="size-3.5" />
            {result.text}
            {current.error && `: ${current.error}`}
          </span>
        )}
        {!current && <span className="text-xs text-muted-foreground">Loading…</span>}
        {current?.bookingId && current.status === 'confirmed' && (
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto"
            onClick={() => openBooking(current.bookingId!)}
          >
            Open booking
          </Button>
        )}
        {current && conversationOf(current) && current.status === 'confirmed' && !bookingId && (
          <Button size="sm" variant="ghost" className="ml-auto" asChild>
            <Link
              to={`/inbox/${encodeURIComponent(conversationOf(current)!)}`}
              onClick={closePalette}
            >
              Open conversation
            </Link>
          </Button>
        )}
        {current?.kind === 'update_guest' && current.status === 'confirmed' && (
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto"
            onClick={() => {
              closePalette();
              openGuest(current.input.guestId);
            }}
          >
            Open profile
          </Button>
        )}
      </div>
      {resolve.isError && <p className="text-xs text-destructive">{resolve.error.message}</p>}
    </div>
  );
}

function Value({ value, className }: { value: PendingValue; className?: string }) {
  if ('text' in value) return <span className={className}>{value.text}</span>;
  const nights = differenceInCalendarDays(parseISO(value.checkOut), parseISO(value.checkIn));
  return (
    <span className={cn('tabular-nums', className)}>
      {formatRange(value.checkIn, value.checkOut)} · {nights} night{nights === 1 ? '' : 's'}
    </span>
  );
}

/** What changes, one row each: the old value struck through, then the new one. */
function Details({ details }: { details: PendingActionDetails }) {
  const { changes, amount, note } = details;
  return (
    <div className="flex flex-col gap-2 text-sm">
      {changes.length > 0 && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          {changes.map((c, i) => (
            <div key={i} className="contents">
              <dt className="text-muted-foreground">{c.label}</dt>
              <dd className="flex min-w-0 flex-wrap items-center gap-x-1.5">
                {c.before && (
                  <>
                    <Value
                      value={c.before}
                      className="text-muted-foreground line-through decoration-ink/30"
                    />
                    {c.after && <ArrowRight className="size-3 shrink-0 text-muted-foreground" />}
                  </>
                )}
                {c.after ? (
                  <Value value={c.after} className="font-medium" />
                ) : (
                  <span className="text-muted-foreground">removed</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {amount && (
        <div className="flex items-baseline justify-between gap-3 border-t border-border pt-2">
          <span className="text-muted-foreground">{amount.label}</span>
          <span className="flex items-baseline gap-1.5 font-mono tabular-nums">
            {amount.before !== null && amount.before !== amount.after && (
              <>
                <span className="text-xs text-muted-foreground line-through decoration-ink/30">
                  {formatMoney(amount.before)}
                </span>
                <ArrowRight className="size-3 self-center text-muted-foreground" />
              </>
            )}
            <span className="text-base">{formatMoney(amount.after)}</span>
          </span>
        </div>
      )}
      {note && (
        <p className="flex items-start gap-1.5 text-xs text-warning">
          <CircleAlert className="mt-px size-3.5 shrink-0" />
          {note}
        </p>
      )}
    </div>
  );
}

/** One line for a change in a batch: the money it moves, or its first change. */
function changeLine(action: PendingAction): string | null {
  const details = action.details;
  if (!details) return null;
  if (details.amount) return `${details.amount.label} ${formatMoney(details.amount.after)}`;
  const first = details.changes[0];
  if (!first) return null;
  const value = first.after ?? first.before;
  if (!value) return first.label;
  const text = 'text' in value ? value.text : formatRange(value.checkIn, value.checkOut);
  return first.after ? `${first.label}: ${text}` : `${first.label}: removed`;
}

/**
 * Several changes proposed in one answer, e.g. ten cancellations: one card with a row for each
 * and one confirm for all of them, instead of a card per change to scroll through. Each row can
 * still be confirmed or rejected on its own.
 */
export function PendingActionBatch({
  proposals,
  targeted = false,
}: {
  proposals: { pendingActionId: string; summary: string }[];
  /** Ctrl/⌘ ↵ confirms and Ctrl/⌘ ⌫ rejects every change still waiting. */
  targeted?: boolean;
}) {
  const ids = proposals.map((p) => p.pendingActionId);
  const queries = usePendingActions(ids);
  const resolveAll = useResolvePendingActions();
  const actions = queries.map((q) => q.data);
  const pending = ids.filter((_, i) => actions[i]?.status === 'pending');
  const kinds = new Set(actions.map((a) => a?.kind));
  const kind = kinds.size === 1 ? actions[0]?.kind : undefined;
  const done = actions.filter((a) => a?.status === 'confirmed').length;
  const failed = actions.filter((a) => a?.status === 'failed').length;
  const rejected = actions.filter((a) => a?.status === 'rejected').length;
  const busy = resolveAll.isPending;
  const mail = actions.some((a) => a && isMailAction(a));

  return (
    <div
      className={cn(
        'relative flex flex-col rounded-control fill-panel shadow-[0_1px_2px_var(--shadow-soft),0_10px_30px_-18px_var(--shadow-deep)] stroke-lit',
        targeted && pending.length > 0 && 'ring-2 ring-ring/40',
      )}
    >
      <div className="flex flex-wrap items-center gap-2 border-b px-3.5 py-2.5">
        <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          {kind ? titles[kind] : 'Changes'}
          <Count value={ids.length} />
        </p>
        <div className="ml-auto flex items-center gap-1.5">
          {pending.length > 0 ? (
            <>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => resolveAll.mutate({ ids: pending, decision: 'reject' })}
              >
                Reject all
                {targeted && <Kbd className="ml-1">{modShortcut('⌫')}</Kbd>}
              </Button>
              <Button
                size="sm"
                disabled={busy}
                onClick={() => resolveAll.mutate({ ids: pending, decision: 'confirm' })}
              >
                {busy && <LoaderCircle className="animate-spin" />}
                {pending.length === ids.length
                  ? `Confirm all ${ids.length}`
                  : `Confirm ${pending.length} left`}
                {targeted && (
                  <Kbd className="ml-1 bg-white/15 text-inherit">{modShortcut('↵')}</Kbd>
                )}
              </Button>
            </>
          ) : (
            actions.every(Boolean) && (
              <span className="text-xs text-muted-foreground">
                {[
                  done > 0 && `${done} done`,
                  rejected > 0 && `${rejected} rejected`,
                  failed > 0 && `${failed} could not be applied`,
                ]
                  .filter(Boolean)
                  .join(', ')}
              </span>
            )
          )}
        </div>
      </div>
      <ul
        className={cn(
          'scroll-fade flex flex-col overflow-y-auto p-1',
          mail ? 'max-h-[min(36rem,60vh)]' : 'max-h-[min(24rem,45vh)]',
        )}
      >
        {proposals.map((p, i) => (
          <BatchRow
            key={p.pendingActionId}
            id={p.pendingActionId}
            summary={p.summary}
            action={actions[i]}
            showKind={!kind}
            locked={busy}
          />
        ))}
      </ul>
      {resolveAll.isError && (
        <p className="border-t px-3.5 py-2 text-xs text-destructive">{resolveAll.error.message}</p>
      )}
    </div>
  );
}

function BatchRow({
  id,
  summary,
  action,
  showKind,
  locked,
}: {
  id: string;
  summary: string;
  action: PendingAction | undefined;
  /** Name the kind of change on the row, when the batch mixes kinds. */
  showKind: boolean;
  locked: boolean;
}) {
  const resolve = useResolvePendingAction(id);
  const current = resolve.data ?? action;
  const result = current && current.status !== 'pending' ? outcome[current.status] : null;
  const bookingId =
    current && (current.kind !== 'create_hold' || current.status === 'confirmed')
      ? current.bookingId
      : null;
  const line = current ? changeLine(current) : null;
  const detail = [showKind && current ? titles[current.kind] : null, line]
    .filter(Boolean)
    .join(' · ');

  const buttons = (
    <div className="flex shrink-0 items-center justify-end gap-0.5">
      {current?.status === 'pending' ? (
        <>
          {current.details?.note && (
            <Tip label={current.details.note}>
              <span className="mr-1 flex">
                <CircleAlert className="size-3.5 text-warning" />
              </span>
            </Tip>
          )}
          <Tip label="Reject">
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Reject"
              disabled={locked || resolve.isPending}
              onClick={() => resolve.mutate('reject')}
            >
              <X />
            </Button>
          </Tip>
          <Tip label="Confirm">
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Confirm"
              disabled={locked || resolve.isPending}
              onClick={() => resolve.mutate('confirm')}
            >
              <Check />
            </Button>
          </Tip>
        </>
      ) : result && current ? (
        <Tip label={current.error ? `${result.text}: ${current.error}` : result.text}>
          <span className="flex px-2">
            <result.icon className={cn('size-4', result.className)} aria-label={result.text} />
          </span>
        </Tip>
      ) : (
        <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
      )}
    </div>
  );

  if (current && isMailAction(current)) {
    return (
      <li
        className={cn(
          'border-b border-border/60 px-2.5 py-3 last:border-b-0',
          current.status === 'rejected' && 'opacity-60',
        )}
      >
        <MailPreview
          action={current}
          lines={4}
          actions={buttons}
          onEdit={
            current.status === 'pending' && !locked && !resolve.isPending
              ? () => resolve.mutate('reject')
              : undefined
          }
        />
      </li>
    );
  }

  return (
    <li className={cn('flex items-center gap-1', current?.status === 'rejected' && 'opacity-60')}>
      <div className="min-w-0 flex-1">
        {bookingId ? (
          <BookingRow id={bookingId}>{detail || undefined}</BookingRow>
        ) : (
          <p className="px-2.5 py-2 text-sm">
            {current?.summary ?? summary}
            {detail && <span className="block text-xs text-muted-foreground">{detail}</span>}
          </p>
        )}
      </div>
      <div className="w-16 shrink-0 pr-1.5">{buttons}</div>
    </li>
  );
}
