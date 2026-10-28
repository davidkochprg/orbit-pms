import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { BookingContextMenu } from '@/components/booking-menu';
import { GuestAvatar } from '@/components/guest-avatar';
import { StatusDot } from '@/components/status-dot';
import { useAgentEntity } from '@/hooks/use-agent-entities';
import { useBookingDrawer } from '@/hooks/use-booking-drawer';
import { useCommandPalette } from '@/hooks/use-command-palette';
import {
  type BookingEntity,
  entityKind,
  type GuestEntity,
  type RoomEntity,
} from '@/lib/agent-answer';
import { useBookingDetail, useRooms } from '@/lib/api';
import { formatParty, formatRange, statusLabels } from '@/lib/format';
import { bookingStatusColor, roomStatusColor, roomStatusLabels } from '@/lib/status';
import { cn } from '@/lib/utils';

const chip =
  'inline-flex h-6 max-w-full items-center gap-1.5 rounded-full bg-ink/5 py-0 pr-2 pl-0.5 align-middle text-[0.8125rem] leading-none text-foreground outline-none transition-colors hover:bg-ink/9 focus-visible:ring-2 focus-visible:ring-ring';

/**
 * A booking as the tools described it, filled in from the API when the agent mentioned one
 * its tools didn't return (e.g. from earlier in the conversation).
 */
function useBooking(id: string): BookingEntity {
  const known = useAgentEntity(id) as BookingEntity | undefined;
  const fetched = useBookingDetail(known?.guestName ? null : id).data;
  if (!fetched) return known ?? { kind: 'booking', id };
  const { booking, guest, room } = fetched;
  return {
    ...booking,
    kind: 'booking',
    guestName: guest.name,
    roomName: room.name,
  };
}

/** Opens a booking in the inspector, closing the command bar so the inspector is in view. */
function useOpenBooking() {
  const { open } = useBookingDrawer();
  const { closePalette } = useCommandPalette();
  return (id: string) => {
    closePalette();
    open(id);
  };
}

function RoomBadge({ name }: { name: string }) {
  return (
    <span className="rounded-[5px] border border-ink/7 bg-background px-1 py-px font-mono text-[0.6875rem] text-foreground">
      {name}
    </span>
  );
}

function BookingChip({ id }: { id: string }) {
  const b = useBooking(id);
  const openBooking = useOpenBooking();
  return (
    <BookingContextMenu bookingId={id}>
      <button
        type="button"
        onClick={() => openBooking(id)}
        title={
          b.checkIn && b.checkOut
            ? `${formatRange(b.checkIn, b.checkOut)}${b.status ? ` · ${statusLabels[b.status]}` : ''}`
            : undefined
        }
        className={chip}
      >
        <GuestAvatar name={b.guestName ?? '?'} className="size-5 text-[8px]" />
        <span className="truncate">{b.guestName ?? 'Booking'}</span>
        {b.roomName && <RoomBadge name={b.roomName} />}
      </button>
    </BookingContextMenu>
  );
}

function RoomChip({ id }: { id: string }) {
  const known = useAgentEntity(id) as RoomEntity | undefined;
  const room = useRooms().data?.find((r) => r.id === id);
  const navigate = useNavigate();
  const { closePalette } = useCommandPalette();
  const name = room?.name ?? known?.name ?? id;
  return (
    <button
      type="button"
      title={room ? roomStatusLabels[room.status] : undefined}
      onClick={() => {
        closePalette();
        void navigate('/housekeeping');
      }}
      className={cn(chip, 'pl-2')}
    >
      {room && <StatusDot className={roomStatusColor[room.status]} />}
      Room <span className="font-mono">{name}</span>
    </button>
  );
}

function GuestChip({ id }: { id: string }) {
  const known = useAgentEntity(id) as GuestEntity | undefined;
  const navigate = useNavigate();
  const { closePalette } = useCommandPalette();
  return (
    <button
      type="button"
      onClick={() => {
        closePalette();
        void navigate(`/guests/${encodeURIComponent(id)}`);
      }}
      className={chip}
    >
      <GuestAvatar name={known?.name ?? '?'} className="size-5 text-[8px]" />
      <span className="truncate">{known?.name ?? 'Guest'}</span>
    </button>
  );
}

/** A booking, room or guest the agent mentioned, as a chip that opens it. */
export function Mention({ id }: { id: string }) {
  switch (entityKind(id)) {
    case 'booking':
      return <BookingChip id={id} />;
    case 'room':
      return <RoomChip id={id} />;
    case 'guest':
      return <GuestChip id={id} />;
    default:
      return <span className="font-mono text-xs">{id}</span>;
  }
}

/**
 * A list item that leads with a booking: the guest, room, dates and status from hotel data, and
 * what the agent said about it underneath. Click opens the booking; right-click has its actions.
 */
export function BookingRow({ id, children }: { id: string; children: ReactNode }) {
  const b = useBooking(id);
  const openBooking = useOpenBooking();
  return (
    <BookingContextMenu bookingId={id}>
      <button
        type="button"
        onClick={() => openBooking(id)}
        className="group flex w-full items-center gap-3 rounded-control px-2.5 py-2 text-left outline-none transition-colors hover:bg-accent focus-visible:bg-accent"
      >
        <GuestAvatar name={b.guestName ?? '?'} size="md" />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate font-medium">{b.guestName ?? 'Booking'}</span>
          <span className="text-xs text-muted-foreground">
            {children ??
              (b.adults !== undefined && b.childAges ? formatParty(b.adults, b.childAges) : null)}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {b.status && (
              <span title={statusLabels[b.status]} className="flex">
                <StatusDot className={bookingStatusColor[b.status]} />
              </span>
            )}
            {b.roomName && <RoomBadge name={b.roomName} />}
          </span>
          {b.checkIn && b.checkOut && (
            <span className="text-[0.6875rem] text-subtle-foreground tabular-nums">
              {formatRange(b.checkIn, b.checkOut)}
            </span>
          )}
        </span>
      </button>
    </BookingContextMenu>
  );
}
