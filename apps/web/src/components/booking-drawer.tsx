import type { BookingAction, BookingDetail } from '@orbit/shared';
import { BookingStatusBadge } from '@/components/booking-status-badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableFooter, TableRow } from '@/components/ui/table';
import { useBookingDrawer } from '@/hooks/use-booking-drawer';
import { useAuditLog, useBookingAction, useBookingDetail } from '@/lib/api';
import {
  actionLabels,
  formatCzk,
  formatDateTime,
  formatParty,
  formatRange,
  languageLabels,
} from '@/lib/format';

export function BookingDrawer() {
  const { bookingId, close } = useBookingDrawer();
  const detail = useBookingDetail(bookingId);

  return (
    <Sheet open={bookingId !== null} onOpenChange={(open) => !open && close()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        {detail.data ? (
          <BookingDetailView detail={detail.data} />
        ) : detail.isError ? (
          <SheetHeader>
            <SheetTitle>Booking not found</SheetTitle>
            <SheetDescription>{detail.error.message}</SheetDescription>
          </SheetHeader>
        ) : (
          <SheetHeader>
            <SheetTitle>Loading booking…</SheetTitle>
            <Skeleton className="h-40 w-full" />
          </SheetHeader>
        )}
      </SheetContent>
    </Sheet>
  );
}

function BookingDetailView({ detail }: { detail: BookingDetail }) {
  const { booking, guest, room, roomType, allowedActions } = detail;
  return (
    <>
      <SheetHeader>
        <div className="flex items-center gap-2">
          <SheetTitle>{guest.name}</SheetTitle>
          <BookingStatusBadge status={booking.status} />
        </div>
        <SheetDescription>
          Room {room.name} · {roomType.name} · {booking.id}
        </SheetDescription>
      </SheetHeader>

      <div className="flex flex-col gap-6 px-4 pb-6 text-sm">
        <Section title="Stay">
          <Field label="Dates">{formatRange(booking.checkIn, booking.checkOut)}</Field>
          <Field label="Nights">{booking.priceSnapshot?.nights ?? '–'}</Field>
          <Field label="Guests">{formatParty(booking.adults, booking.childAges)}</Field>
          <Field label="Source">{booking.source.replace('_', ' ')}</Field>
          {booking.holdExpiresAt && (
            <Field label="Hold expires">{formatDateTime(booking.holdExpiresAt)}</Field>
          )}
          {booking.notes && <Field label="Notes">{booking.notes}</Field>}
        </Section>

        <Section title="Guest">
          <Field label="Language">{languageLabels[guest.language]}</Field>
          <Field label="Email">{guest.email ?? '–'}</Field>
          <Field label="Phone">{guest.phone ?? '–'}</Field>
        </Section>

        <Section title="Price">
          {booking.priceSnapshot ? (
            <Table>
              <TableBody>
                {booking.priceSnapshot.lines.map((line, i) => (
                  <TableRow key={i}>
                    <TableCell className="whitespace-normal">{line.label}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCzk(line.amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCzk(booking.priceSnapshot.total)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          ) : (
            <p className="text-muted-foreground">No price recorded.</p>
          )}
        </Section>

        <BookingActions bookingId={booking.id} actions={allowedActions} />

        <Activity bookingId={booking.id} />
      </div>
    </>
  );
}

function BookingActions({ bookingId, actions }: { bookingId: string; actions: BookingAction[] }) {
  const mutation = useBookingAction(bookingId);
  if (actions.length === 0) return null;
  return (
    <Section title="Actions">
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <Button
            key={action}
            variant={action === 'cancel' ? 'destructive' : 'default'}
            disabled={mutation.isPending}
            onClick={() => mutation.mutate(action)}
          >
            {actionLabels[action]}
          </Button>
        ))}
      </div>
      {mutation.isError && <p className="text-destructive">{mutation.error.message}</p>}
    </Section>
  );
}

function Activity({ bookingId }: { bookingId: string }) {
  const log = useAuditLog(bookingId);
  if (!log.data?.length) return null;
  return (
    <Section title="Activity">
      <ul className="flex flex-col gap-1 text-muted-foreground">
        {log.data.map((entry) => (
          <li key={entry.id}>
            {formatDateTime(entry.createdAt)} · {entry.actor} · {entry.action}
          </li>
        ))}
      </ul>
    </Section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-medium">{title}</h3>
      <Separator />
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}
