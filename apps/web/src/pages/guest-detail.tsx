import { Link, useParams } from 'react-router';
import { BookingStatusBadge } from '@/components/booking-status-badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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

  if (guest.isError) return <p className="text-destructive">{guest.error.message}</p>;
  if (!guest.data) return <Skeleton className="h-64 w-full" />;

  const g = guest.data;
  return (
    <div className="flex flex-col gap-6">
      <Link to="/guests" className="text-sm text-muted-foreground hover:underline">
        ← All guests
      </Link>
      <Card>
        <CardHeader>
          <CardTitle>{g.name}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-1 text-sm sm:grid-cols-3">
          <span>{languageLabels[g.language]}</span>
          <span>{g.email ?? '–'}</span>
          <span>{g.phone ?? '–'}</span>
          {g.notes && <span className="sm:col-span-3">{g.notes}</span>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Bookings ({bookings.data?.length ?? '…'})</CardTitle>
        </CardHeader>
        <CardContent>
          {bookings.data?.length === 0 ? (
            <p className="text-sm text-muted-foreground">No bookings.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Dates</TableHead>
                  <TableHead>Room</TableHead>
                  <TableHead>Guests</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...(bookings.data ?? [])].reverse().map((b) => (
                  <TableRow key={b.id} className="cursor-pointer" onClick={() => open(b.id)}>
                    <TableCell>{formatRange(b.checkIn, b.checkOut)}</TableCell>
                    <TableCell>{roomName(b.roomId)}</TableCell>
                    <TableCell>{formatParty(b.adults, b.childAges)}</TableCell>
                    <TableCell>
                      <BookingStatusBadge status={b.status} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {b.priceSnapshot ? formatCzk(b.priceSnapshot.total) : '–'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
