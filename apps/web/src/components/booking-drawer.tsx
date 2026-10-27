import type { AuditLogEntry, BookingAction, BookingDetail } from '@orbit/shared';
import { MoreHorizontal, Pencil, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { BookingBill, PaymentForm } from '@/components/booking-bill';
import { BookingDropdownMenu, CancelBookingDialog } from '@/components/booking-menu';
import { BookingStatusBadge } from '@/components/booking-status-badge';
import { ErrorNotice } from '@/components/error-notice';
import { GuestAvatar } from '@/components/guest-avatar';
import { GuestEditorDialog } from '@/components/guest-editor';
import { Property, PropertyList } from '@/components/property-list';
import { Section } from '@/components/section';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { useBookingDrawer } from '@/hooks/use-booking-drawer';
import { useBookingEditor } from '@/hooks/use-booking-editor';
import { useCommandPalette } from '@/hooks/use-command-palette';
import { useAuditLog, useBookingAction, useBookingDetail, useFolio } from '@/lib/api';
import {
  actionLabels,
  formatCzk,
  formatDateTime,
  formatParty,
  formatRange,
  languageLabels,
} from '@/lib/format';

const sourceLabels = {
  email: 'Email',
  phone: 'Phone',
  web: 'Website',
  ota: 'OTA',
  walk_in: 'Walk-in',
} as const;

/** The booking inspector. It floats over the page like a macOS inspector panel. */
export function BookingDrawer() {
  const { bookingId, close } = useBookingDrawer();
  const detail = useBookingDetail(bookingId);

  return (
    <Sheet open={bookingId !== null} onOpenChange={(open) => !open && close()}>
      <SheetContent className="inset-y-2! right-2! h-auto! w-[calc(100%-1rem)] gap-0 overflow-hidden rounded-xl border-0! bg-background shadow-floating sm:max-w-[420px]">
        {detail.data ? (
          <BookingDetailView detail={detail.data} />
        ) : detail.isError ? (
          <SheetHeader className="p-5">
            <SheetTitle>Booking not found</SheetTitle>
            <SheetDescription>{detail.error.message}</SheetDescription>
          </SheetHeader>
        ) : (
          <SheetHeader className="gap-3 p-5">
            <SheetTitle className="sr-only">Loading booking</SheetTitle>
            <Skeleton className="h-11 w-48" />
            <Skeleton className="h-40 w-full" />
          </SheetHeader>
        )}
      </SheetContent>
    </Sheet>
  );
}

function BookingDetailView({ detail }: { detail: BookingDetail }) {
  const { booking, guest, room, roomType, allowedActions } = detail;
  const { openPalette } = useCommandPalette();
  const { openEdit } = useBookingEditor();
  const [editingGuest, setEditingGuest] = useState(false);
  const nights = booking.priceSnapshot?.nights;

  return (
    <>
      <SheetHeader className="flex-row items-center gap-3 border-b p-5 pr-12">
        <GuestAvatar name={guest.name} size="lg" />
        <div className="flex min-w-0 flex-col gap-1">
          <SheetTitle className="truncate text-lg font-semibold tracking-tight">
            {guest.name}
          </SheetTitle>
          <SheetDescription className="flex items-center gap-2">
            <BookingStatusBadge status={booking.status} />
            <span className="truncate">
              Room {room.name}, {roomType.name}
            </span>
          </SheetDescription>
        </div>
      </SheetHeader>

      <div className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-5">
        <Section title="Stay">
          <PropertyList>
            <Property label="Dates">{formatRange(booking.checkIn, booking.checkOut)}</Property>
            <Property label="Nights">{nights ?? '–'}</Property>
            <Property label="Guests">{formatParty(booking.adults, booking.childAges)}</Property>
            <Property label="Source">{sourceLabels[booking.source]}</Property>
            {booking.holdExpiresAt && (
              <Property label="Hold expires">{formatDateTime(booking.holdExpiresAt)}</Property>
            )}
            {booking.notes && <Property label="Notes">{booking.notes}</Property>}
            <Property label="Reference">
              <span className="text-muted-foreground">{booking.id}</span>
            </Property>
          </PropertyList>
        </Section>

        <Section
          title="Guest"
          actions={
            <>
              <Button variant="ghost" size="xs" onClick={() => setEditingGuest(true)}>
                Edit
              </Button>
              <Button variant="ghost" size="xs" asChild>
                <Link to={`/guests/${guest.id}`}>Profile</Link>
              </Button>
            </>
          }
        >
          <PropertyList>
            <Property label="Language">{languageLabels[guest.language]}</Property>
            <Property label="Email">{guest.email ?? '–'}</Property>
            <Property label="Phone">{guest.phone ?? '–'}</Property>
            {guest.notes && <Property label="Notes">{guest.notes}</Property>}
          </PropertyList>
        </Section>
        <GuestEditorDialog open={editingGuest} onOpenChange={setEditingGuest} guest={guest} />

        <BookingBill booking={booking} />

        <Activity bookingId={booking.id} />
      </div>

      <footer className="flex flex-wrap items-center gap-2 border-t p-3">
        <BookingActions bookingId={booking.id} actions={allowedActions} />
        <Button variant="outline" size="sm" onClick={() => openEdit(booking.id)}>
          <Pencil /> Edit
        </Button>
        <BookingDropdownMenu bookingId={booking.id} inInspector>
          <Button variant="ghost" size="icon-sm" aria-label="More actions">
            <MoreHorizontal />
          </Button>
        </BookingDropdownMenu>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          onClick={() =>
            openPalette({
              mode: 'agent',
              text: `About ${guest.name}'s booking ${booking.id} in room ${room.name}: `,
            })
          }
        >
          <Sparkles className="text-primary-text" /> Ask Orbit
        </Button>
      </footer>
    </>
  );
}

function BookingActions({ bookingId, actions }: { bookingId: string; actions: BookingAction[] }) {
  const mutation = useBookingAction(bookingId);
  const folio = useFolio(bookingId);
  const [settling, setSettling] = useState(false);
  // Checking out with money still due asks first, and offers to take the payment.
  const run = (action: BookingAction) => {
    if (action === 'check_out' && (folio.data?.balance ?? 0) > 0) setSettling(true);
    else mutation.mutate(action);
  };
  // The main next step gets the primary button; cancelling is always secondary.
  const [main, ...rest] = actions.filter((a) => a !== 'cancel');
  const canCancel = actions.includes('cancel');
  const [cancelling, setCancelling] = useState(false);
  return (
    <>
      {main && (
        <Button size="sm" disabled={mutation.isPending} onClick={() => run(main)}>
          {actionLabels[main]}
        </Button>
      )}
      {rest.map((action) => (
        <Button
          key={action}
          size="sm"
          variant="outline"
          disabled={mutation.isPending}
          onClick={() => run(action)}
        >
          {actionLabels[action]}
        </Button>
      ))}
      {canCancel && (
        <Button
          size="sm"
          variant="ghost"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          disabled={mutation.isPending}
          onClick={() => setCancelling(true)}
        >
          {actionLabels.cancel}
        </Button>
      )}
      <CancelBookingDialog bookingId={bookingId} open={cancelling} onOpenChange={setCancelling} />
      {folio.data && (
        <CheckOutDialog
          bookingId={bookingId}
          balance={folio.data.balance}
          open={settling}
          onOpenChange={setSettling}
          onCheckOut={() => {
            setSettling(false);
            mutation.mutate('check_out');
          }}
        />
      )}
      {mutation.isError && <ErrorNotice message={mutation.error.message} className="w-full" />}
    </>
  );
}

function CheckOutDialog({
  bookingId,
  balance,
  open,
  onOpenChange,
  onCheckOut,
}: {
  bookingId: string;
  balance: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCheckOut: () => void;
}) {
  const [paying, setPaying] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setPaying(false);
        onOpenChange(next);
      }}
    >
      <DialogContent className="shadow-floating sm:max-w-sm" showCloseButton={paying}>
        {paying ? (
          <PaymentForm bookingId={bookingId} balance={balance} onDone={onCheckOut} />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{formatCzk(balance)} is still due</DialogTitle>
              <DialogDescription>
                Take the payment and check the guest out, or check out now and settle the bill
                later.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" onClick={onCheckOut}>
                Check out anyway
              </Button>
              <Button onClick={() => setPaying(true)}>Take payment</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

const auditActionLabels: Record<string, string> = {
  'booking.create_hold': 'Created a hold',
  'booking.confirm': 'Confirmed',
  'booking.check_in': 'Checked in',
  'booking.check_out': 'Checked out',
  'booking.cancel': 'Cancelled',
  'booking.move': 'Moved to another room',
  'booking.change_dates': 'Changed dates',
  'booking.reschedule': 'Rescheduled',
  'booking.create': 'Created',
  'booking.update': 'Edited',
  'folio.charge': 'Added a charge',
  'folio.remove_charge': 'Removed a charge',
  'folio.payment': 'Took a payment',
  'folio.refund': 'Refunded',
};

function Activity({ bookingId }: { bookingId: string }) {
  const log = useAuditLog(bookingId);
  if (!log.data?.length) return null;
  return (
    <Section title="Activity">
      <ol className="flex flex-col">
        {log.data.map((entry) => (
          <ActivityItem key={entry.id} entry={entry} />
        ))}
      </ol>
    </Section>
  );
}

function ActivityItem({ entry }: { entry: AuditLogEntry }) {
  const byAgent = entry.actor === 'agent';
  return (
    <li className="relative flex gap-3 pb-3 pl-4 before:absolute before:top-2 before:bottom-0 before:left-[3px] before:w-px before:bg-border last:pb-0 last:before:hidden">
      <span className="absolute top-1.5 left-0 size-[7px] rounded-full border border-border-strong bg-background" />
      <div className="flex min-w-0 flex-1 items-baseline justify-between gap-3">
        <span className="flex items-center gap-1.5">
          {auditActionLabels[entry.action] ?? entry.action}
          {byAgent && (
            <span className="inline-flex items-center gap-1 text-xs text-primary-text">
              <Sparkles className="size-3" /> by Orbit
            </span>
          )}
        </span>
        <time className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {formatDateTime(entry.createdAt)}
        </time>
      </div>
    </li>
  );
}
