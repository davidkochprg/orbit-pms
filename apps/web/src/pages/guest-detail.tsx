import { CalendarX2, ChevronRight, Mail, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { BookingStatusBadge } from '@/components/booking-status-badge';
import { EmptyState } from '@/components/empty-state';
import { ErrorNotice } from '@/components/error-notice';
import { BookingContextMenu } from '@/components/booking-menu';
import { GuestAvatar } from '@/components/guest-avatar';
import { GuestEditorDialog } from '@/components/guest-editor';
import { PageBody, PageHeader } from '@/components/page-header';
import { Property, PropertyList } from '@/components/property-list';
import { Section } from '@/components/section';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useBookingDrawer } from '@/hooks/use-booking-drawer';
import { useBookingEditor } from '@/hooks/use-booking-editor';
import { useBookings, useGuest, useInbox, useRooms } from '@/lib/api';
import {
  formatDateTime,
  formatMoney,
  formatParty,
  formatRange,
  languageLabels,
} from '@/lib/format';
import { conversationsOf, preview } from '@/lib/inbox';

export function GuestDetailPage() {
  const { id = '' } = useParams();
  const guest = useGuest(id);
  const bookings = useBookings({ guestId: id });
  const rooms = useRooms();
  const { open } = useBookingDrawer();
  const { openNew } = useBookingEditor();
  const [editing, setEditing] = useState(false);
  const inbox = useInbox();
  const roomName = (roomId: string) => rooms.data?.find((r) => r.id === roomId)?.name ?? roomId;
  const g = guest.data;
  const all = bookings.data ?? [];
  const messages = g
    ? conversationsOf(
        inbox.data ?? [],
        g,
        all.map((b) => b.id),
      )
    : [];
  // Stays that happened or will: cancellations count for nothing.
  const kept = all.filter((b) => b.status !== 'cancelled');
  const stays = bookings.data && {
    count: kept.length,
    nights: kept.reduce((n, b) => n + (b.priceSnapshot?.nights ?? 0), 0),
    spent: kept.reduce((n, b) => n + (b.priceSnapshot?.total ?? 0), 0),
  };

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
        actions={
          g && (
            <>
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                <Pencil /> Edit
              </Button>
              <Button size="sm" onClick={() => openNew({ guestId: g.id })}>
                <Plus /> New booking
              </Button>
            </>
          )
        }
      />
      <PageBody>
        {guest.isError ? (
          <ErrorNotice message={guest.error.message} />
        ) : !g ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <div className="flex max-w-3xl flex-col gap-8">
            <div className="flex items-center gap-4">
              <GuestAvatar name={g.name} size="lg" />
              <h2 className="text-xl font-semibold tracking-tight">{g.name}</h2>
            </div>

            {stays && (
              <dl className="grid grid-cols-3 gap-2 sm:max-w-lg">
                {[
                  { label: 'Stays', value: String(stays.count) },
                  { label: 'Nights', value: String(stays.nights) },
                  { label: 'Spent', value: formatMoney(stays.spent) },
                ].map((f) => (
                  <div
                    key={f.label}
                    className="flex flex-col gap-0.5 rounded-control bg-ink/4 px-3 py-2"
                  >
                    <dt className="text-xs text-muted-foreground">{f.label}</dt>
                    <dd className="font-mono text-base tabular-nums">{f.value}</dd>
                  </div>
                ))}
              </dl>
            )}

            <PropertyList>
              <Property label="Language">{languageLabels[g.language]}</Property>
              <Property label="Email">{g.email ?? '–'}</Property>
              <Property label="Phone">{g.phone ?? '–'}</Property>
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
              {bookings.data?.length === 0 ? (
                <EmptyState icon={CalendarX2} title="No bookings yet" className="py-8" />
              ) : (
                <ul className="-mx-2 flex flex-col">
                  {[...(bookings.data ?? [])].reverse().map((b) => (
                    <li key={b.id}>
                      <BookingContextMenu bookingId={b.id}>
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
                <ul className="-mx-2 flex flex-col">
                  {messages.map((m) => (
                    <li key={m.id}>
                      <Link
                        to={`/inbox/${encodeURIComponent(m.id)}`}
                        className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-accent"
                      >
                        <Mail className="size-4 shrink-0 text-muted-foreground" />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate font-medium">
                            {m.subject ?? '(no subject)'}
                          </span>
                          <span className="truncate text-xs text-muted-foreground">
                            {preview(m)}
                          </span>
                        </span>
                        <time className="shrink-0 text-xs text-muted-foreground tabular-nums">
                          {formatDateTime(m.lastMessageAt)}
                        </time>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Section>
            )}
          </div>
        )}
      </PageBody>
      {g && <GuestEditorDialog open={editing} onOpenChange={setEditing} guest={g} />}
    </>
  );
}
