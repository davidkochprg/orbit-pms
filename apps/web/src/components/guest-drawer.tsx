import type { Guest } from '@orbit/shared';
import { CalendarX2, Pencil, Plus } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Link } from 'react-router';
import { BookingContextMenu } from '@/components/booking-menu';
import { BookingStatusBadge } from '@/components/booking-status-badge';
import { ConversationList } from '@/components/conversation-list';
import { EmptyState } from '@/components/empty-state';
import { GuestAvatar } from '@/components/guest-avatar';
import { GuestEditorDialog } from '@/components/guest-editor';
import { GuestMemorySection } from '@/components/guest-memory';
import { LogoMark } from '@/components/logo-mark';
import { Property, PropertyList } from '@/components/property-list';
import { Section } from '@/components/section';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { useAskOrbit } from '@/hooks/use-ask-orbit';
import { useBookingEditor } from '@/hooks/use-booking-editor';
import { useGuestDrawer } from '@/hooks/use-guest-drawer';
import { useBookings, useGuest, useInbox, useRooms } from '@/lib/api';
import { formatMoney, formatParty, formatRange, languageLabels } from '@/lib/format';
import { conversationsOf } from '@/lib/inbox';
import { keepOpenWhileEditing } from '@/lib/inline-edit';
import { composeLink } from '@/lib/mail';
import { telHref } from '@/lib/repairs';

/** A guest: their stays, what the hotel knows about them and their messages, over any page. */
export function GuestDrawer() {
  const { guestId, close } = useGuestDrawer();
  const guest = useGuest(guestId ?? '');

  return (
    <Sheet open={guestId !== null} onOpenChange={(open) => !open && close()}>
      <SheetContent
        onEscapeKeyDown={keepOpenWhileEditing}
        className="inset-y-2! right-2! h-auto! w-[calc(100%-1rem)] gap-0 overflow-hidden rounded-card border-0! bg-background shadow-floating sm:max-w-[37.5rem]!"
      >
        {guest.data ? (
          <GuestView key={guest.data.id} guest={guest.data} />
        ) : guest.isError ? (
          <SheetHeader className="p-5">
            <SheetTitle>Guest not found</SheetTitle>
            <SheetDescription>{guest.error.message}</SheetDescription>
          </SheetHeader>
        ) : (
          <SheetHeader className="gap-3 p-5">
            <SheetTitle className="sr-only">Loading guest</SheetTitle>
            <Skeleton className="h-11 w-48" />
            <Skeleton className="h-40 w-full" />
          </SheetHeader>
        )}
      </SheetContent>
    </Sheet>
  );
}

function GuestView({ guest: g }: { guest: Guest }) {
  const bookings = useBookings({ guestId: g.id });
  const rooms = useRooms();
  const inbox = useInbox();
  const { openNew } = useBookingEditor();
  const { openBooking } = useGuestDrawer();
  const ask = useAskOrbit();
  const [editing, setEditing] = useState(false);
  const roomName = (roomId: string) => rooms.data?.find((r) => r.id === roomId)?.name ?? roomId;
  const all = bookings.data ?? [];
  const messages = conversationsOf(
    inbox.data ?? [],
    g,
    all.map((b) => b.id),
  );
  // Stays that happened or will: cancellations count for nothing.
  const kept = all.filter((b) => b.status !== 'cancelled');
  const nights = kept.reduce((n, b) => n + (b.priceSnapshot?.nights ?? 0), 0);
  const spent = kept.reduce((n, b) => n + (b.priceSnapshot?.total ?? 0), 0);

  return (
    <>
      <SheetHeader className="gap-3 border-b p-5 pr-12 pb-4">
        <div className="flex items-center gap-3">
          <GuestAvatar name={g.name} size="lg" />
          <div className="flex min-w-0 flex-col gap-1">
            <SheetTitle className="truncate text-lg font-semibold tracking-tight">
              {g.name}
            </SheetTitle>
            <SheetDescription className="truncate">
              {[languageLabels[g.language], g.email, g.phone].filter(Boolean).join(' · ')}
            </SheetDescription>
          </div>
        </div>
        {bookings.data && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <Chip>
              {kept.length} {kept.length === 1 ? 'stay' : 'stays'}
            </Chip>
            <Chip>
              {nights} {nights === 1 ? 'night' : 'nights'}
            </Chip>
            <Chip>{formatMoney(spent)} spent</Chip>
          </div>
        )}
      </SheetHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-5">
        <GuestMemorySection guestId={g.id} />

        <PropertyList>
          <Property label="Language">{languageLabels[g.language]}</Property>
          <Property label="Email">
            {g.email ? (
              <Link
                to={composeLink({ name: g.name, address: g.email })}
                className="hover:underline"
              >
                {g.email}
              </Link>
            ) : (
              '–'
            )}
          </Property>
          <Property label="Phone">
            {g.phone ? (
              <a href={telHref(g.phone)} className="hover:underline">
                {g.phone}
              </a>
            ) : (
              '–'
            )}
          </Property>
          <Property label="Notes">
            {g.notes ?? (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="text-subtle-foreground hover:text-foreground"
              >
                Preferences, allergies…
              </button>
            )}
          </Property>
        </PropertyList>

        <Section title="Bookings" count={bookings.data?.length}>
          {!bookings.data ? (
            <Skeleton className="h-24" />
          ) : bookings.data.length === 0 ? (
            <EmptyState icon={CalendarX2} title="No bookings yet" className="py-8" />
          ) : (
            <ul className="-mx-2 flex flex-col">
              {[...bookings.data].reverse().map((b) => (
                <li key={b.id}>
                  <BookingContextMenu bookingId={b.id}>
                    <button
                      type="button"
                      onClick={() => openBooking(b.id)}
                      className="grid w-full grid-cols-[1fr_auto_auto] items-center gap-x-3 rounded-lg px-2 py-1.5 text-left hover:bg-accent"
                    >
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-sm font-medium">
                          {formatRange(b.checkIn, b.checkOut)}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          Room {roomName(b.roomId)} · {formatParty(b.adults, b.childAges)}
                        </span>
                      </span>
                      <span className="font-mono text-sm tabular-nums">
                        {b.priceSnapshot ? formatMoney(b.priceSnapshot.total) : '–'}
                      </span>
                      <BookingStatusBadge status={b.status} />
                    </button>
                  </BookingContextMenu>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {messages.length > 0 && (
          <Section title="Messages" count={messages.length}>
            <ConversationList conversations={messages} />
          </Section>
        )}
      </div>

      <footer className="flex flex-wrap items-center gap-2 border-t p-3">
        <Button size="sm" onClick={() => openNew({ guestId: g.id })}>
          <Plus /> New booking
        </Button>
        <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
          <Pencil /> Edit
        </Button>
        {ask && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => ask({ kind: 'guest', id: g.id })}
          >
            <LogoMark className="text-primary-text" /> Ask Orbit
          </Button>
        )}
      </footer>
      <GuestEditorDialog open={editing} onOpenChange={setEditing} guest={g} />
    </>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-6 items-center gap-1 rounded-full bg-ink/5 px-2 text-muted-foreground">
      {children}
    </span>
  );
}
