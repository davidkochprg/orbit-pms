import type {
  AuditLogEntry,
  BookingAction,
  BookingDetail,
  BookingSource,
  Language,
} from '@orbit/shared';
import { CircleDashed, MoreHorizontal, Pencil, ScanLine } from 'lucide-react';
import { LogoMark } from '@/components/logo-mark';
import { type ReactNode, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { BookingBill, PaymentForm } from '@/components/booking-bill';
import { BookingGuests } from '@/components/booking-guests';
import { BookingDropdownMenu, CancelBookingDialog } from '@/components/booking-menu';
import { BookingStatusBadge } from '@/components/booking-status-badge';
import { CheckInDialog } from '@/components/check-in-dialog';
import { ErrorNotice } from '@/components/error-notice';
import { GuestAvatar } from '@/components/guest-avatar';
import { InlineSelect, InlineText } from '@/components/inline-field';
import { Property, PropertyList } from '@/components/property-list';
import { Section } from '@/components/section';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useBookingDrawer } from '@/hooks/use-booking-drawer';
import { useBookingEditor } from '@/hooks/use-booking-editor';
import { useCommandPalette } from '@/hooks/use-command-palette';
import { activityDetail, activityLabel } from '@/lib/activity';
import {
  useAuditLog,
  useBookingAction,
  useBookingDetail,
  useFolio,
  useGuestBook,
  useUpdateBooking,
  useUpdateGuest,
} from '@/lib/api';
import {
  actionLabels,
  formatMoney,
  formatDateTime,
  formatParty,
  formatRange,
  languageLabels,
} from '@/lib/format';
import { keepOpenWhileEditing } from '@/lib/inline-edit';
import { guestBookProgress } from '@/lib/registration';
import { cn } from '@/lib/utils';

const sourceLabels: Record<BookingSource, string> = {
  email: 'Email',
  phone: 'Phone',
  web: 'Website',
  ota: 'OTA',
  walk_in: 'Walk-in',
};
const sourceOptions = (Object.keys(sourceLabels) as BookingSource[]).map((value) => ({
  value,
  label: sourceLabels[value],
}));
const languageOptions = (Object.keys(languageLabels) as Language[]).map((value) => ({
  value,
  label: languageLabels[value],
}));

type Tab = 'overview' | 'guests' | 'bill' | 'activity';

/** The booking inspector. It floats over the page like a macOS inspector panel. */
export function BookingDrawer() {
  const { bookingId, close } = useBookingDrawer();
  const detail = useBookingDetail(bookingId);

  return (
    <Sheet open={bookingId !== null} onOpenChange={(open) => !open && close()}>
      <SheetContent
        onEscapeKeyDown={keepOpenWhileEditing}
        className="inset-y-2! right-2! h-auto! w-[calc(100%-1rem)] gap-0 overflow-hidden rounded-card border-0! bg-background shadow-floating sm:max-w-[600px]!"
      >
        {detail.data ? (
          <BookingDetailView key={detail.data.booking.id} detail={detail.data} />
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

/** People in the guest book apply to stays that are booked or under way. */
function tracksGuestBook(status: BookingDetail['booking']['status']) {
  return status === 'confirmed' || status === 'checked_in';
}

function BookingDetailView({ detail }: { detail: BookingDetail }) {
  const { booking, guest, room, roomType, allowedActions, missingIds } = detail;
  const { openPalette } = useCommandPalette();
  const { openEdit } = useBookingEditor();
  const { intent, clearIntent } = useBookingDrawer();
  const folio = useFolio(booking.id);
  const [tab, setTab] = useState<Tab>('overview');
  // A context menu's "Check in…" opens the inspector straight into the flow.
  const [checkingIn, setCheckingIn] = useState(
    () => intent === 'check-in' && allowedActions.includes('check_in'),
  );
  const nights = booking.priceSnapshot?.nights;
  const flagIds = tracksGuestBook(booking.status) && missingIds > 0;
  const balance = folio.data?.balance;

  useEffect(() => {
    if (intent) clearIntent();
  }, [intent, clearIntent]);

  return (
    <>
      <SheetHeader className="gap-3 border-b p-5 pr-12 pb-4">
        <div className="flex items-center gap-3">
          <GuestAvatar name={guest.name} size="lg" />
          <div className="flex min-w-0 flex-col gap-1">
            <SheetTitle className="truncate text-lg font-semibold tracking-tight">
              {guest.name}
            </SheetTitle>
            <SheetDescription className="flex items-center gap-2">
              <BookingStatusBadge status={booking.status} />
              <span className="truncate">
                Room <span className="font-mono text-foreground">{room.name}</span> ·{' '}
                {roomType.name}
              </span>
            </SheetDescription>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <Chip>
            {formatRange(booking.checkIn, booking.checkOut)}
            {nights !== undefined && ` · ${nights} ${nights === 1 ? 'night' : 'nights'}`}
          </Chip>
          <Chip>{formatParty(booking.adults, booking.childAges)}</Chip>
          {balance !== undefined && balance !== 0 && (
            <Chip tone={balance > 0 ? 'warning' : undefined} onClick={() => setTab('bill')}>
              {balance > 0 ? `${formatMoney(balance)} due` : `${formatMoney(-balance)} owed back`}
            </Chip>
          )}
          {flagIds && (
            <Chip tone="warning" onClick={() => setTab('guests')}>
              <CircleDashed className="size-3" /> {missingIds} {missingIds === 1 ? 'ID' : 'IDs'}{' '}
              missing
            </Chip>
          )}
        </div>
      </SheetHeader>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="min-h-0 flex-1">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="guests">
            Guests
            {flagIds && (
              <span className="size-1.5 rounded-full bg-warning" aria-label="IDs missing" />
            )}
          </TabsTrigger>
          <TabsTrigger value="bill">Bill</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
          <TabsContent value="overview" className="flex flex-col gap-6 p-5">
            {flagIds && (
              <div className="flex items-center gap-3 rounded-stage bg-warning/10 px-3 py-2.5">
                <ScanLine className="size-4 shrink-0 text-warning" />
                <span className="min-w-0 flex-1">
                  {missingIds} {missingIds === 1 ? 'guest still needs' : 'guests still need'} an ID
                  in the guest book.
                </span>
                <Button variant="outline" size="xs" onClick={() => setTab('guests')}>
                  Scan IDs
                </Button>
              </div>
            )}
            <StaySection detail={detail} onEditStay={() => openEdit(booking.id)} />
            <ContactSection detail={detail} />
          </TabsContent>
          <TabsContent value="guests" className="flex flex-col gap-3 p-5">
            <GuestsTab detail={detail} />
          </TabsContent>
          <TabsContent value="bill" className="p-5">
            <BookingBill booking={booking} />
          </TabsContent>
          <TabsContent value="activity" className="p-5">
            <Activity bookingId={booking.id} />
          </TabsContent>
        </div>
      </Tabs>

      <footer className="flex flex-wrap items-center gap-2 border-t p-3">
        <BookingActions
          bookingId={booking.id}
          actions={allowedActions}
          onCheckIn={() => setCheckingIn(true)}
        />
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
            openPalette({ mode: 'agent', context: { kind: 'booking', id: booking.id } })
          }
        >
          <LogoMark className="text-primary-text" /> Ask Orbit
        </Button>
      </footer>
      <CheckInDialog detail={detail} open={checkingIn} onOpenChange={setCheckingIn} />
    </>
  );
}

function Chip({
  children,
  tone,
  onClick,
}: {
  children: ReactNode;
  tone?: 'warning' | undefined;
  onClick?: () => void;
}) {
  const className = cn(
    'inline-flex h-6 items-center gap-1 rounded-full bg-ink/5 px-2 text-muted-foreground',
    tone === 'warning' && 'bg-warning/12 text-warning',
    onClick &&
      'outline-none transition-colors hover:bg-ink/8 focus-visible:ring-2 focus-visible:ring-ring',
  );
  return onClick ? (
    <button type="button" onClick={onClick} className={className}>
      {children}
    </button>
  ) : (
    <span className={className}>{children}</span>
  );
}

const addonText = (addons: BookingDetail['booking']['addons']) =>
  [
    addons.wellness && 'Wellness',
    addons.extraBeds > 0 && `${addons.extraBeds} extra ${addons.extraBeds === 1 ? 'bed' : 'beds'}`,
    addons.dogs > 0 && `${addons.dogs} ${addons.dogs === 1 ? 'dog' : 'dogs'}`,
  ]
    .filter(Boolean)
    .join(', ');

function StaySection({ detail, onEditStay }: { detail: BookingDetail; onEditStay: () => void }) {
  const { booking } = detail;
  const update = useUpdateBooking();
  const editable = booking.status !== 'cancelled' && booking.status !== 'checked_out';
  const save = (patch: Parameters<typeof update.mutateAsync>[0]['patch']) =>
    update.mutateAsync({ id: booking.id, patch });

  return (
    <Section
      title="Stay"
      actions={
        editable && (
          <Button variant="ghost" size="xs" onClick={onEditStay}>
            Change dates, room or party
          </Button>
        )
      }
    >
      <PropertyList className="items-center gap-y-1">
        <Property label="Dates">{formatRange(booking.checkIn, booking.checkOut)}</Property>
        <Property label="Guests">{formatParty(booking.adults, booking.childAges)}</Property>
        <Property label="Add-ons">{addonText(booking.addons) || '–'}</Property>
        {booking.priceSnapshot && (
          <Property label="Stay price">
            <span className="font-mono tabular-nums">
              {formatMoney(booking.priceSnapshot.total)}
            </span>
          </Property>
        )}
        <Property label="Source">
          <InlineSelect
            label="Source"
            value={booking.source}
            options={sourceOptions}
            disabled={!editable}
            onSave={(source) => save({ source })}
          />
        </Property>
        <Property label="Notes">
          <InlineText
            label="Booking notes"
            value={booking.notes}
            multiline
            placeholder="Add a note"
            onSave={(notes) => save({ notes: notes || null })}
          />
        </Property>
        {booking.holdExpiresAt && (
          <Property label="Hold expires">{formatDateTime(booking.holdExpiresAt)}</Property>
        )}
        <Property label="Reference">
          <span className="font-mono text-xs text-muted-foreground">{booking.id}</span>
        </Property>
      </PropertyList>
      {update.error && (
        <ErrorNotice message={update.error.message} onDismiss={() => update.reset()} />
      )}
    </Section>
  );
}

function ContactSection({ detail }: { detail: BookingDetail }) {
  const { guest } = detail;
  const update = useUpdateGuest();
  const save = (patch: Parameters<typeof update.mutateAsync>[0]['patch']) =>
    update.mutateAsync({ id: guest.id, patch });
  return (
    <Section
      title="Main guest"
      actions={
        <Button variant="ghost" size="xs" asChild>
          <Link to={`/guests/${guest.id}`}>Profile</Link>
        </Button>
      }
    >
      <PropertyList className="items-center gap-y-1">
        <Property label="Name">
          <InlineText label="Name" value={guest.name} onSave={(name) => save({ name })} />
        </Property>
        <Property label="Email">
          <InlineText
            label="Email"
            type="email"
            value={guest.email}
            onSave={(email) => save({ email: email || null })}
          />
        </Property>
        <Property label="Phone">
          <InlineText
            label="Phone"
            type="tel"
            value={guest.phone}
            onSave={(phone) => save({ phone: phone || null })}
          />
        </Property>
        <Property label="Language">
          <InlineSelect
            label="Language"
            value={guest.language}
            options={languageOptions}
            onSave={(language) => save({ language })}
          />
        </Property>
        <Property label="Guest notes">
          <InlineText
            label="Guest notes"
            value={guest.notes}
            multiline
            placeholder="Preferences, allergies…"
            onSave={(notes) => save({ notes: notes || null })}
          />
        </Property>
      </PropertyList>
      {update.error && (
        <ErrorNotice message={update.error.message} onDismiss={() => update.reset()} />
      )}
    </Section>
  );
}

function GuestsTab({ detail }: { detail: BookingDetail }) {
  const { booking } = detail;
  const book = useGuestBook(booking.id);
  const editable = booking.status !== 'cancelled';
  return (
    <>
      <p className="text-sm text-muted-foreground">
        {book.data ? guestBookProgress(book.data) : 'Loading the guest book…'}
      </p>
      <BookingGuests bookingId={booking.id} editable={editable} />
    </>
  );
}

function BookingActions({
  bookingId,
  actions,
  onCheckIn,
}: {
  bookingId: string;
  actions: BookingAction[];
  onCheckIn: () => void;
}) {
  const mutation = useBookingAction(bookingId);
  const folio = useFolio(bookingId);
  const [settling, setSettling] = useState(false);
  // Check-in walks through the guest book and the bill; checking out with money still due asks
  // first and offers to take the payment.
  const run = (action: BookingAction) => {
    if (action === 'check_in') onCheckIn();
    else if (action === 'check_out' && (folio.data?.balance ?? 0) > 0) setSettling(true);
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
          {main === 'check_in' && '…'}
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
      <DialogContent
        {...(!paying && { 'aria-describedby': undefined })}
        className="shadow-floating sm:max-w-sm"
        showCloseButton={paying}
      >
        {paying ? (
          <PaymentForm
            bookingId={bookingId}
            balance={balance}
            onDone={onCheckOut}
            onCancel={() => setPaying(false)}
          />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{formatMoney(balance)} is still due</DialogTitle>
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

function Activity({ bookingId }: { bookingId: string }) {
  const log = useAuditLog(bookingId);
  if (log.isError) return <ErrorNotice message={log.error.message} />;
  if (!log.data) return <Skeleton className="h-32" />;
  if (log.data.length === 0) return <p className="text-muted-foreground">Nothing yet.</p>;
  return (
    <ol className="flex flex-col">
      {log.data.map((entry) => (
        <ActivityItem key={entry.id} entry={entry} />
      ))}
    </ol>
  );
}

function ActivityItem({ entry }: { entry: AuditLogEntry }) {
  const byAgent = entry.actor === 'agent';
  const detail = activityDetail(entry.action, entry.payload);
  return (
    <li className="relative flex gap-3 pb-3 pl-4 before:absolute before:top-2 before:bottom-0 before:left-[3px] before:w-px before:bg-border last:pb-0 last:before:hidden">
      <span className="absolute top-1.5 left-0 size-[7px] rounded-full border border-border-strong bg-background" />
      <div className="flex min-w-0 flex-1 items-baseline justify-between gap-3">
        <span className="flex min-w-0 flex-col">
          <span className="flex items-center gap-1.5">
            {activityLabel(entry.action)}
            {byAgent && (
              <span className="inline-flex items-center gap-1 text-xs text-primary-text">
                <LogoMark className="size-3" /> by Orbit
              </span>
            )}
          </span>
          {detail && <span className="text-xs text-muted-foreground">{detail}</span>}
        </span>
        <time className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {formatDateTime(entry.createdAt)}
        </time>
      </div>
    </li>
  );
}
