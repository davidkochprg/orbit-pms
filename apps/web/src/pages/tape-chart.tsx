import {
  DndContext,
  type DragEndEvent,
  type DragMoveEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { Booking, BookingStatus, IsoDate, Room } from '@orbit/shared';
import {
  Baby,
  Bath,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Clock,
  Dog,
  Globe,
  Info,
  LoaderCircle,
  type LucideIcon,
  Plus,
  StickyNote,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { BookingContextMenu } from '@/components/booking-menu';
import { EmptyState } from '@/components/empty-state';
import { ErrorNotice } from '@/components/error-notice';
import { PageHeader } from '@/components/page-header';
import { RoomStatusDot } from '@/components/room-status-dot';
import { StatusDot } from '@/components/status-dot';
import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useBookingDrawer } from '@/hooks/use-booking-drawer';
import { useBookingEditor } from '@/hooks/use-booking-editor';
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
import { formatDate, formatDayHeader, formatRange, statusLabels } from '@/lib/format';
import { bookingStatusColor, groupRoomsByType, type RoomGroup } from '@/lib/status';
import {
  addDaysIso,
  barGeometry,
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
  hold: 'border border-dashed border-status-hold/70 bg-bar-hold',
  confirmed: 'bg-bar-confirmed stroke-lit shadow-[0_1px_2px_var(--shadow-soft)]',
  checked_in: 'bg-bar-checked-in stroke-lit shadow-[0_1px_2px_var(--shadow-soft)]',
  checked_out: 'bg-ink/5 text-muted-foreground',
};

/** Statuses whose bars can be dragged; the API still checks every rule. */
const movable: BookingStatus[] = ['hold', 'confirmed', 'checked_in'];

/** Bars narrower than this show only the name. */
const ICONS_MIN_WIDTH = 150;
/** Narrower than this, a bar is a stub (a departure's morning) and shows only its stripe. */
const LABEL_MIN_WIDTH = 48;

/** Where a bar being dragged would land, or where a dropped one landed while it saves. */
interface DragTarget {
  id: string;
  mode: 'move' | 'resize';
  roomId: string;
  checkIn: IsoDate;
  checkOut: IsoDate;
}

function sameTarget(a: DragTarget | null, b: DragTarget | null): boolean {
  return (
    a === b ||
    (a !== null &&
      b !== null &&
      a.id === b.id &&
      a.roomId === b.roomId &&
      a.checkIn === b.checkIn &&
      a.checkOut === b.checkOut)
  );
}

export function TapeChartPage() {
  // Today comes from the API, so it is the hotel's date in its time zone, not the browser's.
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
  // From the day before, so a stay leaving on the first day still shows its morning.
  const bookings = useBookings({ from: addDaysIso(start, -1), to: end });
  const reschedule = useRescheduleBooking();
  const changeDates = useChangeBookingDates();
  const { open } = useBookingDrawer();
  const { openNew } = useBookingEditor();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  // A drag ends with a click on the bar; this keeps that click from opening the inspector.
  const dragged = useRef(false);
  const [preview, setPreview] = useState<DragTarget | null>(null);
  // A dropped bar stays where it landed until the change is saved, and goes back if it fails.
  const [landed, setLanded] = useState<DragTarget | null>(null);

  const goTo = (date: string) =>
    setParams((p) => {
      p.set('from', date);
      return p;
    });

  const guestName = (id: string) => guests.data?.find((g) => g.id === id)?.name ?? 'Unknown guest';
  const visible = (bookings.data ?? [])
    .filter((b) => b.status !== 'cancelled')
    .map((b) =>
      b.id === landed?.id
        ? { ...b, roomId: landed.roomId, checkIn: landed.checkIn, checkOut: landed.checkOut }
        : b,
    );
  const byRoom = new Map<string, Booking[]>();
  for (const booking of visible) {
    const list = byRoom.get(booking.roomId) ?? [];
    list.push(booking);
    byRoom.set(booking.roomId, list);
  }
  const occupied = (d: string) => visible.filter((b) => b.checkIn <= d && d < b.checkOut).length;
  const groups = rooms.data && roomTypes.data ? groupRoomsByType(rooms.data, roomTypes.data) : null;

  function dragTarget({ active, delta, over }: DragMoveEvent): DragTarget | null {
    const [mode, id] = String(active.id).split(':');
    const booking = visible.find((b) => b.id === id);
    if (!booking) return null;
    if (mode === 'move') {
      const target = moveTarget(booking, delta.x, dayWidth, over ? String(over.id) : null);
      return target && { id: booking.id, mode, ...target };
    }
    const checkOut = resizeTarget(booking, delta.x, dayWidth);
    if (!checkOut) return null;
    return {
      id: booking.id,
      mode: 'resize',
      roomId: booking.roomId,
      checkIn: booking.checkIn,
      checkOut,
    };
  }

  function onDragMove(event: DragMoveEvent) {
    const next = dragTarget(event);
    setPreview((current) => (sameTarget(current, next) ? current : next));
  }

  function onDragEnd(event: DragEndEvent) {
    setTimeout(() => (dragged.current = false), 0);
    setPreview(null);
    const target = dragTarget(event);
    if (!target) return;
    reschedule.reset();
    changeDates.reset();
    setLanded(target);
    const { id, roomId, checkIn, checkOut } = target;
    const settle = { onSettled: () => setLanded(null) };
    if (target.mode === 'move') reschedule.mutate({ id, roomId, checkIn, checkOut }, settle);
    else changeDates.mutate({ id, checkIn, checkOut }, settle);
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
              className="relative hidden h-8 rounded-control fill-action px-3 text-[0.8125rem] text-muted-foreground tabular-nums shadow-action stroke-lit outline-none focus-visible:ring-2 focus-visible:ring-ring sm:block"
            />
            <div className="relative flex items-center rounded-control fill-action shadow-action stroke-lit">
              <Button
                variant="ghost"
                size="icon-sm"
                className="rounded-md"
                aria-label={`Previous ${TAPE_DAYS} days`}
                onClick={() => goTo(addDaysIso(start, -TAPE_DAYS))}
              >
                <ChevronLeft />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="rounded-md px-2"
                onClick={() => goTo(today)}
              >
                Today
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                className="rounded-md"
                aria-label={`Next ${TAPE_DAYS} days`}
                onClick={() => goTo(addDaysIso(start, TAPE_DAYS))}
              >
                <ChevronRight />
              </Button>
            </div>
            <Button size="sm" onClick={() => openNew({ checkIn: start < today ? today : start })}>
              <Plus /> <span className="hidden sm:inline">New booking</span>
            </Button>
          </>
        }
      />

      {error && (
        <ErrorNotice
          message={error.message}
          className="mx-4 mt-4 md:mx-6"
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
            onDragMove={onDragMove}
            onDragEnd={onDragEnd}
            onDragCancel={() => {
              dragged.current = false;
              setPreview(null);
            }}
          >
            {/* Clipped, so a bar dragged past the edge doesn't widen the scroll area. */}
            <div
              className="overflow-x-clip"
              style={{ width: TAPE_ROOM_COLUMN + TAPE_DAYS * dayWidth }}
            >
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
                  preview={preview}
                  saving={landed?.id ?? null}
                  guestName={guestName}
                  onOpen={(id) => !dragged.current && open(id)}
                  onNew={(roomId, checkIn) => openNew({ roomId, checkIn })}
                  disabled={busy}
                />
              ))}
            </div>
          </DndContext>
        )}
      </div>

      <footer className="flex h-10 shrink-0 items-center gap-4 border-t bg-surface-sunken px-4 text-xs text-muted-foreground md:px-6">
        <span className="hidden truncate md:inline">
          Click an empty night to book it. Drag a booking to move it, or its right edge to change
          the departure. Stays run from midday to midday, so turnovers share a day.
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
              isWeekend(day) && 'bg-ink/[0.018]',
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
              className={cn(
                '-ml-1.5 w-fit rounded-md px-1.5 text-sm font-medium tabular-nums',
                isToday && 'bg-primary text-primary-foreground shadow-button',
              )}
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
  /** The bar being dragged and where it would land. */
  preview: DragTarget | null;
  /** The booking whose drop is being saved. */
  saving: string | null;
  guestName: (id: string) => string;
  onOpen: (id: string) => void;
  /** Starts a new booking in a room from a night. */
  onNew: (roomId: string, checkIn: string) => void;
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
                  'truncate font-mono text-[0.8125rem]',
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
  preview,
  saving,
  guestName,
  onOpen,
  onNew,
  disabled,
}: RowProps & { room: Room; bookings: Booking[] }) {
  const { setNodeRef } = useDroppable({ id: room.id });
  // The night under the pointer when the context menu opened.
  const [menuDay, setMenuDay] = useState<string | null>(null);
  const bookable = (day: string) => day >= today && room.status !== 'out_of_order';
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={setNodeRef}
          className="relative flex border-b border-grid-line last:border-b-0"
          style={{ height: TAPE_ROW_HEIGHT }}
          onContextMenu={(e) =>
            setMenuDay(
              (e.target as HTMLElement).closest<HTMLElement>('[data-day]')?.dataset.day ?? null,
            )
          }
        >
          {days.map((day) => (
            <div
              key={day}
              data-day={day}
              title={
                bookable(day)
                  ? `New booking in room ${room.name} from ${formatDate(day)}`
                  : undefined
              }
              onClick={() => !disabled && bookable(day) && onNew(room.id, day)}
              className={cn(
                'h-full shrink-0 border-r border-grid-line last:border-r-0',
                isWeekend(day) && 'bg-ink/[0.018]',
                day === today && 'bg-primary-soft',
                bookable(day) && 'cursor-cell hover:bg-accent',
              )}
              style={{ width: dayWidth }}
            />
          ))}
          {room.status === 'out_of_order' && (
            <div className="bg-hatch pointer-events-none absolute inset-0" title="Out of order" />
          )}
          {preview?.mode === 'move' && preview.roomId === room.id && (
            <LandingGhost target={preview} start={start} dayWidth={dayWidth} />
          )}
          {bookings.map((booking) => (
            <BookingBar
              key={booking.id}
              booking={booking}
              start={start}
              dayWidth={dayWidth}
              resizeTo={
                preview?.mode === 'resize' && preview.id === booking.id
                  ? preview.checkOut
                  : undefined
              }
              saving={saving === booking.id}
              name={guestName(booking.guestId)}
              onOpen={onOpen}
              disabled={disabled}
            />
          ))}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-60">
        <ContextMenuLabel>
          Room {room.name}
          {menuDay && `, ${formatDate(menuDay)}`}
        </ContextMenuLabel>
        <ContextMenuItem
          disabled={!menuDay || !bookable(menuDay)}
          onSelect={() => menuDay && onNew(room.id, menuDay)}
        >
          <CalendarPlus />
          {room.status === 'out_of_order'
            ? 'Out of order, not bookable'
            : menuDay && menuDay < today
              ? 'Past nights cannot be booked'
              : 'New booking from this night…'}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
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

/** Where a bar being moved will land: a dashed outline with the new dates. */
function LandingGhost({
  target,
  start,
  dayWidth,
}: {
  target: DragTarget;
  start: string;
  dayWidth: number;
}) {
  const place = placeBooking(target, start);
  if (!place) return null;
  const { left, width } = barGeometry(place, dayWidth);
  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none absolute top-[6px] bottom-[6px] flex items-center overflow-hidden rounded-lg border border-dashed border-primary/60 bg-primary-soft px-2.5 text-xs whitespace-nowrap text-primary-text',
        place.continuesBefore && 'rounded-l-none',
        place.continuesAfter && 'rounded-r-none',
      )}
      style={{ left, width }}
    >
      <span className="truncate">{formatRange(target.checkIn, target.checkOut)}</span>
    </div>
  );
}

function BookingBar({
  booking,
  start,
  dayWidth,
  resizeTo,
  saving,
  name,
  onOpen,
  disabled,
}: {
  booking: Booking;
  start: string;
  dayWidth: number;
  /** The departure the right edge is being dragged to, snapped to whole days. */
  resizeTo: IsoDate | undefined;
  saving: boolean;
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
    isDragging: resizing,
  } = useDraggable({ id: `resize:${booking.id}`, disabled: !canDrag });
  // While resizing, the right edge jumps to the departure under the pointer, a day at a time.
  const place = placeBooking({ ...booking, checkOut: resizeTo ?? booking.checkOut }, start);
  if (!place || booking.status === 'cancelled') return null;

  const { left, width } = barGeometry(place, dayWidth);
  const dragging = moving || resizing;
  const marks = bookingIcons(booking);
  // The hover text spells out what the icons mean, and names the guest on bars too short to.
  const label = [
    `${name}, ${formatRange(booking.checkIn, booking.checkOut)}, ${statusLabels[booking.status]}`,
    ...marks.map((m) => m.label),
  ].join(' · ');
  const icons = width >= ICONS_MIN_WIDTH ? marks : [];

  return (
    <>
      <BookingContextMenu bookingId={booking.id}>
        <button
          ref={moveRef}
          type="button"
          title={label}
          aria-label={label}
          onClick={() => onOpen(booking.id)}
          // The bar has its own menu; keep the lane's "new booking" menu from opening too.
          onContextMenu={(e) => e.stopPropagation()}
          {...moveListeners}
          {...moveAttributes}
          className={cn(
            'absolute top-[6px] bottom-[6px] flex items-center gap-1.5 overflow-hidden rounded-lg pr-2 pl-3.5 text-left text-sm outline-none',
            'transition-[box-shadow,filter] duration-150 ease-snap hover:shadow-floating focus-visible:ring-2 focus-visible:ring-ring',
            barStyles[booking.status],
            place.continuesBefore && 'rounded-l-none',
            place.continuesAfter && 'rounded-r-none',
            canDrag && 'cursor-grab active:cursor-grabbing',
            dragging && 'z-30 shadow-floating',
            saving && 'opacity-70',
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
            className={cn(
              'absolute top-1.5 bottom-1.5 left-1.5 w-[3px] rounded-full',
              bookingStatusColor[booking.status],
            )}
          />
          {width >= LABEL_MIN_WIDTH && place.continuesBefore && (
            <ChevronLeft className="-ml-1 size-3.5 shrink-0 text-muted-foreground" />
          )}
          {width >= LABEL_MIN_WIDTH && <span className="truncate">{name}</span>}
          {resizeTo ? (
            <span className="ml-auto shrink-0 pl-1 text-xs text-primary-text">
              to {formatDate(resizeTo)}
            </span>
          ) : (
            icons.length > 0 && (
              <span className="ml-auto flex shrink-0 items-center gap-1.5 text-muted-foreground">
                {icons.map(({ icon: Icon, label: iconLabel }) => (
                  <Icon key={iconLabel} aria-label={iconLabel} className="size-3.5" />
                ))}
              </span>
            )
          )}
        </button>
      </BookingContextMenu>
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

/** Every icon a booking bar can carry, for the legend. */
const iconKey: { icon: LucideIcon; label: string }[] = [
  { icon: Clock, label: 'Hold, not yet confirmed' },
  { icon: Baby, label: 'Children' },
  { icon: Dog, label: 'Dog' },
  { icon: Bath, label: 'Wellness' },
  { icon: Globe, label: 'Booked via OTA' },
  { icon: StickyNote, label: 'Has notes' },
];

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
      <li>
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-1 rounded px-1 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Info className="size-3.5" /> Icons
            </button>
          </PopoverTrigger>
          <PopoverContent side="top" align="end" className="flex w-auto flex-col gap-2 p-3 text-xs">
            {iconKey.map(({ icon: Icon, label }) => (
              <span key={label} className="flex items-center gap-2">
                <Icon className="size-3.5 text-muted-foreground" /> {label}
              </span>
            ))}
          </PopoverContent>
        </Popover>
      </li>
    </ul>
  );
}
