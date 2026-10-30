import { differenceInCalendarDays, parseISO } from 'date-fns';
import {
  type BookingDetail,
  bookingSources,
  type Language,
  languages,
  type RoomOption,
} from '@orbit/shared';
import { Check, LoaderCircle, Search, X } from 'lucide-react';
import { type FormEvent, type ReactNode, useMemo, useState } from 'react';
import { ErrorNotice } from '@/components/error-notice';
import { FormField } from '@/components/form-field';
import { GuestAvatar } from '@/components/guest-avatar';
import { Segmented } from '@/components/segmented';
import { Stepper } from '@/components/stepper';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useBookingDrawer } from '@/hooks/use-booking-drawer';
import { BookingEditorContext, type BookingEditorContextValue } from '@/hooks/use-booking-editor';
import {
  useBookingDetail,
  useBookingPreview,
  useCreateBooking,
  useDayOverview,
  useGuests,
  useHotelProfile,
  useRoomOptions,
  useUpdateBooking,
} from '@/lib/api';
import {
  type BookingForm,
  bookingPatch,
  createBookingInput,
  editBookingForm,
  type GuestChoice,
  type NewBookingPrefill,
  newBookingForm,
  roomOptionsQuery,
  sourceLabels,
} from '@/lib/booking-editor';
import { formatMoney, formatPrice, formatRange, languageLabels } from '@/lib/format';
import { isIsoDate } from '@/lib/tape-chart';
import { cn } from '@/lib/utils';

type EditorState =
  { mode: 'new'; prefill: NewBookingPrefill } | { mode: 'edit'; bookingId: string };

/** Hosts the booking editor dialog so any page, menu or cell can open it. */
export function BookingEditorProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<EditorState | null>(null);
  // Bumped on every open, so reopening starts from a fresh form.
  const [session, setSession] = useState(0);
  const value = useMemo<BookingEditorContextValue>(
    () => ({
      openNew: (prefill = {}) => {
        setSession((n) => n + 1);
        setState({ mode: 'new', prefill });
      },
      openEdit: (bookingId) => {
        setSession((n) => n + 1);
        setState({ mode: 'edit', bookingId });
      },
    }),
    [],
  );
  const close = () => setState(null);

  return (
    <BookingEditorContext.Provider value={value}>
      {children}
      <Dialog open={state !== null} onOpenChange={(open) => !open && close()}>
        <DialogContent
          {...(state?.mode === 'new' && { 'aria-describedby': undefined })}
          className="flex max-h-[calc(100svh-2rem)] flex-col gap-0 p-0 shadow-floating sm:max-w-2xl"
        >
          {state?.mode === 'new' && (
            <NewBooking key={session} prefill={state.prefill} onDone={close} />
          )}
          {state?.mode === 'edit' && (
            <EditBooking key={session} bookingId={state.bookingId} onDone={close} />
          )}
        </DialogContent>
      </Dialog>
    </BookingEditorContext.Provider>
  );
}

function NewBooking({ prefill, onDone }: { prefill: NewBookingPrefill; onDone: () => void }) {
  const day = useDayOverview();
  const profile = useHotelProfile();
  if (!day.data) {
    return (
      <div className="p-6">
        <DialogTitle className="sr-only">New booking</DialogTitle>
        <Skeleton className="h-96" />
      </div>
    );
  }
  return (
    <NewBookingForm
      initial={newBookingForm(day.data.date, prefill, profile.data?.language)}
      onDone={onDone}
    />
  );
}

function NewBookingForm({ initial, onDone }: { initial: BookingForm; onDone: () => void }) {
  const [form, setForm] = useState(initial);
  const create = useCreateBooking();
  const { open } = useBookingDrawer();
  const options = useRoomOptions(roomOptionsQuery(form));
  const input = createBookingInput(form);
  const chosen = options.data?.find((o) => o.roomId === form.roomId);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!input) return;
    create.mutate(input, {
      onSuccess: (detail) => {
        onDone();
        open(detail.booking.id);
      },
    });
  }

  return (
    <EditorShell
      title="New booking"
      onSubmit={submit}
      footer={
        <>
          <PriceSummary
            text={
              chosen
                ? `Room ${chosen.roomName}: ${formatPrice(chosen.quote.total)}`
                : 'Choose a room to see the price'
            }
          />
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" disabled={!input || !chosen || create.isPending}>
            {form.status === 'confirmed' ? 'Create booking' : 'Create hold'}
          </Button>
        </>
      }
      error={create.error?.message}
    >
      <StayFields form={form} onChange={setForm} />
      <RoomPicker
        form={form}
        onChange={setForm}
        options={options.data}
        loading={options.isFetching}
        error={options.error?.message}
      />
      <GuestFields guest={form.guest} onChange={(guest) => setForm({ ...form, guest })} />
      <DetailFields form={form} onChange={setForm} showStatus />
    </EditorShell>
  );
}

function EditBooking({ bookingId, onDone }: { bookingId: string; onDone: () => void }) {
  const detail = useBookingDetail(bookingId);
  if (detail.isError) {
    return (
      <div className="p-6">
        <DialogTitle>Booking not found</DialogTitle>
        <ErrorNotice message={detail.error.message} className="mt-3" />
      </div>
    );
  }
  if (!detail.data) {
    return (
      <div className="p-6">
        <DialogTitle className="sr-only">Edit booking</DialogTitle>
        <Skeleton className="h-96" />
      </div>
    );
  }
  return <EditBookingForm detail={detail.data} onDone={onDone} />;
}

function EditBookingForm({ detail, onDone }: { detail: BookingDetail; onDone: () => void }) {
  const { booking, guest, room } = detail;
  const [form, setForm] = useState(() => editBookingForm(booking));
  const update = useUpdateBooking();
  const options = useRoomOptions(roomOptionsQuery(form, booking.id));
  const patch = bookingPatch(booking, form);
  const changed = Object.keys(patch).length > 0;
  const preview = useBookingPreview(booking.id, changed ? patch : null);
  // Finished and cancelled stays only take notes; checked-in guests keep their arrival.
  const notesOnly = booking.status === 'checked_out' || booking.status === 'cancelled';
  const was = booking.priceSnapshot?.total;
  const now = preview.data?.booking.priceSnapshot?.total;

  function submit(e: FormEvent) {
    e.preventDefault();
    update.mutate({ id: booking.id, patch }, { onSuccess: onDone });
  }

  return (
    <EditorShell
      title={`Edit booking · ${guest.name}`}
      description={`Room ${room.name}, ${formatRange(booking.checkIn, booking.checkOut)} · ${booking.id}`}
      onSubmit={submit}
      footer={
        <>
          <PriceSummary
            text={
              !changed
                ? was !== undefined
                  ? `Total ${formatMoney(was)}`
                  : 'No changes yet'
                : preview.isFetching
                  ? 'Checking the change…'
                  : now !== undefined && was !== undefined && now !== was
                    ? `New total ${formatMoney(now)} (was ${formatMoney(was)})`
                    : now !== undefined
                      ? `Total stays ${formatMoney(now)}`
                      : ''
            }
          />
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" disabled={!changed || preview.isError || update.isPending}>
            Save changes
          </Button>
        </>
      }
      error={update.error?.message ?? (changed ? preview.error?.message : undefined)}
    >
      {notesOnly && (
        <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
          This booking is {booking.status.replace('_', ' ')}, so only its notes can change.
        </p>
      )}
      <StayFields
        form={form}
        onChange={setForm}
        disabled={notesOnly}
        lockCheckIn={booking.status === 'checked_in'}
      />
      {!notesOnly && (
        <RoomPicker
          form={form}
          onChange={setForm}
          options={options.data}
          loading={options.isFetching}
          error={options.error?.message}
          currentRoomId={booking.roomId}
        />
      )}
      <DetailFields form={form} onChange={setForm} notesOnly={notesOnly} />
    </EditorShell>
  );
}

function EditorShell({
  title,
  description,
  onSubmit,
  footer,
  error,
  children,
}: {
  title: string;
  description?: string;
  onSubmit: (e: FormEvent) => void;
  footer: ReactNode;
  error: string | undefined;
  children: ReactNode;
}) {
  return (
    <form onSubmit={onSubmit} className="flex min-h-0 flex-col">
      <DialogHeader className="border-b p-5">
        <DialogTitle>{title}</DialogTitle>
        {description && <DialogDescription>{description}</DialogDescription>}
      </DialogHeader>
      <div className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-5">
        {children}
      </div>
      {error && <ErrorNotice message={error} className="mx-5 mb-3" />}
      <DialogFooter className="m-0 flex-row items-center gap-2 p-4">{footer}</DialogFooter>
    </form>
  );
}

function PriceSummary({ text }: { text: string }) {
  return <p className="mr-auto truncate text-sm font-medium tabular-nums">{text}</p>;
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-3">
      <legend className="mb-3 text-sm font-medium">{title}</legend>
      {children}
    </fieldset>
  );
}

/** Nights in a stay, 0 while the dates are incomplete or the wrong way round. */
function stayNights(checkIn: string, checkOut: string): number {
  if (!isIsoDate(checkIn) || !isIsoDate(checkOut)) return 0;
  return Math.max(0, differenceInCalendarDays(parseISO(checkOut), parseISO(checkIn)));
}

function StayFields({
  form,
  onChange,
  disabled = false,
  lockCheckIn = false,
}: {
  form: BookingForm;
  onChange: (form: BookingForm) => void;
  disabled?: boolean;
  lockCheckIn?: boolean;
}) {
  const set = (patch: Partial<BookingForm>) => onChange({ ...form, ...patch, roomId: form.roomId });

  return (
    <Group title="Stay">
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField
          label="Arrival"
          htmlFor="be-check-in"
          hint={lockCheckIn ? 'The guest has checked in.' : undefined}
        >
          <Input
            id="be-check-in"
            type="date"
            required
            disabled={disabled || lockCheckIn}
            value={form.checkIn}
            onChange={(e) => set({ checkIn: e.target.value })}
          />
        </FormField>
        <FormField label="Departure" htmlFor="be-check-out">
          <Input
            id="be-check-out"
            type="date"
            required
            disabled={disabled}
            min={form.checkIn}
            value={form.checkOut}
            onChange={(e) => set({ checkOut: e.target.value })}
          />
        </FormField>
        {/* Date fields follow the computer's locale; this line is in the hotel's own style. */}
        {stayNights(form.checkIn, form.checkOut) > 0 && (
          <p className="-mt-1.5 text-xs text-muted-foreground sm:col-span-2">
            {formatRange(form.checkIn, form.checkOut)} ·{' '}
            {stayNights(form.checkIn, form.checkOut) === 1
              ? '1 night'
              : `${stayNights(form.checkIn, form.checkOut)} nights`}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-start gap-x-8 gap-y-3">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Adults</span>
          <Stepper
            label="Adults"
            value={form.adults}
            min={1}
            disabled={disabled}
            onChange={(adults) => set({ adults })}
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Children</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {form.childAges.map((age, i) => (
              <span
                key={i}
                className="inline-flex h-9 items-center gap-1 rounded-control border bg-background pr-1 pl-3 text-sm tabular-nums"
              >
                {age === 0 ? 'Baby' : `${age} y`}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Remove child aged ${age}`}
                  disabled={disabled}
                  onClick={() => set({ childAges: form.childAges.filter((_, j) => j !== i) })}
                >
                  <X />
                </Button>
              </span>
            ))}
            {/* Picking an age adds the child: there is no age chosen in advance. */}
            <NativeSelect
              aria-label="Add a child, by age"
              value=""
              disabled={disabled}
              onChange={(e) =>
                e.target.value !== '' &&
                set({ childAges: [...form.childAges, Number(e.target.value)] })
              }
              className="w-36"
            >
              <option value="" disabled>
                {form.childAges.length === 0 ? 'Add a child…' : 'Add another…'}
              </option>
              {Array.from({ length: 18 }, (_, age) => (
                <option key={age} value={age}>
                  {age === 0 ? 'Baby (under 1)' : `${age} ${age === 1 ? 'year' : 'years'} old`}
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            disabled={disabled}
            checked={form.addons.wellness}
            onChange={(e) => set({ addons: { ...form.addons, wellness: e.target.checked } })}
          />
          Wellness
        </label>
        <span className="flex items-center gap-2 text-sm">
          Dogs
          <Stepper
            label="Dogs"
            value={form.addons.dogs}
            max={3}
            disabled={disabled}
            onChange={(dogs) => set({ addons: { ...form.addons, dogs } })}
          />
        </span>
        <span className="flex items-center gap-2 text-sm">
          Extra beds
          <Stepper
            label="Extra beds"
            value={form.addons.extraBeds}
            max={2}
            disabled={disabled}
            onChange={(extraBeds) => set({ addons: { ...form.addons, extraBeds } })}
          />
        </span>
      </div>
    </Group>
  );
}

function RoomPicker({
  form,
  onChange,
  options,
  loading,
  error,
  currentRoomId,
}: {
  form: BookingForm;
  onChange: (form: BookingForm) => void;
  options: RoomOption[] | undefined;
  loading: boolean;
  error: string | undefined;
  currentRoomId?: string;
}) {
  const selectedMissing =
    form.roomId !== null && options !== undefined && !options.some((o) => o.roomId === form.roomId);
  return (
    <Group title="Room">
      {error ? (
        <ErrorNotice message={error} />
      ) : !options ? (
        <p className="text-sm text-muted-foreground">
          {loading ? 'Finding free rooms…' : 'Enter the stay to see free rooms.'}
        </p>
      ) : options.length === 0 ? (
        <p className="text-sm text-muted-foreground">No free rooms for this stay.</p>
      ) : (
        <div
          role="radiogroup"
          aria-label="Room"
          className={cn(
            'scrollbar-thin flex max-h-56 flex-col overflow-y-auto rounded-control border',
            loading && 'opacity-60',
          )}
        >
          {options.map((o) => {
            const selected = o.roomId === form.roomId;
            return (
              <button
                key={o.roomId}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onChange({ ...form, roomId: o.roomId })}
                className={cn(
                  'flex items-center gap-3 border-b px-3 py-2 text-left text-sm outline-none last:border-b-0 hover:bg-accent focus-visible:bg-accent',
                  selected && 'bg-primary-soft hover:bg-primary-soft',
                )}
              >
                <span className="flex size-4 shrink-0 items-center justify-center">
                  {selected && <Check className="size-4 text-primary-text" />}
                </span>
                <span className="rounded-md border border-ink/7 bg-background px-1.5 py-0.5 font-mono text-xs">
                  {o.roomName}
                </span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">
                  {o.roomType.name}
                  {o.roomId === currentRoomId && ' · current room'}
                </span>
                <span className="shrink-0 font-medium tabular-nums">
                  {formatPrice(o.quote.total)}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {loading && options && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <LoaderCircle className="size-3 animate-spin" /> Updating prices…
        </p>
      )}
      {selectedMissing && (
        <p className="text-xs text-warning">
          The chosen room is not free for this stay or party any more. Pick another one.
        </p>
      )}
    </Group>
  );
}

function GuestFields({
  guest,
  onChange,
}: {
  guest: GuestChoice;
  onChange: (guest: GuestChoice) => void;
}) {
  const guests = useGuests();
  const hotelLanguage = useHotelProfile().data?.language ?? 'en';
  const [query, setQuery] = useState('');
  const chosen =
    guest.mode === 'existing' ? guests.data?.find((g) => g.id === guest.guestId) : undefined;
  const q = query.trim().toLowerCase();
  const matches = q
    ? (guests.data ?? [])
        .filter((g) => g.name.toLowerCase().includes(q) || g.email?.toLowerCase().includes(q))
        .slice(0, 6)
    : [];

  return (
    <Group title="Guest">
      <Segmented
        label="Guest"
        value={guest.mode}
        options={[
          { value: 'new', label: 'New guest' },
          { value: 'existing', label: 'Existing guest' },
        ]}
        onChange={(mode) =>
          onChange(
            mode === 'existing'
              ? { mode, guestId: null }
              : { mode, name: '', email: '', phone: '', language: hotelLanguage },
          )
        }
        className="self-start"
      />
      {guest.mode === 'existing' ? (
        chosen ? (
          <div className="flex items-center gap-3 rounded-control border px-3 py-2">
            <GuestAvatar name={chosen.name} size="md" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-medium">{chosen.name}</span>
              <span className="truncate text-xs text-muted-foreground">
                {chosen.email ?? languageLabels[chosen.language]}
              </span>
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange({ mode: 'existing', guestId: null })}
            >
              Change
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <label className="flex h-9 items-center gap-2 rounded-control border bg-background px-3 shadow-[inset_0_1px_2px_var(--shadow-soft)] focus-within:ring-3 focus-within:ring-ring/25">
              <Search className="size-4 text-muted-foreground" />
              <input
                autoFocus
                aria-label="Find a guest"
                placeholder="Find by name or email"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </label>
            {matches.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => onChange({ mode: 'existing', guestId: g.id })}
                className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm outline-none hover:bg-accent focus-visible:bg-accent"
              >
                <GuestAvatar name={g.name} />
                <span className="truncate">{g.name}</span>
                {g.email && <span className="truncate text-muted-foreground">{g.email}</span>}
              </button>
            ))}
            {q && matches.length === 0 && (
              <p className="px-2 py-1.5 text-sm text-muted-foreground">No guest matches.</p>
            )}
          </div>
        )
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Name" htmlFor="be-guest-name">
            <Input
              id="be-guest-name"
              required
              value={guest.name}
              onChange={(e) => onChange({ ...guest, name: e.target.value })}
            />
          </FormField>
          <FormField label="Language" htmlFor="be-guest-language">
            <NativeSelect
              id="be-guest-language"
              value={guest.language}
              onChange={(e) => onChange({ ...guest, language: e.target.value as Language })}
            >
              {languages.map((l) => (
                <option key={l} value={l}>
                  {languageLabels[l]}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField label="Email" htmlFor="be-guest-email">
            <Input
              id="be-guest-email"
              type="email"
              value={guest.email}
              onChange={(e) => onChange({ ...guest, email: e.target.value })}
            />
          </FormField>
          <FormField label="Phone" htmlFor="be-guest-phone">
            <Input
              id="be-guest-phone"
              type="tel"
              value={guest.phone}
              onChange={(e) => onChange({ ...guest, phone: e.target.value })}
            />
          </FormField>
        </div>
      )}
    </Group>
  );
}

function DetailFields({
  form,
  onChange,
  showStatus = false,
  notesOnly = false,
}: {
  form: BookingForm;
  onChange: (form: BookingForm) => void;
  showStatus?: boolean;
  notesOnly?: boolean;
}) {
  return (
    <Group title="Details">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <FormField label="Source" htmlFor="be-source" className="w-40">
          <NativeSelect
            id="be-source"
            value={form.source}
            disabled={notesOnly}
            onChange={(e) => onChange({ ...form, source: e.target.value as BookingForm['source'] })}
          >
            {bookingSources.map((s) => (
              <option key={s} value={s}>
                {sourceLabels[s]}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        {showStatus && (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Status</span>
            <Segmented
              label="Status"
              value={form.status}
              options={[
                { value: 'hold', label: 'Hold' },
                { value: 'confirmed', label: 'Confirmed' },
              ]}
              onChange={(status) => onChange({ ...form, status })}
            />
          </div>
        )}
      </div>
      <FormField label="Notes" htmlFor="be-notes">
        <Textarea
          id="be-notes"
          rows={2}
          placeholder="Arrival time, requests, anything the team should know"
          value={form.notes}
          onChange={(e) => onChange({ ...form, notes: e.target.value })}
        />
      </FormField>
    </Group>
  );
}
