import type { KnockOn } from '@orbit/shared';
import { BedDouble, CalendarCheck, X } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { useNavigate } from 'react-router';
import { RoomBadge } from '@/components/agent-mention';
import { ErrorNotice } from '@/components/error-notice';
import { Button } from '@/components/ui/button';
import { useBookingDrawer } from '@/hooks/use-booking-drawer';
import { useToast } from '@/hooks/use-toast';
import { useKnockOns, useRefreshInboxRooms, useRelocate } from '@/lib/api';
import { formatMoney, formatRange } from '@/lib/format';

const DISMISSED_KEY = 'orbit.knockOns.dismissed';

function loadDismissed(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * What a change made worth doing next, in the corner of whatever page staff are on: stays to move
 * out of a room that went out of order, a request a room is free for again. Each has its fix one
 * click away; "Not now" hides it until the situation changes.
 */
export function KnockOnStack() {
  const knockOns = useKnockOns();
  const [dismissed, setDismissed] = useState(loadDismissed);
  const shown = (knockOns.data ?? []).filter((k) => !dismissed.includes(k.id)).slice(0, 2);
  if (shown.length === 0) return null;

  const dismiss = (id: string) => {
    // Only what is still showing is worth remembering.
    const next = [...dismissed.filter((d) => knockOns.data?.some((k) => k.id === d)), id];
    setDismissed(next);
    try {
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
    } catch {
      // Hidden for this visit only.
    }
  };

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
    >
      {shown.map((k) =>
        k.kind === 'relocate' ? (
          <Relocate key={k.id} knockOn={k} onDismiss={() => dismiss(k.id)} />
        ) : (
          <Opening key={k.id} knockOn={k} onDismiss={() => dismiss(k.id)} />
        ),
      )}
    </div>
  );
}

function Card({
  icon,
  title,
  onDismiss,
  children,
}: {
  icon: ReactNode;
  title: string;
  onDismiss: () => void;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="pointer-events-auto flex flex-col gap-3 rounded-stage bg-popover p-3.5 text-sm shadow-floating stroke-lit motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2"
    >
      <header className="flex items-center gap-2">
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-warning/12 text-warning [&_svg]:size-3.5">
          {icon}
        </span>
        <h2 className="min-w-0 flex-1 truncate font-medium">{title}</h2>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Not now"
          title="Not now"
          onClick={onDismiss}
          className="-mr-1 text-muted-foreground"
        >
          <X />
        </Button>
      </header>
      {children}
    </section>
  );
}

function Relocate({
  knockOn,
  onDismiss,
}: {
  knockOn: Extract<KnockOn, { kind: 'relocate' }>;
  onDismiss: () => void;
}) {
  const relocate = useRelocate();
  const { open } = useBookingDrawer();
  const { toast } = useToast();
  const movable = knockOn.moves.flatMap((m) =>
    m.toRoomId ? [{ bookingId: m.bookingId, roomId: m.toRoomId }] : [],
  );

  return (
    <Card
      icon={<BedDouble />}
      title={`Room ${knockOn.roomName} is out of order`}
      onDismiss={onDismiss}
    >
      <ul className="flex flex-col gap-1.5">
        {knockOn.moves.map((m) => (
          <li key={m.bookingId} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => open(m.bookingId)}
              className="flex min-w-0 flex-1 flex-col text-left hover:underline-offset-2 [&:hover>span:first-child]:underline"
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
      {movable.length > 0 && (
        <Button
          size="sm"
          className="self-end"
          disabled={relocate.isPending}
          onClick={() =>
            relocate.mutate(movable, {
              onSuccess: (moved) =>
                toast({ title: `Moved ${moved.length} ${moved.length === 1 ? 'stay' : 'stays'}` }),
            })
          }
        >
          {movable.length === 1 ? 'Move the stay' : `Move ${movable.length} stays`}
        </Button>
      )}
    </Card>
  );
}

function Opening({
  knockOn,
  onDismiss,
}: {
  knockOn: Extract<KnockOn, { kind: 'opening' }>;
  onDismiss: () => void;
}) {
  const refresh = useRefreshInboxRooms();
  const navigate = useNavigate();

  return (
    <Card
      icon={<CalendarCheck />}
      title={`A room is free for ${knockOn.guestName}`}
      onDismiss={onDismiss}
    >
      <p className="text-muted-foreground">
        {formatRange(knockOn.checkIn, knockOn.checkOut)} ·{' '}
        {knockOn.rooms === 1 ? '1 option' : `${knockOn.rooms} options`}, from{' '}
        {formatMoney(knockOn.fromTotal)}
      </p>
      {refresh.error && <ErrorNotice message={refresh.error.message} />}
      <Button
        size="sm"
        className="self-end"
        disabled={refresh.isPending}
        onClick={() =>
          refresh.mutate(knockOn.inquiryId, {
            onSuccess: () => void navigate(`/inbox/${knockOn.inquiryId}`),
          })
        }
      >
        Offer a room
      </Button>
    </Card>
  );
}
