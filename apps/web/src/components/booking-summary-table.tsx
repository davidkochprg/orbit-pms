import type { BookingSummary } from '@orbit/shared';
import { BookingStatusBadge } from '@/components/booking-status-badge';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { useBookingDrawer } from '@/hooks/use-booking-drawer';
import { formatParty, formatRange } from '@/lib/format';

export function BookingSummaryTable({ rows, empty }: { rows: BookingSummary[]; empty: string }) {
  const { open } = useBookingDrawer();
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <Table>
      <TableBody>
        {rows.map(({ booking, guestName, roomName }) => (
          <TableRow key={booking.id} className="cursor-pointer" onClick={() => open(booking.id)}>
            <TableCell className="font-medium">{roomName}</TableCell>
            <TableCell>{guestName}</TableCell>
            <TableCell className="text-muted-foreground">
              {formatParty(booking.adults, booking.childAges)}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {formatRange(booking.checkIn, booking.checkOut)}
            </TableCell>
            <TableCell className="text-right">
              <BookingStatusBadge status={booking.status} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
