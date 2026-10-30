import {
  type BookingDetail,
  type InboxMessage,
  type Inquiry,
  type Language,
  languages,
  type PendingAction,
  type StayOption,
} from '@orbit/shared';
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Ban,
  BookOpenText,
  CalendarPlus,
  Check,
  Copy,
  Languages,
  Mail,
  MessageSquarePlus,
  PenLine,
  RotateCw,
  Send,
} from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { ThinkingOrb } from 'thinking-orbs';
import { ErrorNotice } from '@/components/error-notice';
import { GuestAvatar } from '@/components/guest-avatar';
import { ReceiveDialog } from '@/components/inbox-dialogs';
import { Panel } from '@/components/panel';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useBookingDrawer } from '@/hooks/use-booking-drawer';
import { useBookingEditor } from '@/hooks/use-booking-editor';
import { useSession } from '@/hooks/use-session';
import { useToast } from '@/hooks/use-toast';
import {
  useBookingDetail,
  useDeclineInquiry,
  useGuests,
  useHealth,
  useDraftInquiry,
  useInboxHold,
  useInquiry,
  useReadInquiry,
  useSendReply,
  useLearnFromReply,
  useResolvePendingAction,
  useSetArchived,
  useSetUnread,
  useTranslateMessage,
  useTranslateText,
} from '@/lib/api';
import {
  formatDate,
  formatDateTime,
  formatPrice,
  languageLabels,
  statusLabels,
} from '@/lib/format';
import {
  analysisFacts,
  bookingPrefillFor,
  canDecline,
  channelLabel,
  guestLanguage,
  isRead,
  sendLabel,
  senderLabel,
} from '@/lib/inbox';
import { entryHints } from '@/lib/settings';
import { cn } from '@/lib/utils';

/**
 * One conversation: its history, Orbit's help when asked for, and the reply. Preparing reads the
 * request and shows its rooms first, then writes the reply; holding a room rewrites the reply to
 * say so, unless staff have edited it, when they are asked first.
 */
export function Conversation({ id }: { id: string }) {
  const inquiry = useInquiry(id);
  const health = useHealth();
  const { current } = useSession();
  const setUnread = useSetUnread(id);
  const reading = useReadInquiry(id);
  const drafting = useDraftInquiry(id);
  const learn = useLearnFromReply(id);
  const aiOn = health.data?.ai.configured ?? false;
  const myLanguage: Language = current?.language ?? 'en';
  const m = inquiry.data;
  // The reply box starts again from each new draft; staff edits are tracked per draft.
  const draftKey = `${m?.suggestion?.draft ?? ''}|${m?.messages.length ?? 0}`;
  const [editedKey, setEditedKey] = useState<string | null>(null);
  const edited = editedKey === draftKey;
  // A room held after staff edited the reply: the reply doesn't say so until they update it.
  const [heldSinceEdit, setHeldSinceEdit] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);

  // Opening a conversation reads it, as in any mail client.
  const marked = useRef(false);
  const { mutate: markUnread } = setUnread;
  useEffect(() => {
    if (m?.unread && !marked.current) {
      marked.current = true;
      markUnread(false);
    }
  }, [m?.unread, markUnread]);

  if (inquiry.isError) return <ErrorNotice message={inquiry.error.message} className="m-6" />;
  if (!m) return <Skeleton className="m-6 h-96" />;

  const draft = () => {
    setHeldSinceEdit(null);
    drafting.mutate({ language: myLanguage });
  };
  // Rooms first, from the reading, then the reply written for them.
  const prepare = () =>
    reading.mutate({ force: false }, { onSuccess: (r) => isRead(r) && draft() });
  const onHeld = (roomName: string) => {
    if (!aiOn) return;
    if (edited) setHeldSinceEdit(roomName);
    else draft();
  };
  const read = isRead(m);
  const busy = reading.isPending || drafting.isPending;
  // Before Orbit has read the guest's latest message, preparing is the main step; the empty
  // reply box waits behind "Write it yourself".
  const offerPrepare =
    m.status !== 'declined' && aiOn && !read && m.messages.at(-1)?.direction === 'in';

  return (
    <article className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-6">
      <Header inquiry={m} />
      <ol className="flex flex-col gap-3">
        {m.messages.map((msg) => (
          <Message
            key={msg.id}
            inquiry={m}
            message={msg}
            myLanguage={myLanguage}
            canTranslate={aiOn}
          />
        ))}
      </ol>
      {learn.data && <LearnedFact key={learn.data.id} action={learn.data} />}
      {offerPrepare && (
        <Prepare
          reading={reading.isPending}
          onPrepare={prepare}
          onWrite={writing ? undefined : () => setWriting(true)}
        />
      )}
      {read && m.suggestion?.note && m.suggestion.options.length === 0 && (
        <p className="rounded-stage bg-background px-4 py-3 text-sm text-muted-foreground shadow-[0_1px_2px_var(--shadow-soft)] stroke-lit">
          {m.suggestion.note}
        </p>
      )}
      {read && m.suggestion && m.suggestion.options.length > 0 && (
        <Options
          inquiry={m}
          options={m.suggestion.options}
          note={m.suggestion.note}
          locked={drafting.isPending}
          onHeld={onHeld}
        />
      )}
      {m.status !== 'declined' && (!offerPrepare || writing || reading.isPending) && (
        <ReplyEditor
          key={draftKey}
          inquiry={m}
          myLanguage={myLanguage}
          aiOn={aiOn}
          drafting={drafting.isPending}
          busy={busy}
          error={reading.error ?? drafting.error}
          heldSinceEdit={heldSinceEdit}
          onEdit={() => setEditedKey(draftKey)}
          onDraft={read ? draft : prepare}
          // What staff wrote themselves may hold something the hotel information lacks.
          onSent={() => aiOn && (edited || !m.suggestion?.draft) && learn.mutate()}
        />
      )}
    </article>
  );
}

/**
 * A fact from the reply just sent that the hotel information doesn't have yet, offered to keep
 * for the next guest who asks. Saving confirms the proposal, so it is in the activity log.
 */
function LearnedFact({ action }: { action: PendingAction }) {
  const resolve = useResolvePendingAction(action.id);
  const status = resolve.data?.status ?? action.status;
  if (action.kind !== 'save_hotel_info' || status === 'rejected') return null;
  const { category, title, details, until } = action.input;
  const where = entryHints[category].title;
  // The entry it replaces, as it read when the fact was proposed.
  const before = action.details?.changes[0]?.before;
  const was = before && 'text' in before ? before.text : null;

  if (status === 'confirmed') {
    return (
      <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
        <Check className="size-4 text-success" /> {was ? 'Updated in' : 'Saved to'} {where}: {title}
      </p>
    );
  }
  return (
    <section
      aria-label={`${was ? 'Update in' : 'Save to'} ${where}`}
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-stage bg-background px-4 py-3 text-sm shadow-[0_1px_2px_var(--shadow-soft)] stroke-lit motion-safe:animate-in motion-safe:fade-in"
    >
      <BookOpenText className="size-4 shrink-0 text-muted-foreground" />
      <p className="min-w-56 flex-1">
        <span className="text-muted-foreground">
          {was ? 'Update in' : 'Save to'} {where}:{' '}
        </span>
        <span className="font-medium">{title}</span>
        <span className="text-muted-foreground">
          {' '}
          · {details}
          {until && ` Until ${formatDate(until)}.`}
        </span>
        {was && (
          <span className="mt-0.5 block text-xs text-subtle-foreground line-through decoration-ink/30">
            {was}
          </span>
        )}
      </p>
      {(resolve.error || status === 'failed') && (
        <ErrorNotice message={resolve.error?.message ?? resolve.data?.error ?? 'Could not save'} />
      )}
      <span className="flex shrink-0 items-center gap-1.5">
        <Button
          variant="ghost"
          size="xs"
          disabled={resolve.isPending}
          onClick={() => resolve.mutate('reject')}
        >
          Not now
        </Button>
        <Button
          size="xs"
          variant="outline"
          disabled={resolve.isPending}
          onClick={() => resolve.mutate('confirm')}
        >
          {was ? 'Update' : 'Save'}
        </Button>
      </span>
    </section>
  );
}

/** Before Orbit has read the latest message: the buttons to draft a reply or write one. */
function Prepare({
  reading,
  onPrepare,
  onWrite,
}: {
  reading: boolean;
  onPrepare: () => void;
  /** Opens the reply box without Orbit; absent once it is open. */
  onWrite?: () => void;
}) {
  return (
    <section aria-label="Prepare a reply" className="flex min-h-8 items-center justify-end gap-1.5">
      {reading ? (
        <p role="status" className="flex items-center gap-3 text-sm text-muted-foreground">
          <ThinkingOrb state="searching" size={20} aria-hidden />
          Reading the message…
        </p>
      ) : (
        <>
          {onWrite && (
            <Button variant="ghost" size="sm" onClick={onWrite}>
              Write it yourself
            </Button>
          )}
          <Button size="sm" onClick={onPrepare}>
            <PenLine /> Prepare reply
          </Button>
        </>
      )}
    </section>
  );
}

function Header({ inquiry: m }: { inquiry: Inquiry }) {
  const { openNew } = useBookingEditor();
  const { open } = useBookingDrawer();
  const guests = useGuests();
  const setUnread = useSetUnread(m.id);
  const setArchived = useSetArchived(m.id);
  const decline = useDeclineInquiry(m.id);
  const [receiving, setReceiving] = useState(false);
  const { toast } = useToast();
  const archived = m.archivedAt !== null;
  const error = setUnread.error ?? setArchived.error ?? decline.error;

  return (
    <header className="flex flex-col gap-3">
      <div className="flex items-start gap-2">
        <Button variant="ghost" size="icon-sm" asChild className="lg:hidden">
          <Link to="/inbox" aria-label="Back to the list">
            <ArrowLeft />
          </Link>
        </Button>
        <h2 className="min-w-0 flex-1 text-xl font-semibold tracking-tight">
          {m.subject ?? '(no subject)'}
        </h2>
        <div className="flex shrink-0 items-center gap-0.5">
          <IconButton label="Add the guest's reply" onClick={() => setReceiving(true)}>
            <MessageSquarePlus />
          </IconButton>
          <IconButton
            label="Mark as unread"
            onClick={() =>
              setUnread.mutate(true, {
                onSuccess: () =>
                  toast({
                    title: 'Marked as unread',
                    action: { label: 'Undo', run: () => setUnread.mutate(false) },
                  }),
              })
            }
          >
            <Mail />
          </IconButton>
          <IconButton
            label={archived ? 'Move back to the inbox' : 'Archive'}
            onClick={() =>
              setArchived.mutate(!archived, {
                onSuccess: () =>
                  toast({
                    title: archived ? 'Moved back to the inbox' : 'Archived',
                    action: { label: 'Undo', run: () => setArchived.mutate(archived) },
                  }),
              })
            }
          >
            {archived ? <ArchiveRestore /> : <Archive />}
          </IconButton>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="flex min-w-0 items-center gap-2.5">
          <GuestAvatar name={senderLabel(m)} size="md" />
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-medium">{senderLabel(m)}</span>
            <span className="truncate text-xs text-muted-foreground">
              {m.senderAddress && m.senderName ? `${m.senderAddress} · ` : ''}via {channelLabel(m)}
            </span>
          </span>
        </span>
        <span className="ml-auto flex flex-wrap items-center gap-1.5">
          {m.bookingId ? (
            <Button variant="outline" size="sm" onClick={() => open(m.bookingId!)}>
              Open booking
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              disabled={!guests.data}
              onClick={() => openNew(bookingPrefillFor(m, guests.data ?? []))}
            >
              <CalendarPlus /> Create booking
            </Button>
          )}
          {canDecline(m) && (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              disabled={decline.isPending}
              onClick={() => decline.mutate()}
            >
              <Ban /> Decline
            </Button>
          )}
        </span>
      </div>
      {m.parsed && (
        <div className="flex flex-col gap-2">
          <ul aria-label="What the guest asks for" className="flex flex-wrap gap-1.5">
            {analysisFacts(m.parsed).map((f) => (
              <li
                key={f}
                className="rounded-full bg-ink/5 px-2.5 py-0.5 text-xs text-muted-foreground"
              >
                {f}
              </li>
            ))}
          </ul>
          {m.parsed.question && (
            <p className="text-sm">
              <span className="text-muted-foreground">Asks: </span>
              {m.parsed.question}
            </p>
          )}
        </div>
      )}
      {m.status === 'declined' && (
        <p className="text-sm text-muted-foreground">Declined: no booking will be made.</p>
      )}
      {error && <ErrorNotice message={error.message} />}
      <ReceiveDialog id={m.id} open={receiving} onOpenChange={setReceiving} />
    </header>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="text-muted-foreground"
    >
      {children}
    </Button>
  );
}

/** A message in the thread. A guest's can be translated into the reader's language on request. */
function Message({
  inquiry,
  message,
  myLanguage,
  canTranslate,
}: {
  inquiry: Inquiry;
  message: InboxMessage;
  myLanguage: Language;
  canTranslate: boolean;
}) {
  const translate = useTranslateMessage(inquiry.id);
  const fromGuest = message.direction === 'in';
  const translated = message.translation?.language === myLanguage ? message.translation : null;
  const [showOriginal, setShowOriginal] = useState(false);
  const name = fromGuest ? senderLabel(inquiry) : (message.author ?? 'Reception');
  // A message already in the reader's language needs no translation.
  const offerTranslation =
    fromGuest && canTranslate && !translated && guestLanguage(inquiry) !== myLanguage;

  return (
    <li
      className={cn(
        'flex flex-col gap-2 rounded-stage p-4',
        fromGuest
          ? 'bg-background shadow-[0_1px_2px_var(--shadow-soft)] stroke-lit'
          : 'ml-6 bg-surface-sunken ring-1 ring-ink/5 ring-inset',
      )}
    >
      <div className="flex items-center gap-2 text-sm">
        <GuestAvatar name={name} />
        <span className="font-medium">{name}</span>
        {!fromGuest && (
          <span className="rounded-full bg-ink/5 px-1.5 text-[0.6875rem] text-muted-foreground">
            Hotel
          </span>
        )}
        <time className="ml-auto text-xs text-muted-foreground tabular-nums">
          {formatDateTime(message.sentAt)}
        </time>
      </div>
      {translated && !showOriginal ? (
        <div className="flex flex-col gap-1">
          <p className="leading-relaxed whitespace-pre-wrap">{translated.text}</p>
          <button
            type="button"
            onClick={() => setShowOriginal(true)}
            className="flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <Languages className="size-3" /> Translated into {languageLabels[myLanguage]} · Show
            original
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <p className="leading-relaxed whitespace-pre-wrap">{message.body}</p>
          {translated && (
            <button
              type="button"
              onClick={() => setShowOriginal(false)}
              className="flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Languages className="size-3" /> Show the {languageLabels[myLanguage]} translation
            </button>
          )}
          {offerTranslation && (
            <button
              type="button"
              disabled={translate.isPending}
              onClick={() => translate.mutate({ messageId: message.id, to: myLanguage })}
              className="flex w-fit items-center gap-1.5 text-xs text-primary-text hover:underline disabled:opacity-60"
            >
              {translate.isPending ? (
                <ThinkingOrb state="composing" size={20} className="-my-1 size-4" />
              ) : (
                <Languages className="size-3" />
              )}
              Translate into {languageLabels[myLanguage]}
            </button>
          )}
        </div>
      )}
      {translate.error && <ErrorNotice message={translate.error.message} />}
    </li>
  );
}

/**
 * The rooms for the request with their exact prices. Holding one reserves it for the guest and
 * rewrites the reply to say so; the held room is marked and listed first, and holding another
 * moves the hold there.
 */
function Options({
  inquiry,
  options,
  note,
  locked,
  onHeld,
}: {
  inquiry: Inquiry;
  options: StayOption[];
  note: string | null;
  /** While the reply is being written, the choice it is about stays put. */
  locked: boolean;
  onHeld: (roomName: string) => void;
}) {
  const hold = useInboxHold(inquiry.id);
  const held = useBookingDetail(inquiry.bookingId);
  const { open } = useBookingDrawer();
  const booking = held.data?.booking;
  // Rooms can change hands until the guest confirms; after that the booking is what counts.
  const canHold = !inquiry.bookingId || booking?.status === 'hold';
  const rows = heldFirst(options, held.data);

  return (
    <Panel title="Rooms for this stay" count={rows.length} contentClassName="p-0">
      {note && <p className="border-b px-3 py-2 text-sm text-muted-foreground">{note}</p>}
      <ul className="flex flex-col">
        {rows.map((o) => {
          const isHeld = booking?.roomId === o.roomId;
          const holding = hold.isPending && hold.variables === o.roomId;
          return (
            <li
              key={o.roomId}
              className={cn(
                'flex items-center gap-3 border-b px-3 py-2 last:border-b-0',
                isHeld && 'bg-primary-soft first:rounded-t-stage last:rounded-b-stage',
              )}
            >
              <span className="rounded-[5px] border border-ink/7 bg-background px-1.5 py-px font-mono text-xs">
                {o.roomName}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm text-muted-foreground">
                  {o.roomTypeName} · {o.quote.nights} {o.quote.nights === 1 ? 'night' : 'nights'}
                </span>
                {isHeld && booking && (
                  <span className="truncate text-xs text-primary-text">
                    {booking.status === 'hold'
                      ? booking.holdExpiresAt
                        ? `Held for the guest until ${formatDateTime(booking.holdExpiresAt)}`
                        : 'Held for the guest'
                      : `${statusLabels[booking.status]} booking`}
                  </span>
                )}
              </span>
              <span className="font-mono text-sm tabular-nums">{formatPrice(o.quote.total)}</span>
              {isHeld && booking ? (
                <Button size="xs" variant="ghost" onClick={() => open(booking.id)}>
                  Open
                </Button>
              ) : (
                canHold && (
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={hold.isPending || locked}
                    onClick={() => hold.mutate(o.roomId, { onSuccess: () => onHeld(o.roomName) })}
                  >
                    {holding ? 'Holding…' : booking ? 'Hold instead' : 'Hold'}
                  </Button>
                )
              )}
            </li>
          );
        })}
      </ul>
      {hold.isError && <ErrorNotice message={hold.error.message} className="m-2" />}
    </Panel>
  );
}

/** The offer with the held room first, added from the booking if the offer doesn't have it. */
function heldFirst(options: StayOption[], held: BookingDetail | undefined): StayOption[] {
  if (!held) return options;
  const { booking, room, roomType } = held;
  const fromOffer = options.find((o) => o.roomId === room.id);
  const first =
    fromOffer ??
    (booking.priceSnapshot && {
      roomId: room.id,
      roomName: room.name,
      roomTypeName: roomType.name,
      kind: room.kind,
      quote: booking.priceSnapshot,
    });
  if (!first) return options;
  return [first, ...options.filter((o) => o.roomId !== room.id)];
}

type Side = 'theirs' | 'mine';

/**
 * The reply: one text in the guest's language, which is what is sent. When the staff member
 * reads another language, a tab shows the same reply in theirs to read or write in; either side
 * translates into the other, and sending waits until edits in the staff's language are in the
 * guest's text. A draft is written only when asked for.
 */
function ReplyEditor({
  inquiry: m,
  myLanguage,
  aiOn,
  drafting,
  busy,
  error: prepareError,
  heldSinceEdit,
  onEdit,
  onDraft,
  onSent,
}: {
  inquiry: Inquiry;
  myLanguage: Language;
  aiOn: boolean;
  /** A draft is being written; it replaces the text. */
  drafting: boolean;
  /** Reading or drafting: sending waits. */
  busy: boolean;
  error: Error | null;
  /** A room held after the staff member edited the reply, which doesn't mention it yet. */
  heldSinceEdit: string | null;
  /** The staff member changed the reply. */
  onEdit: () => void;
  onDraft: () => void;
  onSent: () => void;
}) {
  const suggestion = m.suggestion;
  const toTheirs = useTranslateText();
  const toMine = useTranslateText();
  const send = useSendReply(m.id);
  const [theirLanguage, setTheirLanguage] = useState<Language>(guestLanguage(m) ?? myLanguage);
  const [theirs, setTheirs] = useState(suggestion?.draft ?? '');
  const [mine, setMine] = useState(
    suggestion?.draftTranslation?.language === myLanguage ? suggestion.draftTranslation.text : '',
  );
  // The side changed since the two last matched; the other one is behind.
  const [edited, setEdited] = useState<Side | null>(null);
  const bilingual = aiOn && theirLanguage !== myLanguage;
  // A draft opens in the staff member's language, so they can read it first.
  const [view, setView] = useState<Side>(mine ? 'mine' : 'theirs');
  const showing: Side = bilingual ? view : 'theirs';
  const translating = toTheirs.isPending || toMine.isPending;
  // Edits in the staff's language that the guest's text doesn't have yet.
  const behind = bilingual && edited === 'mine';
  const theirName = languageLabels[theirLanguage];
  const myName = languageLabels[myLanguage];

  const translateToTheirs = () =>
    toTheirs.mutate(
      { text: mine, to: theirLanguage },
      {
        onSuccess: (r) => {
          setTheirs(r.text);
          setEdited(null);
        },
      },
    );
  const translateToMine = () =>
    toMine.mutate(
      { text: theirs, to: myLanguage },
      {
        onSuccess: (r) => {
          setMine(r.text);
          setEdited(null);
        },
      },
    );
  // Opening the staff's tab when it has nothing current translates the reply into it.
  const openMine = () => {
    setView('mine');
    if (theirs.trim() && (!mine.trim() || edited === 'theirs') && !translating) translateToMine();
  };

  const error = prepareError ?? toTheirs.error ?? toMine.error ?? send.error;

  return (
    <section
      aria-label="Reply"
      className="flex flex-col rounded-card bg-surface-sunken p-1 ring-1 ring-ink/5 ring-inset"
    >
      <div className="flex min-h-9 flex-wrap items-center gap-2 px-2 pt-0.5 pb-1">
        {bilingual ? (
          <div role="tablist" aria-label="Reply language" className="flex items-center gap-0.5">
            <LanguageTab selected={showing === 'theirs'} onClick={() => setView('theirs')}>
              {theirName}
              <span className="text-subtle-foreground">· sent</span>
            </LanguageTab>
            <LanguageTab selected={showing === 'mine'} onClick={openMine}>
              {myName}
              {edited === 'theirs' && mine && (
                <span aria-label="out of date" className="size-1.5 rounded-full bg-warning" />
              )}
            </LanguageTab>
          </div>
        ) : (
          <h3 className="px-1 text-[0.8125rem] text-muted-foreground">Reply</h3>
        )}
        {aiOn && (
          <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            Guest writes
            <NativeSelect
              value={theirLanguage}
              onChange={(e) => setTheirLanguage(e.target.value as Language)}
              className="h-7 w-32 text-xs"
            >
              {languages.map((l) => (
                <option key={l} value={l}>
                  {languageLabels[l]}
                </option>
              ))}
            </NativeSelect>
          </label>
        )}
      </div>

      {heldSinceEdit && (
        <div className="mb-1 flex flex-wrap items-center gap-2 rounded-stage bg-primary-soft px-3 py-2 text-sm">
          <span className="min-w-0 flex-1">
            Your reply doesn&apos;t mention room {heldSinceEdit} yet.
          </span>
          <Button size="xs" variant="outline" disabled={busy} onClick={onDraft}>
            <RotateCw /> Rewrite for room {heldSinceEdit}
          </Button>
        </div>
      )}
      <div className="relative flex flex-col rounded-stage bg-background shadow-[0_1px_2px_var(--shadow-soft)] stroke-lit">
        {/* While a draft is written, it covers the old text, which it is about to replace. */}
        <div className="relative flex flex-col">
          <Textarea
            aria-label={
              showing === 'mine' ? `Reply in ${myName}` : `Reply to the guest in ${theirName}`
            }
            value={showing === 'mine' ? mine : theirs}
            onChange={(e) => {
              if (showing === 'mine') setMine(e.target.value);
              else setTheirs(e.target.value);
              setEdited(showing);
              onEdit();
            }}
            placeholder={
              drafting ? undefined : showing === 'mine' ? `Write in ${myName}…` : 'Write a reply…'
            }
            disabled={drafting || (showing === 'mine' && toMine.isPending)}
            className="min-h-56 resize-none rounded-stage border-0 bg-transparent px-4 py-3 leading-relaxed shadow-none focus-visible:ring-0 disabled:bg-transparent"
          />
          {drafting && (
            <div
              role="status"
              className="absolute inset-0 flex items-start gap-3 rounded-t-stage bg-background/90 px-4 py-3 text-sm text-muted-foreground"
            >
              <ThinkingOrb state="composing" size={20} aria-hidden />
              Writing the reply…
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 border-t px-2 py-2">
          <Button
            size="sm"
            disabled={!theirs.trim() || send.isPending || behind || translating || busy}
            title={behind ? `Translate your ${myName} changes first` : undefined}
            onClick={() => send.mutate(theirs, { onSuccess: onSent })}
          >
            <Send /> {sendLabel(m)}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={!theirs.trim()}
            onClick={() => void navigator.clipboard.writeText(theirs)}
          >
            <Copy /> Copy
          </Button>
          <span className="flex min-w-0 flex-1 items-center justify-end gap-2 text-xs text-muted-foreground">
            {translating ? (
              <>
                <ThinkingOrb state="composing" size={20} className="size-4" aria-hidden />
                Translating…
              </>
            ) : behind ? (
              <>
                <span className="truncate">Not in the {theirName} reply yet</span>
                <Button
                  variant="outline"
                  size="xs"
                  disabled={!mine.trim()}
                  onClick={translateToTheirs}
                >
                  <Languages /> Translate into {theirName}
                </Button>
              </>
            ) : showing === 'mine' && edited === 'theirs' && mine ? (
              <>
                <span className="truncate">The {theirName} reply changed</span>
                <Button variant="ghost" size="xs" onClick={translateToMine}>
                  <RotateCw /> Update
                </Button>
              </>
            ) : (
              showing === 'mine' && (
                <span className="truncate">Only the {theirName} reply is sent</span>
              )
            )}
            {aiOn && m.suggestion?.draft && (
              <Button variant="ghost" size="xs" disabled={busy} onClick={onDraft}>
                <RotateCw /> Redraft
              </Button>
            )}
          </span>
        </div>
      </div>
      {(m.processingError || error) && (
        <ErrorNotice message={error?.message ?? m.processingError ?? ''} className="mt-1" />
      )}
    </section>
  );
}

function LanguageTab({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onClick}
      className={cn(
        'relative flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[0.8125rem] text-muted-foreground outline-none transition-colors duration-150 ease-snap hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
        selected && 'fill-action text-foreground shadow-action stroke-lit',
      )}
    >
      {children}
    </button>
  );
}
