import type { Booking, BookingStatus, Room, RoomStatus } from '@orbit/shared';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useBookingDrawer } from '@/hooks/use-booking-drawer';
import { useBookings, useGuests, useRooms } from '@/lib/api';
import { formatDate, formatRange, statusLabels } from '@/lib/format';
import {
  addDaysIso,
  buildWindow,
  hotelToday,
  isIsoDate,
  isWeekend,
  placeBooking,
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

const roomStatusLabels: Record<RoomStatus, string> = {
  clean: 'Clean',
  dirty: 'Dirty',
  inspected: 'Inspected',
  out_of_order: 'Out of order',
};

export function TapeChartPage() {
  const [params, setParams] = useSearchParams();
  const today = hotelToday();
  const fromParam = params.get('from');
  const start = isIsoDate(fromParam) ? fromParam : today;
  const days = buildWindow(start);
  const end = addDaysIso(start, TAPE_DAYS);

  const rooms = useRooms();
  const guests = useGuests();
  const bookings = useBookings({ from: start, to: end });
  const { open } = useBookingDrawer();

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
  const occupied = (day: string) =>
    visible.filter((b) => b.checkIn <= day && day < b.checkOut).length;

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
        <Legend />
      </div>

      {bookings.isError || rooms.isError || guests.isError ? (
        <p className="text-destructive">
          {(bookings.error ?? rooms.error ?? guests.error)?.message}
        </p>
      ) : !rooms.data || !bookings.data ? (
        <Skeleton className="h-96 w-full" />
      ) : rooms.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">No rooms.</p>
      ) : (
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
                onOpen={open}
              />
            ))}
          </div>
        </div>
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
}: {
  room: Room;
  days: string[];
  today: string;
  start: string;
  bookings: Booking[];
  guestName: (id: string) => string;
  onOpen: (id: string) => void;
}) {
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
      <div className="relative flex" style={{ width: TAPE_DAYS * DAY_COL, height: 52 }}>
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
        {bookings.map((booking) => {
          const place = placeBooking(booking, start);
          if (!place) return null;
          const name = guestName(booking.guestId);
          const label = `${name}, ${formatRange(booking.checkIn, booking.checkOut)}, ${statusLabels[booking.status]}`;
          return (
            <button
              key={booking.id}
              type="button"
              title={label}
              aria-label={label}
              onClick={() => onOpen(booking.id)}
              className={cn(
                'absolute top-1.5 bottom-1.5 truncate rounded-md px-2 text-left text-xs font-medium',
                booking.status !== 'cancelled' && barClasses[booking.status],
              )}
              style={{
                left: place.startIndex * DAY_COL + 2,
                width: place.span * DAY_COL - 4,
              }}
            >
              {place.continuesBefore ? '‹ ' : ''}
              {name}
              {place.continuesAfter ? ' ›' : ''}
            </button>
          );
        })}
      </div>
    </div>
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
