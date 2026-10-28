import type { BookingSummary } from '@orbit/shared';
import type { LucideIcon } from 'lucide-react';
import { BookingContextMenu } from '@/components/booking-menu';
import { EmptyState } from '@/components/empty-state';
import { GuestAvatar } from '@/components/guest-avatar';
import { StatusDot } from '@/components/status-dot';
import { useBookingDrawer } from '@/hooks/use-booking-drawer';
import { formatParty, statusLabels } from '@/lib/format';
import { bookingStatusColor } from '@/lib/status';

/** A compact list of bookings; a row opens the booking inspector. */
export function BookingList({
  rows,
  empty,
  emptyIcon,
  detail,
}: {
  rows: BookingSummary[];
  empty: string;
  emptyIcon?: LucideIcon;
  /** Secondary line per row; defaults to the party. */
  detail?: (row: BookingSummary) => string;
}) {
  const { open } = useBookingDrawer();
  if (rows.length === 0) {
    return <EmptyState icon={emptyIcon} title={empty} className="py-8" />;
  }
  return (
    <ul className="flex flex-col">
      {rows.map((row) => {
        const { booking, guestName, roomName } = row;
        return (
          <li key={booking.id}>
            <BookingContextMenu bookingId={booking.id}>
              <button
                type="button"
                onClick={() => open(booking.id)}
                className="flex w-full items-center gap-3 rounded-control px-2.5 py-2 text-left outline-none transition-colors duration-150 ease-snap hover:bg-accent focus-visible:bg-accent"
              >
                <GuestAvatar name={guestName} size="md" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{guestName}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {detail ? detail(row) : formatParty(booking.adults, booking.childAges)}
                  </span>
                </span>
                <span
                  className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground"
                  title={statusLabels[booking.status]}
                >
                  <StatusDot className={bookingStatusColor[booking.status]} />
                  <span className="min-w-10 rounded-md border border-ink/7 bg-background px-1.5 py-0.5 text-center font-mono text-[0.75rem] text-foreground">
                    {roomName}
                  </span>
                </span>
              </button>
            </BookingContextMenu>
          </li>
        );
      })}
    </ul>
  );
}
