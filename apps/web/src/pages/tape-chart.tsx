import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { Booking, BookingStatus, Room, RoomStatus } from '@orbit/shared';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useRef } from 'react';
import { useSearchParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useBookingDrawer } from '@/hooks/use-booking-drawer';
import {
  useBookings,
  useChangeBookingDates,
  useDayOverview,
  useGuests,
  useRescheduleBooking,
  useRooms,
} from '@/lib/api';
import { formatDate, formatRange, statusLabels } from '@/lib/format';
import {
  addDaysIso,
  buildWindow,
  isIsoDate,
  isWeekend,
  moveTarget,
  placeBooking,
  resizeTarget,
  TAPE_DAYS,
} from '@/lib/tape-chart';
import { cn } from '@/lib/utils';

const ROOM_COL = 128;
const DAY_COL = 72;

const barClasses: Record<Exclude<BookingStatus, 'cancelled'>, string> = {
  hold: 'border border-dashed border-foreground/40 bg-muted text-muted-foreground',
  confirmed: 'bg-primary/25 text-foreground hover:bg-primary/35 dark:bg-primary/35',
  checked_in: 'bg-primary text-primary-foreground hover:bg-primary/85',
  checked_out: 'bg-muted text-muted-foreground hover:bg-muted/70',
};

/** Statuses whose bars can be dragged; the API still checks every rule. */
const movable: BookingStatus[] = ['hold', 'confirmed', 'checked_in'];

const roomStatusLabels: Record<RoomStatus, string> = {
  clean: 'Clean',
  dirty: 'Dirty',
  inspected: 'Inspected',
  out_of_order: 'Out of order',
};

export function TapeChartPage() {
  // Today comes from the API, so it is the hotel's date (Europe/Prague), not the browser's.
  const day = useDayOverview();
  const today = day.data?.date;
  if (day.isError) return <p className="text-destructive">{day.error.message}</p>;
  if (!today) return <Skeleton className="h-96 w-full" />;
  return <TapeChart today={today} />;
}

function TapeChart({ today }: { today: string }) {
  const [params, setParams] = useSearchParams();
  const fromParam = params.get('from');
  const start = isIsoDate(fromParam) ? fromParam : today;
  const days = buildWindow(start);
  const end = addDaysIso(start, TAPE_DAYS);

  const rooms = useRooms();
  const guests = useGuests();
  const bookings = useBookings({ from: start, to: end });
  const reschedule = useRescheduleBooking();
  const changeDates = useChangeBookingDates();
  const { open } = useBookingDrawer();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  // A drag ends with a click on the bar; this keeps that click from opening the drawer.
  const dragged = useRef(false);

  const shift = (delta: number) =>
    setParams((p) => {
      p.set('from', addDaysIso(start, delta));
      return p;
    });
  const goToday = () =>
    setParams((p) => {
      p.set('from', today);
      return p;
    });

  const guestName = (id: string) => guests.data?.find((g) => g.id === id)?.name ?? 'Unknown guest';
  const visible = (bookings.data ?? []).filter((b) => b.status !== 'cancelled');
  const byRoom = new Map<string, Booking[]>();
  for (const booking of visible) {
    const list = byRoom.get(booking.roomId) ?? [];
    list.push(booking);
    byRoom.set(booking.roomId, list);
  }
  const occupied = (d: string) => visible.filter((b) => b.checkIn <= d && d < b.checkOut).length;

  function onDragEnd({ active, delta, over }: DragEndEvent) {
    setTimeout(() => (dragged.current = false), 0);
    const [mode, id] = String(active.id).split(':');
    const booking = visible.find((b) => b.id === id);
    if (!booking) return;
    reschedule.reset();
    changeDates.reset();
    if (mode === 'move') {
      const target = moveTarget(booking, delta.x, DAY_COL, over ? String(over.id) : null);
      if (target) reschedule.mutate({ id: booking.id, ...target });
    } else {
      const checkOut = resizeTarget(booking, delta.x, DAY_COL);
      if (checkOut) changeDates.mutate({ id: booking.id, checkIn: booking.checkIn, checkOut });
    }
  }

  const error = reschedule.error ?? changeDates.error;
  const busy = reschedule.isPending || changeDates.isPending;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          aria-label="Previous 14 days"
          onClick={() => shift(-TAPE_DAYS)}
        >
          <ChevronLeft />
        </Button>
        <Button variant="outline" onClick={goToday}>
          Today
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label="Next 14 days"
          onClick={() => shift(TAPE_DAYS)}
        >
          <ChevronRight />
        </Button>
        <p className="text-sm font-medium">{formatRange(start, addDaysIso(end, -1))}</p>
        {busy && <p className="text-sm text-muted-foreground">Saving…</p>}
        <Legend />
      </div>
      <p className="text-xs text-muted-foreground">
        Drag a booking to another room or day. Drag its right edge to change the departure.
      </p>

      {error && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/40 px-3 py-2 text-sm text-destructive">
          {error.message}
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto size-6"
            aria-label="Dismiss"
            onClick={() => {
              reschedule.reset();
              changeDates.reset();
            }}
          >
            <X />
          </Button>
        </div>
      )}

      {bookings.isError || rooms.isError || guests.isError ? (
        <p className="text-destructive">
          {(bookings.error ?? rooms.error ?? guests.error)?.message}
        </p>
      ) : !rooms.data || !bookings.data ? (
        <Skeleton className="h-96 w-full" />
      ) : rooms.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">No rooms.</p>
      ) : (
        <DndContext
          sensors={sensors}
          onDragStart={() => (dragged.current = true)}
          onDragEnd={onDragEnd}
          onDragCancel={() => (dragged.current = false)}
        >
          <div className="overflow-x-auto rounded-lg border">
            <div style={{ width: ROOM_COL + TAPE_DAYS * DAY_COL }}>
              <DayHeader days={days} today={today} occupied={occupied} />
              {rooms.data.map((room) => (
                <RoomRow
                  key={room.id}
                  room={room}
                  days={days}
                  today={today}
                  start={start}
                  bookings={byRoom.get(room.id) ?? []}
                  guestName={guestName}
                  onOpen={(id) => !dragged.current && open(id)}
                  disabled={busy}
                />
              ))}
            </div>
          </div>
        </DndContext>
      )}
    </div>
  );
}

function DayHeader({
  days,
  today,
  occupied,
}: {
  days: string[];
  today: string;
  occupied: (day: string) => number;
}) {
  return (
    <div className="flex border-b bg-card">
      <div
        className="sticky left-0 z-10 shrink-0 border-r bg-card px-3 py-2 text-xs font-medium text-muted-foreground"
        style={{ width: ROOM_COL }}
      >
        Room
      </div>
      {days.map((day) => (
        <div
          key={day}
          className={cn(
            'shrink-0 border-r px-1 py-1 text-center last:border-r-0',
            isWeekend(day) && 'bg-muted/50',
            day === today && 'bg-primary/10',
          )}
          style={{ width: DAY_COL }}
        >
          <p
            className={cn(
              'text-xs',
              day === today ? 'font-semibold text-primary' : 'text-muted-foreground',
            )}
          >
            {formatDate(day)}
          </p>
          <p className="text-[11px] text-muted-foreground">{occupied(day)} occ.</p>
        </div>
      ))}
    </div>
  );
}

function RoomRow({
  room,
  days,
  today,
  start,
  bookings,
  guestName,
  onOpen,
  disabled,
}: {
  room: Room;
  days: string[];
  today: string;
  start: string;
  bookings: Booking[];
  guestName: (id: string) => string;
  onOpen: (id: string) => void;
  disabled: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: room.id });
  return (
    <div className="relative flex border-b last:border-b-0">
      <div
        className="sticky left-0 z-10 flex shrink-0 flex-col justify-center border-r bg-card px-3"
        style={{ width: ROOM_COL }}
      >
        <span className="text-sm font-medium">{room.name}</span>
        <span className="text-[11px] text-muted-foreground">
          Floor {room.floor} · {roomStatusLabels[room.status]}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={cn('relative flex', isOver && 'bg-primary/5')}
        style={{ width: TAPE_DAYS * DAY_COL, height: 52 }}
      >
        {days.map((day) => (
          <div
            key={day}
            className={cn(
              'h-full shrink-0 border-r last:border-r-0',
              isWeekend(day) && 'bg-muted/50',
              day === today && 'bg-primary/10',
            )}
            style={{ width: DAY_COL }}
          />
        ))}
        {bookings.map((booking) => (
          <BookingBar
            key={booking.id}
            booking={booking}
            start={start}
            name={guestName(booking.guestId)}
            onOpen={onOpen}
            disabled={disabled}
          />
        ))}
      </div>
    </div>
  );
}

function BookingBar({
  booking,
  start,
  name,
  onOpen,
  disabled,
}: {
  booking: Booking;
  start: string;
  name: string;
  onOpen: (id: string) => void;
  disabled: boolean;
}) {
  const canDrag = !disabled && movable.includes(booking.status);
  const {
    setNodeRef: moveRef,
    listeners: moveListeners,
    attributes: moveAttributes,
    transform: moveTransform,
    isDragging: moving,
  } = useDraggable({ id: `move:${booking.id}`, disabled: !canDrag });
  const {
    setNodeRef: resizeRef,
    listeners: resizeListeners,
    attributes: resizeAttributes,
    transform: resizeTransform,
    isDragging: resizing,
  } = useDraggable({ id: `resize:${booking.id}`, disabled: !canDrag });
  const place = placeBooking(booking, start);
  if (!place || booking.status === 'cancelled') return null;

  const label = `${name}, ${formatRange(booking.checkIn, booking.checkOut)}, ${statusLabels[booking.status]}`;
  const left = place.startIndex * DAY_COL + 2;
  // While resizing, the bar follows the pointer horizontally, never narrower than one night.
  const width = Math.max(place.span * DAY_COL - 4 + (resizeTransform?.x ?? 0), DAY_COL - 4);
  const dragging = moving || resizing;

  return (
    <>
      <button
        ref={moveRef}
        type="button"
        title={label}
        aria-label={label}
        onClick={() => onOpen(booking.id)}
        {...moveListeners}
        {...moveAttributes}
        className={cn(
          'absolute top-1.5 bottom-1.5 truncate rounded-md px-2 text-left text-xs font-medium',
          barClasses[booking.status],
          canDrag && 'cursor-grab active:cursor-grabbing',
          dragging && 'z-20 opacity-80 shadow-lg',
        )}
        style={{
          left,
          width,
          transform: moveTransform
            ? `translate3d(${moveTransform.x}px, ${moveTransform.y}px, 0)`
            : undefined,
        }}
      >
        {place.continuesBefore ? '‹ ' : ''}
        {name}
        {place.continuesAfter ? ' ›' : ''}
      </button>
      {canDrag && !place.continuesAfter && !moving && (
        <span
          ref={resizeRef}
          {...resizeListeners}
          {...resizeAttributes}
          aria-label={`Change departure of ${name}`}
          className="absolute top-1.5 bottom-1.5 z-10 w-2 cursor-ew-resize rounded-r-md hover:bg-foreground/20"
          style={{ left: left + width - 8 }}
        />
      )}
    </>
  );
}

function Legend() {
  const items: Exclude<BookingStatus, 'cancelled'>[] = [
    'hold',
    'confirmed',
    'checked_in',
    'checked_out',
  ];
  return (
    <ul className="ml-auto flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
      {items.map((status) => (
        <li key={status} className="flex items-center gap-1.5">
          <span className={cn('h-3 w-5 rounded-sm', barClasses[status])} />
          {statusLabels[status]}
        </li>
      ))}
    </ul>
  );
}
