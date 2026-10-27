import { CalendarX2, ChevronRight } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { BookingStatusBadge } from '@/components/booking-status-badge';
import { EmptyState } from '@/components/empty-state';
import { ErrorNotice } from '@/components/error-notice';
import { GuestAvatar } from '@/components/guest-avatar';
import { PageBody, PageHeader } from '@/components/page-header';
import { Property, PropertyList } from '@/components/property-list';
import { Section } from '@/components/section';
import { Skeleton } from '@/components/ui/skeleton';
import { useBookingDrawer } from '@/hooks/use-booking-drawer';
import { useBookings, useGuest, useRooms } from '@/lib/api';
import { formatCzk, formatParty, formatRange, languageLabels } from '@/lib/format';

export function GuestDetailPage() {
  const { id = '' } = useParams();
  const guest = useGuest(id);
  const bookings = useBookings({ guestId: id });
  const rooms = useRooms();
  const { open } = useBookingDrawer();
  const roomName = (roomId: string) => rooms.data?.find((r) => r.id === roomId)?.name ?? roomId;
  const g = guest.data;

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-1.5">
            <Link to="/guests" className="text-muted-foreground hover:text-foreground">
              Guests
            </Link>
            <ChevronRight className="size-3.5 text-subtle-foreground" />
            {g?.name ?? '…'}
          </span>
        }
      />
      <PageBody>
        {guest.isError ? (
          <ErrorNotice message={guest.error.message} />
        ) : !g ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-8">
            <div className="flex items-center gap-4">
              <GuestAvatar name={g.name} size="lg" />
              <h2 className="text-xl font-semibold tracking-tight">{g.name}</h2>
            </div>

            <PropertyList>
              <Property label="Language">{languageLabels[g.language]}</Property>
              <Property label="Email">{g.email ?? '–'}</Property>
              <Property label="Phone">{g.phone ?? '–'}</Property>
              {g.notes && <Property label="Notes">{g.notes}</Property>}
            </PropertyList>

            <Section title="Bookings" count={bookings.data?.length}>
              {bookings.data?.length === 0 ? (
                <EmptyState icon={CalendarX2} title="No bookings yet" className="py-8" />
              ) : (
                <ul className="-mx-2 flex flex-col">
                  {[...(bookings.data ?? [])].reverse().map((b) => (
                    <li key={b.id}>
                      <button
                        type="button"
                        onClick={() => open(b.id)}
                        className="grid w-full grid-cols-[1fr_auto] items-center gap-x-4 rounded-lg px-2 py-2 text-left hover:bg-accent sm:grid-cols-[14rem_1fr_auto_auto]"
                      >
                        <span className="font-medium">{formatRange(b.checkIn, b.checkOut)}</span>
                        <span className="hidden truncate text-muted-foreground sm:inline">
                          Room {roomName(b.roomId)}, {formatParty(b.adults, b.childAges)}
                        </span>
                        <span className="hidden tabular-nums sm:inline">
                          {b.priceSnapshot ? formatCzk(b.priceSnapshot.total) : '–'}
                        </span>
                        <BookingStatusBadge status={b.status} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>
        )}
      </PageBody>
    </>
  );
}
