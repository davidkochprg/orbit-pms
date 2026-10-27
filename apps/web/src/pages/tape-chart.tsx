import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { Booking, BookingStatus, Room } from '@orbit/shared';
import {
  Baby,
  Bath,
  ChevronLeft,
  ChevronRight,
  Clock,
  Dog,
  Globe,
  LoaderCircle,
  type LucideIcon,
  StickyNote,
} from 'lucide-react';
import { useRef } from 'react';
import { useSearchParams } from 'react-router';
import { EmptyState } from '@/components/empty-state';
import { ErrorNotice } from '@/components/error-notice';
import { PageHeader } from '@/components/page-header';
import { RoomStatusDot } from '@/components/room-status-dot';
import { StatusDot } from '@/components/status-dot';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useBookingDrawer } from '@/hooks/use-booking-drawer';
import { useElementWidth } from '@/hooks/use-element-width';
import {
  useBookings,
  useChangeBookingDates,
  useDayOverview,
  useGuests,
  useRescheduleBooking,
  useRooms,
  useRoomTypes,
} from '@/lib/api';
import { formatDayHeader, formatRange, statusLabels } from '@/lib/format';
import { bookingStatusColor, groupRoomsByType, type RoomGroup } from '@/lib/status';
import {
  addDaysIso,
  buildWindow,
  dayWidthFor,
  isIsoDate,
  isWeekend,
  moveTarget,
  placeBooking,
  resizeTarget,
  TAPE_DAYS,
  TAPE_ROOM_COLUMN,
  TAPE_ROW_HEIGHT,
} from '@/lib/tape-chart';
import { cn } from '@/lib/utils';

type VisibleStatus = Exclude<BookingStatus, 'cancelled'>;

const barStyles: Record<VisibleStatus, string> = {
  hold: 'border border-dashed border-status-hold bg-surface-raised/70',
  confirmed: 'bg-surface-raised shadow-raised',
  checked_in: 'bg-surface-raised shadow-raised',
  checked_out: 'bg-surface-raised/60 text-muted-foreground shadow-raised',
};

/** Statuses whose bars can be dragged; the API still checks every rule. */
const movable: BookingStatus[] = ['hold', 'confirmed', 'checked_in'];

/** Bars narrower than this show only the name. */
const ICONS_MIN_WIDTH = 150;

export function TapeChartPage() {
  // Today comes from the API, so it is the hotel's date (Europe/Prague), not the browser's.
  const day = useDayOverview();
  const today = day.data?.date;
  if (day.isError) {
    return (
      <>
        <PageHeader title="Tape chart" />
        <ErrorNotice message={day.error.message} className="m-6" />
      </>
    );
  }
  if (!today) {
    return (
      <>
        <PageHeader title="Tape chart" />
        <Skeleton className="m-6 h-96" />
      </>
    );
  }
  return <TapeChart today={today} />;
}

function TapeChart({ today }: { today: string }) {
  const [params, setParams] = useSearchParams();
  const fromParam = params.get('from');
  const start = isIsoDate(fromParam) ? fromParam : today;
  const days = buildWindow(start);
  const end = addDaysIso(start, TAPE_DAYS);

  const viewport = useRef<HTMLDivElement>(null);
  const dayWidth = dayWidthFor(useElementWidth(viewport));

  const rooms = useRooms();
  const roomTypes = useRoomTypes();
  const guests = useGuests();
  const bookings = useBookings({ from: start, to: end });
  const reschedule = useRescheduleBooking();
  const changeDates = useChangeBookingDates();
  const { open } = useBookingDrawer();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  // A drag ends with a click on the bar; this keeps that click from opening the inspector.
  const dragged = useRef(false);

  const goTo = (date: string) =>
    setParams((p) => {
      p.set('from', date);
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
  const groups = rooms.data && roomTypes.data ? groupRoomsByType(rooms.data, roomTypes.data) : null;

  function onDragEnd({ active, delta, over }: DragEndEvent) {
    setTimeout(() => (dragged.current = false), 0);
    const [mode, id] = String(active.id).split(':');
    const booking = visible.find((b) => b.id === id);
    if (!booking) return;
    reschedule.reset();
    changeDates.reset();
    if (mode === 'move') {
      const target = moveTarget(booking, delta.x, dayWidth, over ? String(over.id) : null);
      if (target) reschedule.mutate({ id: booking.id, ...target });
    } else {
      const checkOut = resizeTarget(booking, delta.x, dayWidth);
      if (checkOut) changeDates.mutate({ id: booking.id, checkIn: booking.checkIn, checkOut });
    }
  }

  const error = reschedule.error ?? changeDates.error;
  const busy = reschedule.isPending || changeDates.isPending;
  const loadError = bookings.error ?? rooms.error ?? roomTypes.error ?? guests.error;

  return (
    <>
      <PageHeader
        title="Tape chart"
        meta={formatRange(start, addDaysIso(end, -1))}
        actions={
          <>
            {busy && <LoaderCircle className="size-4 animate-spin text-muted-foreground" />}
            <input
              type="date"
              aria-label="Jump to date"
              value={start}
              onChange={(e) => isIsoDate(e.target.value) && goTo(e.target.value)}
              className="h-7 rounded-md border bg-background px-2 text-xs text-muted-foreground shadow-raised outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <div className="flex items-center rounded-md border bg-background shadow-raised">
              <Button
                variant="ghost"
                size="icon-sm"
                className="rounded-r-none"
                aria-label={`Previous ${TAPE_DAYS} days`}
                onClick={() => goTo(addDaysIso(start, -TAPE_DAYS))}
              >
                <ChevronLeft />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="rounded-none border-x"
                onClick={() => goTo(today)}
              >
                Today
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                className="rounded-l-none"
                aria-label={`Next ${TAPE_DAYS} days`}
                onClick={() => goTo(addDaysIso(start, TAPE_DAYS))}
              >
                <ChevronRight />
              </Button>
            </div>
          </>
        }
      />

      {error && (
        <ErrorNotice
          message={error.message}
          className="mx-3 mt-3"
          onDismiss={() => {
            reschedule.reset();
            changeDates.reset();
          }}
        />
      )}

      <div ref={viewport} className="scrollbar-thin relative min-h-0 flex-1 overflow-auto">
        {loadError ? (
          <ErrorNotice message={loadError.message} className="m-6" />
        ) : !groups || !bookings.data ? (
          <Skeleton className="m-6 h-96" />
        ) : groups.length === 0 ? (
          <EmptyState title="No rooms yet" description="Rooms appear here once they are set up." />
        ) : (
          <DndContext
            sensors={sensors}
            onDragStart={() => (dragged.current = true)}
            onDragEnd={onDragEnd}
            onDragCancel={() => (dragged.current = false)}
          >
            <div style={{ width: TAPE_ROOM_COLUMN + TAPE_DAYS * dayWidth }}>
              <DayHeader
                days={days}
                today={today}
                dayWidth={dayWidth}
                occupied={occupied}
                total={rooms.data?.length ?? 0}
              />
              {groups.map((group) => (
                <RoomGroupBlock
                  key={group.label}
                  group={group}
                  days={days}
                  today={today}
                  start={start}
                  dayWidth={dayWidth}
                  byRoom={byRoom}
                  guestName={guestName}
                  onOpen={(id) => !dragged.current && open(id)}
                  disabled={busy}
                />
              ))}
            </div>
          </DndContext>
        )}
      </div>

      <footer className="flex h-9 shrink-0 items-center gap-4 border-t px-4 text-xs text-muted-foreground">
        <span className="hidden truncate md:inline">
          Drag a booking to move it. Drag its right edge to change the departure.
        </span>
        <Legend />
      </footer>
    </>
  );
}

function DayHeader({
  days,
  today,
  dayWidth,
  occupied,
  total,
}: {
  days: string[];
  today: string;
  dayWidth: number;
  occupied: (day: string) => number;
  total: number;
}) {
  return (
    <div className="sticky top-0 z-20 flex h-12 border-b bg-background">
      <div
        className="sticky left-0 z-10 shrink-0 border-r bg-background"
        style={{ width: TAPE_ROOM_COLUMN }}
      />
      {days.map((day) => {
        const { weekday, day: date } = formatDayHeader(day);
        const isToday = day === today;
        return (
          <div
            key={day}
            className={cn(
              'flex shrink-0 flex-col justify-center border-r border-grid-line px-2.5 last:border-r-0',
              isWeekend(day) && 'bg-surface-sunken',
              isToday && 'bg-primary-soft',
            )}
            style={{ width: dayWidth }}
          >
            <span
              className={cn(
                'flex items-center justify-between text-xs',
                isToday ? 'text-primary-text' : 'text-muted-foreground',
              )}
            >
              {weekday}
              <span
                className="text-subtle-foreground tabular-nums"
                title={`${occupied(day)} of ${total} rooms occupied`}
              >
                {total > 0 ? Math.round((occupied(day) / total) * 100) : 0}%
              </span>
            </span>
            <span
              className={cn('text-sm font-medium tabular-nums', isToday && 'text-primary-text')}
            >
              {date}
            </span>
          </div>
        );
      })}
    </div>
  );
}

interface RowProps {
  days: string[];
  today: string;
  start: string;
  dayWidth: number;
  guestName: (id: string) => string;
  onOpen: (id: string) => void;
  disabled: boolean;
}

function RoomGroupBlock({
  group,
  byRoom,
  ...row
}: RowProps & { group: RoomGroup; byRoom: Map<string, Booking[]> }) {
  return (
    <div className="flex border-b last:border-b-0">
      <div
        className="sticky left-0 z-10 flex shrink-0 border-r bg-background"
        style={{ width: TAPE_ROOM_COLUMN }}
      >
        <div className="flex w-7 shrink-0 items-center justify-center border-r border-grid-line">
          <span
            title={group.label}
            className="rotate-180 truncate text-xs font-medium text-subtle-foreground [writing-mode:vertical-rl]"
            style={{ maxHeight: group.rooms.length * TAPE_ROW_HEIGHT - 12 }}
          >
            {group.label}
          </span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          {group.rooms.map((room) => (
            <div
              key={room.id}
              className="flex items-center gap-1.5 border-b border-grid-line px-2 last:border-b-0"
              style={{ height: TAPE_ROW_HEIGHT }}
            >
              <RoomStatusDot status={room.status} />
              <span
                className={cn(
                  'truncate font-medium tabular-nums',
                  room.status === 'out_of_order' && 'text-muted-foreground',
                )}
              >
                {room.name}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-col">
        {group.rooms.map((room) => (
          <RoomLane key={room.id} room={room} bookings={byRoom.get(room.id) ?? []} {...row} />
        ))}
      </div>
    </div>
  );
}

function RoomLane({
  room,
  bookings,
  days,
  today,
  start,
  dayWidth,
  guestName,
  onOpen,
  disabled,
}: RowProps & { room: Room; bookings: Booking[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: room.id });
  return (
    <div
      ref={setNodeRef}
      className="relative flex border-b border-grid-line last:border-b-0"
      style={{ height: TAPE_ROW_HEIGHT }}
    >
      {days.map((day) => (
        <div
          key={day}
          className={cn(
            'h-full shrink-0 border-r border-grid-line last:border-r-0',
            isWeekend(day) && 'bg-surface-sunken',
            day === today && 'bg-primary-soft',
          )}
          style={{ width: dayWidth }}
        />
      ))}
      {room.status === 'out_of_order' && (
        <div className="bg-hatch pointer-events-none absolute inset-0" title="Out of order" />
      )}
      {isOver && <div className="pointer-events-none absolute inset-0 bg-primary-soft" />}
      {bookings.map((booking) => (
        <BookingBar
          key={booking.id}
          booking={booking}
          start={start}
          dayWidth={dayWidth}
          name={guestName(booking.guestId)}
          onOpen={onOpen}
          disabled={disabled}
        />
      ))}
    </div>
  );
}

function bookingIcons(booking: Booking): { icon: LucideIcon; label: string }[] {
  const icons: { icon: LucideIcon; label: string }[] = [];
  if (booking.status === 'hold') icons.push({ icon: Clock, label: 'Hold, not yet confirmed' });
  if (booking.childAges.length > 0) icons.push({ icon: Baby, label: 'Children' });
  if (booking.addons.dogs > 0) icons.push({ icon: Dog, label: 'Dog' });
  if (booking.addons.wellness) icons.push({ icon: Bath, label: 'Wellness' });
  if (booking.source === 'ota') icons.push({ icon: Globe, label: 'Booked via OTA' });
  if (booking.notes) icons.push({ icon: StickyNote, label: 'Has notes' });
  return icons;
}

function BookingBar({
  booking,
  start,
  dayWidth,
  name,
  onOpen,
  disabled,
}: {
  booking: Booking;
  start: string;
  dayWidth: number;
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
  const left = place.startIndex * dayWidth + 2;
  // While resizing, the bar follows the pointer horizontally, never narrower than one night.
  const width = Math.max(place.span * dayWidth - 4 + (resizeTransform?.x ?? 0), dayWidth - 4);
  const dragging = moving || resizing;
  const icons = width >= ICONS_MIN_WIDTH ? bookingIcons(booking) : [];

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
          'absolute top-[5px] bottom-[5px] flex items-center gap-1.5 overflow-hidden rounded-md pr-2 pl-3 text-left text-sm outline-none',
          'transition-shadow hover:shadow-floating focus-visible:ring-2 focus-visible:ring-ring',
          barStyles[booking.status],
          place.continuesBefore && 'rounded-l-none',
          place.continuesAfter && 'rounded-r-none',
          canDrag && 'cursor-grab active:cursor-grabbing',
          dragging && 'z-30 shadow-floating',
        )}
        style={{
          left,
          width,
          transform: moveTransform
            ? `translate3d(${moveTransform.x}px, ${moveTransform.y}px, 0)`
            : undefined,
        }}
      >
        <span
          aria-hidden
          className={cn('absolute inset-y-0 left-0 w-[3px]', bookingStatusColor[booking.status])}
        />
        {place.continuesBefore && (
          <ChevronLeft className="-ml-1 size-3.5 shrink-0 text-muted-foreground" />
        )}
        <span className="truncate font-medium">{name}</span>
        {icons.length > 0 && (
          <span className="ml-auto flex shrink-0 items-center gap-1.5 text-muted-foreground">
            {icons.map(({ icon: Icon, label: iconLabel }) => (
              <Icon key={iconLabel} aria-label={iconLabel} className="size-3.5" />
            ))}
          </span>
        )}
      </button>
      {canDrag && !place.continuesAfter && !moving && (
        <span
          ref={resizeRef}
          {...resizeListeners}
          {...resizeAttributes}
          aria-label={`Change departure of ${name}`}
          className="group/resize absolute top-[5px] bottom-[5px] z-10 flex w-2.5 cursor-ew-resize items-center justify-center"
          style={{ left: left + width - 10 }}
        >
          <span className="h-3.5 w-0.5 rounded-full bg-border-strong opacity-0 group-hover/resize:opacity-100" />
        </span>
      )}
    </>
  );
}

function Legend() {
  const items: VisibleStatus[] = ['hold', 'confirmed', 'checked_in', 'checked_out'];
  return (
    <ul className="ml-auto flex shrink-0 items-center gap-3">
      {items.map((status) => (
        <li key={status} className="flex items-center gap-1.5">
          <StatusDot className={bookingStatusColor[status]} />
          {statusLabels[status]}
        </li>
      ))}
    </ul>
  );
}
