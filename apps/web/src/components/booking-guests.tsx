import type { DocumentType, StayGuestPatch, StayGuestView } from '@orbit/shared';
import { AlertTriangle, CircleCheck, CircleDashed, ScanLine, Trash2, UserPlus } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Link } from 'react-router';
import { ErrorNotice } from '@/components/error-notice';
import { GuestAvatar } from '@/components/guest-avatar';
import { IdScanDialog } from '@/components/id-scan-dialog';
import { InlineDate, InlineSelect, InlineText } from '@/components/inline-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useAddStayGuest,
  useGuestBook,
  useRemoveStayGuest,
  useUpdateGuest,
  useUpdateStayGuest,
} from '@/lib/api';
import { formatFullDate, hotelTodayIso } from '@/lib/format';
import {
  countryName,
  countrySuggestions,
  documentTypeLabels,
  missingSummary,
  unaddedStillNeeded,
} from '@/lib/registration';
import { INLINE_EDITOR } from '@/lib/inline-edit';
import { cn } from '@/lib/utils';

const documentOptions: { value: DocumentType; label: string }[] = [
  { value: 'id_card', label: documentTypeLabels.id_card },
  { value: 'passport', label: documentTypeLabels.passport },
];

/**
 * Everyone staying in the room, one card each, edited in place. People the party counts but nobody
 * added yet show as open slots that can be scanned or named.
 */
export function BookingGuests({
  bookingId,
  editable,
  compact = false,
}: {
  bookingId: string;
  editable: boolean;
  /** Show the ID fields only for people who still need them, as in the check-in flow. */
  compact?: boolean;
}) {
  const book = useGuestBook(bookingId);
  // `undefined` = closed, `null` = scanning for a companion not added yet.
  const [scanning, setScanning] = useState<StayGuestView | null | undefined>(undefined);

  if (book.isError) return <ErrorNotice message={book.error.message} />;
  if (!book.data) return <Skeleton className="h-48" />;
  const { guests, partySize, extra } = book.data;
  const open = Math.max(0, partySize - guests.length);
  // Where only the guest who booked shows an ID, companions can be added but aren't missing.
  const openRequired = unaddedStillNeeded(book.data) > 0;

  return (
    <div className="flex flex-col gap-2">
      {extra > 0 && (
        <p className="flex items-start gap-2 rounded-stage bg-warning/10 px-3 py-2.5 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
          <span>
            {guests.length} people are listed, but the booking is for {partySize}. Remove whoever
            isn&apos;t staying, or change the party with Edit.
          </span>
        </p>
      )}
      {guests.map((g, i) => (
        <StayGuestCard
          key={g.id}
          bookingId={bookingId}
          guest={g}
          position={i + 1}
          editable={editable}
          compact={compact}
          onScan={() => setScanning(g)}
        />
      ))}
      {openRequired
        ? Array.from({ length: open }, (_, i) => (
            <OpenSlot
              key={`open-${i}`}
              bookingId={bookingId}
              position={guests.length + i + 1}
              label={`Guest ${guests.length + i + 1} of ${partySize}`}
              required
              editable={editable}
              onScan={() => setScanning(null)}
            />
          ))
        : // Companions the guest book doesn't need share one row: they can still be added.
          open > 0 && (
            <OpenSlot
              bookingId={bookingId}
              position={guests.length + 1}
              label={
                open === 1
                  ? `Guest ${partySize} of ${partySize}`
                  : `Guests ${guests.length + 1}–${partySize} of ${partySize}`
              }
              marker={open === 1 ? undefined : `+${open}`}
              required={false}
              editable={editable}
              onScan={() => setScanning(null)}
            />
          )}
      <IdScanDialog
        bookingId={bookingId}
        stayGuest={scanning ?? null}
        open={scanning !== undefined}
        onOpenChange={(o) => !o && setScanning(undefined)}
      />
    </div>
  );
}

function StatusLine({ guest }: { guest: StayGuestView }) {
  const summary = missingSummary(guest.missing);
  return summary ? (
    <span className="flex items-center gap-1.5 text-xs text-warning">
      <CircleDashed className="size-3.5 shrink-0" /> {summary}
    </span>
  ) : (
    <span className="flex items-center gap-1.5 text-xs text-success">
      <CircleCheck className="size-3.5 shrink-0" /> In the guest book
    </span>
  );
}

function StayGuestCard({
  bookingId,
  guest,
  position,
  editable,
  compact,
  onScan,
}: {
  bookingId: string;
  guest: StayGuestView;
  position: number;
  editable: boolean;
  compact: boolean;
  onScan: () => void;
}) {
  const update = useUpdateStayGuest(bookingId);
  const rename = useUpdateGuest();
  const remove = useRemoveStayGuest(bookingId);
  const save = (patch: StayGuestPatch) => update.mutateAsync({ id: guest.id, patch });
  const has = (f: StayGuestView['missing'][number]) => guest.missing.includes(f);
  const error = update.error ?? rename.error ?? remove.error;

  return (
    <article
      className={cn(
        '@container flex flex-col gap-3 rounded-stage bg-background p-3 shadow-[0_1px_2px_var(--shadow-soft)] stroke-lit',
        guest.missing.length > 0 && 'ring-1 ring-warning/25',
      )}
    >
      <header className="flex items-start gap-3">
        <GuestAvatar name={guest.name} />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-w-0 items-center gap-2">
            {editable ? (
              <InlineText
                label="Name"
                value={guest.name}
                className="font-medium"
                onSave={(name) =>
                  guest.primary && guest.guestId
                    ? rename.mutateAsync({ id: guest.guestId, patch: { name } })
                    : save({ name })
                }
              />
            ) : (
              <span className="truncate font-medium">{guest.name}</span>
            )}
          </div>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            {guest.primary ? (
              <Link to={`/guests/${guest.guestId}`} className="hover:text-foreground">
                Main guest
              </Link>
            ) : (
              `Guest ${position}`
            )}
            <span aria-hidden className="hidden @md:inline">
              ·
            </span>
            <StatusLine guest={guest} />
          </span>
        </div>
        {editable && (
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant={guest.missing.length > 0 ? 'outline' : 'ghost'}
              size="sm"
              onClick={onScan}
            >
              <ScanLine /> {guest.registeredAt ? 'Rescan' : 'Scan ID'}
            </Button>
            {!guest.primary && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${guest.name}`}
                disabled={remove.isPending}
                onClick={() => remove.mutate(guest.id)}
                className="hover:text-destructive"
              >
                <Trash2 />
              </Button>
            )}
          </div>
        )}
      </header>

      {(!compact || guest.missing.length > 0) && (
        <dl className="grid grid-cols-[6rem_minmax(0,1fr)] items-center gap-x-3 gap-y-0.5 text-sm @md:grid-cols-[6rem_minmax(0,1fr)_6rem_minmax(0,1fr)] @md:pl-12">
          <Field label="Nationality">
            <InlineText
              label="Nationality"
              value={guest.nationality}
              display={
                guest.nationality && `${countryName(guest.nationality)} (${guest.nationality})`
              }
              missing={has('nationality')}
              disabled={!editable}
              transform={(v) => v.toUpperCase().slice(0, 2)}
              inputProps={{ placeholder: 'CZ' }}
              suggestions={countrySuggestions}
              onSave={(v) => save({ nationality: v || null })}
            />
          </Field>
          <Field label="Born">
            <InlineDate
              label="Date of birth"
              value={guest.dateOfBirth}
              min="1900-01-01"
              max={hotelTodayIso()}
              display={guest.dateOfBirth && formatFullDate(guest.dateOfBirth)}
              missing={has('dateOfBirth')}
              disabled={!editable}
              onSave={(v) => save({ dateOfBirth: v || null })}
            />
          </Field>
          <Field label="Document">
            <InlineSelect
              label="Document type"
              value={guest.documentType}
              options={documentOptions}
              missing={has('documentType')}
              placeholder={has('documentType') ? 'Add' : 'Optional'}
              disabled={!editable}
              onSave={(v) => save({ documentType: v })}
            />
          </Field>
          <Field label="Number">
            <InlineText
              label="Document number"
              value={guest.documentNumber}
              display={
                guest.documentNumber && (
                  <span className="font-mono text-[0.8125rem]">{guest.documentNumber}</span>
                )
              }
              missing={has('documentNumber')}
              placeholder={has('documentNumber') ? 'Add' : 'Optional'}
              disabled={!editable}
              onSave={(v) => save({ documentNumber: v || null })}
            />
          </Field>
          <Field label="Address" wide>
            <InlineText
              label="Home address"
              value={guest.address}
              placeholder={has('address') ? 'Needed for guests from abroad' : 'Optional'}
              missing={has('address')}
              disabled={!editable}
              onSave={(v) => save({ address: v || null })}
            />
          </Field>
        </dl>
      )}
      {error && <ErrorNotice message={error.message} />}
    </article>
  );
}

function Field({
  label,
  wide = false,
  children,
}: {
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn('min-w-0', wide && '@md:col-span-3')}>{children}</dd>
    </>
  );
}

function OpenSlot({
  bookingId,
  position,
  label,
  marker,
  required,
  editable,
  onScan,
}: {
  bookingId: string;
  /** The place the next person added takes in the party. */
  position: number;
  /** "Guest 2 of 4", or "Guests 2–4 of 4" for companions sharing one row. */
  label: string;
  /** What the circle shows, the position by default, e.g. "+3" for a shared row. */
  marker?: string;
  /** Whether the guest book needs this person, or they may be added if staff like. */
  required: boolean;
  editable: boolean;
  onScan: () => void;
}) {
  const add = useAddStayGuest(bookingId);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');

  function submit(e: FormEvent) {
    e.preventDefault();
    add.mutate(
      { name },
      {
        onSuccess: () => {
          setName('');
          setNaming(false);
        },
      },
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-stage border border-dashed border-border-strong p-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full border border-dashed border-border-strong text-xs text-muted-foreground">
          {marker ?? position}
        </span>
        {naming ? (
          <form
            {...{ [INLINE_EDITOR]: '' }}
            onSubmit={submit}
            className="flex min-w-0 flex-1 items-center gap-2"
          >
            <Input
              autoFocus
              aria-label={`Name of guest ${position}`}
              placeholder="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setNaming(false)}
              className="h-8"
            />
            <Button type="submit" size="sm" disabled={!name.trim() || add.isPending}>
              Add
            </Button>
          </form>
        ) : (
          <>
            {/* At least wide enough for its words: narrower, the buttons go to the next line. */}
            <div className="flex min-w-36 flex-1 flex-col whitespace-nowrap">
              <span className="text-muted-foreground">{label}</span>
              {required ? (
                <span className="text-xs text-warning">Not added yet</span>
              ) : (
                <span className="text-xs text-subtle-foreground">Optional</span>
              )}
            </div>
            {editable && (
              <div className="flex shrink-0 items-center gap-1">
                <Button variant="outline" size="sm" onClick={onScan}>
                  <ScanLine /> Scan ID
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setNaming(true)}>
                  <UserPlus /> Name only
                </Button>
              </div>
            )}
          </>
        )}
      </div>
      {add.error && <ErrorNotice message={add.error.message} />}
    </div>
  );
}
