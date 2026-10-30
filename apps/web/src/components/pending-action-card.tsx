import type { PendingAction, PendingActionDetails, PendingValue } from '@orbit/shared';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import { ArrowRight, Check, CircleAlert, X } from 'lucide-react';
import { Link } from 'react-router';
import { BookingRow } from '@/components/agent-mention';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { useCommandPalette } from '@/hooks/use-command-palette';
import {
  useConfirmPendingActions,
  usePendingAction,
  usePendingActions,
  useResolvePendingAction,
} from '@/lib/api';
import { formatMoney, formatRange } from '@/lib/format';
import { cn } from '@/lib/utils';

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
  adjust_rates: 'Change rates',
  save_hotel_info: 'Save to Knowledge',
  remove_hotel_info: 'Delete from Knowledge',
  send_reply: 'Send a reply',
  hold_inquiry: 'Hold a room for the request',
  decline_inquiry: 'Decline the request',
  add_local_event: 'Add a local event',
  remove_local_event: 'Remove a local event',
  update_room: 'Change the room',
  save_contact: 'Save a contact',
  remove_contact: 'Delete a contact',
};

/** The conversation an action is about, to open once it is done. */
function conversationOf(action: PendingAction): string | null {
  switch (action.kind) {
    case 'send_reply':
    case 'hold_inquiry':
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
  /** The change ⌘↵ confirms and ⌘⌫ rejects: outlined, with the shortcuts on its buttons. */
  targeted?: boolean;
}) {
  const action = usePendingAction(id);
  const resolve = useResolvePendingAction(id);
  const { closePalette, openBooking } = useCommandPalette();
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
          {current.kind === 'send_reply' ? (
            <p className="rounded-lg bg-ink/4 px-3 py-2 text-sm leading-6 whitespace-pre-line">
              {current.input.body}
            </p>
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
              {targeted && <Kbd className="ml-1 bg-white/15 text-inherit">⌘↵</Kbd>}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={resolve.isPending}
              onClick={() => resolve.mutate('reject')}
            >
              Reject
              {targeted && <Kbd className="ml-1">⌘⌫</Kbd>}
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
          <Button size="sm" variant="ghost" className="ml-auto" asChild>
            <Link
              to={`/guests/${encodeURIComponent(current.input.guestId)}`}
              onClick={closePalette}
            >
              Open profile
            </Link>
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

/** "Confirm all 3" for an answer that proposed several changes; shown while any still wait. */
export function ConfirmAllButton({ ids }: { ids: string[] }) {
  const actions = usePendingActions(ids);
  const confirm = useConfirmPendingActions();
  const pending = ids.filter((_, i) => actions[i]?.data?.status === 'pending');
  if (pending.length < 2) return null;
  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        disabled={confirm.isPending}
        onClick={() => confirm.mutate(pending)}
      >
        Confirm all {pending.length}
      </Button>
      {confirm.isError && <span className="text-xs text-destructive">{confirm.error.message}</span>}
    </div>
  );
}
