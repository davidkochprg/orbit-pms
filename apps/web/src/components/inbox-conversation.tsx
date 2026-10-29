import {
  type InboxMessage,
  type Inquiry,
  type Language,
  languages,
  type StayOption,
} from '@orbit/shared';
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Ban,
  CalendarPlus,
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
import {
  useDeclineInquiry,
  useGuests,
  useHealth,
  useInboxHold,
  useInquiry,
  useProcessInquiry,
  useSendReply,
  useSetArchived,
  useSetUnread,
  useTranslateMessage,
  useTranslateText,
} from '@/lib/api';
import { formatMoney, formatDateTime, languageLabels } from '@/lib/format';
import {
  analysisFacts,
  bookingPrefillFor,
  canDecline,
  channelLabel,
  guestLanguage,
  sendLabel,
  senderLabel,
} from '@/lib/inbox';
import { cn } from '@/lib/utils';

/** One conversation: its history, Orbit's help when asked for, and the reply. */
export function Conversation({ id }: { id: string }) {
  const inquiry = useInquiry(id);
  const health = useHealth();
  const { current } = useSession();
  const setUnread = useSetUnread(id);
  const aiOn = health.data?.ai.configured ?? false;
  const myLanguage: Language = current?.language ?? 'en';
  const m = inquiry.data;

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
      {m.suggestion && m.suggestion.options.length > 0 && (
        <Options inquiry={m} options={m.suggestion.options} note={m.suggestion.note} />
      )}
      {m.status !== 'declined' && (
        <ReplyEditor
          key={`${m.processedAt ?? 'none'}:${m.messages.length}`}
          inquiry={m}
          myLanguage={myLanguage}
          aiOn={aiOn}
        />
      )}
    </article>
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
  const archived = m.archivedAt !== null;
  const error = setUnread.error ?? setArchived.error ?? decline.error;

  return (
    <header className="flex flex-col gap-3">
      <div className="flex items-start gap-2">
        <Button variant="ghost" size="icon-sm" asChild className="md:hidden">
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
          <IconButton label="Mark as unread" onClick={() => setUnread.mutate(true)}>
            <Mail />
          </IconButton>
          <IconButton
            label={archived ? 'Move back to the inbox' : 'Archive'}
            onClick={() => setArchived.mutate(!archived)}
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

/** Free rooms for the request with their exact prices, each of which can be held. */
function Options({
  inquiry,
  options,
  note,
}: {
  inquiry: Inquiry;
  options: StayOption[];
  note: string | null;
}) {
  const hold = useInboxHold(inquiry.id);
  return (
    <Panel title="Free rooms" count={options.length} contentClassName="p-0">
      {note && <p className="border-b px-3 py-2 text-sm text-muted-foreground">{note}</p>}
      <ul className="flex flex-col">
        {options.map((o) => (
          <li key={o.roomId} className="flex items-center gap-3 border-b px-3 py-2 last:border-b-0">
            <span className="rounded-[5px] border border-ink/7 px-1.5 py-px font-mono text-xs">
              {o.roomName}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
              {o.roomTypeName} · {o.quote.nights} {o.quote.nights === 1 ? 'night' : 'nights'}
            </span>
            <span className="font-mono text-sm tabular-nums">{formatMoney(o.quote.total)}</span>
            {!inquiry.bookingId && (
              <Button
                size="xs"
                variant="outline"
                disabled={hold.isPending}
                onClick={() => hold.mutate(o.roomId)}
              >
                Hold
              </Button>
            )}
          </li>
        ))}
      </ul>
      {hold.isError && <ErrorNotice message={hold.error.message} className="m-2" />}
    </Panel>
  );
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
}: {
  inquiry: Inquiry;
  myLanguage: Language;
  aiOn: boolean;
}) {
  const suggestion = m.suggestion;
  const process = useProcessInquiry(m.id);
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
  const lastFromGuest = m.messages.at(-1)?.direction === 'in';
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

  const error = process.error ?? toTheirs.error ?? toMine.error ?? send.error;

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

      <div className="relative flex flex-col rounded-stage bg-background shadow-[0_1px_2px_var(--shadow-soft)] stroke-lit">
        <Textarea
          aria-label={
            showing === 'mine' ? `Reply in ${myName}` : `Reply to the guest in ${theirName}`
          }
          value={showing === 'mine' ? mine : theirs}
          onChange={(e) => {
            if (showing === 'mine') setMine(e.target.value);
            else setTheirs(e.target.value);
            setEdited(showing);
          }}
          placeholder={
            process.isPending
              ? undefined
              : showing === 'mine'
                ? `Write in ${myName}, then translate it into ${theirName}.`
                : 'Write a reply…'
          }
          disabled={process.isPending || (showing === 'mine' && toMine.isPending)}
          className="min-h-56 resize-none rounded-stage border-0 bg-transparent px-4 py-3 leading-relaxed shadow-none focus-visible:ring-0 disabled:bg-transparent"
        />
        {process.isPending && (
          <div
            role="status"
            className="absolute inset-x-0 top-0 flex items-center gap-3 px-4 py-3 text-sm text-muted-foreground"
          >
            <ThinkingOrb state="searching" size={20} aria-hidden />
            Reading the conversation, checking free rooms and prices…
          </div>
        )}

        <div className="flex items-center gap-2 border-t px-2 py-2">
          <Button
            size="sm"
            disabled={!theirs.trim() || send.isPending || behind || translating}
            title={behind ? `Translate your ${myName} changes first` : undefined}
            onClick={() => send.mutate(theirs)}
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
            {aiOn && (lastFromGuest || m.processedAt) && (
              <Button
                variant="ghost"
                size="xs"
                disabled={process.isPending}
                onClick={() =>
                  process.mutate({ force: m.processedAt !== null, language: myLanguage })
                }
              >
                {m.processedAt ? <RotateCw /> : <PenLine />}
                {m.processedAt ? 'Redraft' : 'Draft reply'}
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
