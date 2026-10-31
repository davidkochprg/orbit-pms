import type { KnockOn } from '@orbit/shared';
import { useEffect, useRef } from 'react';
import { RoomBadge } from '@/components/agent-mention';
import { ErrorNotice } from '@/components/error-notice';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useBookingDrawer } from '@/hooks/use-booking-drawer';
import { useToast } from '@/hooks/use-toast';
import { useKnockOns, useRelocate } from '@/lib/api';
import { formatRange } from '@/lib/format';

type Relocation = Extract<KnockOn, { kind: 'relocate' }>;

/**
 * The stays booked into a room that went out of order, each with the free room it can move to,
 * and a button that moves them all. Opened from Today's list or right after marking the room.
 */
export function RelocateDialog({
  knockOn,
  open,
  onOpenChange,
}: {
  knockOn: Relocation;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const relocate = useRelocate();
  const { open: openBooking } = useBookingDrawer();
  const { toast } = useToast();
  const movable = knockOn.moves.flatMap((m) =>
    m.toRoomId ? [{ bookingId: m.bookingId, roomId: m.toRoomId }] : [],
  );
  const count = knockOn.moves.length;
  const moveButton = useRef<HTMLButtonElement>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="shadow-floating sm:max-w-md"
        // Focus starts on the action rather than the first guest's name.
        onOpenAutoFocus={(e) => {
          if (!moveButton.current) return;
          e.preventDefault();
          moveButton.current.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Room {knockOn.roomName} is out of order</DialogTitle>
          <DialogDescription>
            {count === 1 ? 'One stay is' : `${count} stays are`} booked into it.
          </DialogDescription>
        </DialogHeader>
        <ul className="-mx-2 flex flex-col text-sm">
          {knockOn.moves.map((m) => (
            <li key={m.bookingId} className="flex items-center gap-3 rounded-lg px-2 py-1.5">
              <button
                type="button"
                onClick={() => {
                  onOpenChange(false);
                  openBooking(m.bookingId);
                }}
                className="flex min-w-0 flex-1 flex-col text-left [&:hover>span:first-child]:underline"
              >
                <span className="truncate">{m.guestName}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {formatRange(m.checkIn, m.checkOut)}
                  {m.status === 'checked_in' && ' · in house'}
                </span>
              </button>
              {m.toRoomName ? (
                <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                  {!m.sameType && 'Other type'}
                  <RoomBadge name={m.toRoomName} />
                </span>
              ) : (
                <span className="shrink-0 text-xs text-warning">No free room</span>
              )}
            </li>
          ))}
        </ul>
        {relocate.error && <ErrorNotice message={relocate.error.message} />}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Not now
          </Button>
          {movable.length > 0 && (
            <Button
              ref={moveButton}
              disabled={relocate.isPending}
              onClick={() =>
                relocate.mutate(movable, {
                  onSuccess: (moved) => {
                    onOpenChange(false);
                    toast({
                      title: `Moved ${moved.length} ${moved.length === 1 ? 'stay' : 'stays'}`,
                    });
                  },
                })
              }
            >
              {movable.length === 1 ? 'Move the stay' : `Move ${movable.length} stays`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * After a room is marked out of order: once the knock-ons have been worked out again, offers to
 * move the stays booked into it, or lets go when there are none.
 */
export function RelocateAfterMarking({
  marked,
  onDone,
}: {
  /** The room just marked, and when the change started, so older knock-ons don't count. */
  marked: { roomId: string; at: number } | null;
  onDone: () => void;
}) {
  const knockOns = useKnockOns();
  const fresh = marked !== null && knockOns.dataUpdatedAt > marked.at;
  const found = fresh
    ? knockOns.data?.find(
        (k): k is Relocation => k.kind === 'relocate' && k.roomId === marked.roomId,
      )
    : undefined;

  useEffect(() => {
    if (fresh && !found) onDone();
  }, [fresh, found, onDone]);

  if (!found) return null;
  return <RelocateDialog knockOn={found} open onOpenChange={(open) => !open && onDone()} />;
}
