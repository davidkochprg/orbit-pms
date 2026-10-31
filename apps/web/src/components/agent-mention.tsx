import { BrushCleaning, CalendarPlus, CalendarRange, Mail } from 'lucide-react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { BookingContextMenu } from '@/components/booking-menu';
import { GuestAvatar } from '@/components/guest-avatar';
import { StatusDot } from '@/components/status-dot';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAgentEntity } from '@/hooks/use-agent-entities';
import { useBookingEditor } from '@/hooks/use-booking-editor';
import { useCommandPalette } from '@/hooks/use-command-palette';
import {
  type BookingEntity,
  type ConversationEntity,
  entityKind,
  type GuestEntity,
  type RoomEntity,
} from '@/lib/agent-answer';
import { useBookingDetail, useInquiry, useRooms, useRoomTypes } from '@/lib/api';
import { senderLabel } from '@/lib/inbox';
import { formatParty, formatRange, statusLabels } from '@/lib/format';
import { bookingStatusColor, roomStatusColor, roomStatusLabels } from '@/lib/status';
import { cn } from '@/lib/utils';
import { Tip } from '@/components/ui/tooltip';

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

/** Opens a booking in the inspector; the conversation comes back when it closes. */
function useOpenBooking() {
  return useCommandPalette().openBooking;
}

export function RoomBadge({ name }: { name: string }) {
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
      <Tip
        label={
          b.checkIn && b.checkOut
            ? `${formatRange(b.checkIn, b.checkOut)}${b.status ? ` · ${statusLabels[b.status]}` : ''}`
            : undefined
        }
      >
        <button type="button" onClick={() => openBooking(id)} className={chip}>
          <GuestAvatar name={b.guestName ?? '?'} className="size-5 text-[8px]" />
          <span className="truncate">{b.guestName ?? 'Booking'}</span>
          {b.roomName && <RoomBadge name={b.roomName} />}
        </button>
      </Tip>
    </BookingContextMenu>
  );
}

/** A room from hotel data, named as the tools named it until rooms have loaded. */
function useRoom(id: string) {
  const known = useAgentEntity(id) as RoomEntity | undefined;
  const room = useRooms().data?.find((r) => r.id === id);
  const typeName = useRoomTypes().data?.find((t) => t.id === room?.roomTypeId)?.name;
  return { room, typeName, name: room?.name ?? known?.name ?? id };
}

/** What a room's status and type are, and where to take it from here, opened from a chip or row. */
function RoomMenu({ id, children }: { id: string; children: ReactNode }) {
  const { room, typeName, name } = useRoom(id);
  const navigate = useNavigate();
  const { closePalette } = useCommandPalette();
  const { openNew } = useBookingEditor();
  const go = (path: string) => {
    closePalette();
    void navigate(path);
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel className="flex flex-col gap-0.5 font-normal">
          <span className="font-medium">Room {name}</span>
          {room && (
            <span className="text-xs text-muted-foreground">
              {[typeName, roomStatusLabels[room.status]].filter(Boolean).join(' · ')}
            </span>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            closePalette();
            openNew({ roomId: id });
          }}
        >
          <CalendarPlus /> New booking in this room
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => go('/tape-chart')}>
          <CalendarRange /> Tape chart
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => go('/housekeeping')}>
          <BrushCleaning /> Housekeeping
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function RoomChip({ id }: { id: string }) {
  const { room, name } = useRoom(id);
  return (
    <RoomMenu id={id}>
      <Tip label={room ? roomStatusLabels[room.status] : undefined}>
        <button type="button" className={cn(chip, 'pl-2')}>
          {room && <StatusDot className={roomStatusColor[room.status]} />}
          Room <span className="font-mono">{name}</span>
        </button>
      </Tip>
    </RoomMenu>
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

function ConversationChip({ id }: { id: string }) {
  const known = useAgentEntity(id) as ConversationEntity | undefined;
  // Mentioned from the page's context rather than a tool result: read who it is with.
  const fetched = useInquiry(known?.name ? undefined : id).data;
  const name = known?.name ?? (fetched && senderLabel(fetched));
  const navigate = useNavigate();
  const { closePalette } = useCommandPalette();
  return (
    <button
      type="button"
      onClick={() => {
        closePalette();
        void navigate(`/inbox/${encodeURIComponent(id)}`);
      }}
      className={cn(chip, 'pl-1.5')}
    >
      <Mail className="size-3.5 text-muted-foreground" />
      <span className="truncate">{name ?? 'Conversation'}</span>
    </button>
  );
}

/** A booking, room, guest or conversation the agent mentioned, as a chip that opens it. */
export function Mention({ id }: { id: string }) {
  switch (entityKind(id)) {
    case 'booking':
      return <BookingChip id={id} />;
    case 'room':
      return <RoomChip id={id} />;
    case 'guest':
      return <GuestChip id={id} />;
    case 'conversation':
      return <ConversationChip id={id} />;
    default:
      return <span className="font-mono text-xs">{id}</span>;
  }
}

/**
 * A list item that leads with a booking: the guest, room, dates and status from hotel data, and
 * what the agent said about it underneath. Click opens the booking; right-click has its actions.
 */
export function BookingRow({ id, children }: { id: string; children?: ReactNode }) {
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
              <Tip label={statusLabels[b.status]}>
                <span className="flex">
                  <StatusDot className={bookingStatusColor[b.status]} />
                </span>
              </Tip>
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

/**
 * A list item that leads with a room: its name, type and housekeeping status from hotel data, and
 * what the agent said about it underneath. Click opens the room's menu.
 */
export function RoomRow({ id, children }: { id: string; children?: ReactNode }) {
  const { room, typeName, name } = useRoom(id);
  return (
    <RoomMenu id={id}>
      <button
        type="button"
        className="group flex w-full items-center gap-3 rounded-control px-2.5 py-2 text-left outline-none transition-colors hover:bg-accent focus-visible:bg-accent"
      >
        <RoomBadge name={name} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate">{typeName ?? `Room ${name}`}</span>
          {children && <span className="text-xs text-muted-foreground">{children}</span>}
        </span>
        {room && (
          <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
            <StatusDot className={roomStatusColor[room.status]} />
            {roomStatusLabels[room.status]}
          </span>
        )}
      </button>
    </RoomMenu>
  );
}
