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
  ArrowRight,
  Ban,
  CalendarPlus,
  Copy,
  Languages,
  Mail,
  MessageSquarePlus,
  RotateCw,
  Send,
  Sparkles,
} from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { ThinkingOrb } from 'thinking-orbs';
import { ErrorNotice } from '@/components/error-notice';
import { GuestAvatar } from '@/components/guest-avatar';
import { ReceiveDialog } from '@/components/inbox-dialogs';
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
import { formatCzk, formatDateTime, languageLabels } from '@/lib/format';
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
      {m.status !== 'declined' && <Assist inquiry={m} aiOn={aiOn} myLanguage={myLanguage} />}
      {m.status !== 'declined' && (
        <ReplyEditor
          key={`${m.processedAt ?? 'none'}:${m.messages.length}`}
          inquiry={m}
          myLanguage={myLanguage}
          canTranslate={aiOn}
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
 * What Orbit can do with the conversation: read the request, find free rooms with exact prices
 * and draft a reply. Nothing runs until staff ask, so opening a message costs nothing.
 */
function Assist({
  inquiry: m,
  aiOn,
  myLanguage,
}: {
  inquiry: Inquiry;
  aiOn: boolean;
  myLanguage: Language;
}) {
  const process = useProcessInquiry(m.id);
  const prepare = (force: boolean) => process.mutate({ force, language: myLanguage });
  const lastFromGuest = m.messages.at(-1)?.direction === 'in';

  if (!aiOn) return null;
  if (process.isPending) {
    return (
      <Panel>
        <div className="flex items-center gap-3" role="status">
          <ThinkingOrb state="searching" size={32} aria-label="Orbit is working" />
          <span>
            <span className="font-medium">Preparing a reply…</span>
            <span className="block text-sm text-muted-foreground">
              Reading the conversation, checking free rooms and prices, and drafting.
            </span>
          </span>
        </div>
      </Panel>
    );
  }
  if (!m.processedAt) {
    if (!lastFromGuest) return null;
    return (
      <Panel>
        <div className="flex flex-wrap items-center gap-3">
          <Sparkles className="size-4 shrink-0 text-primary-text" />
          <p className="min-w-0 flex-1 text-sm text-muted-foreground">
            Orbit can read this conversation, check free rooms and exact prices, and draft a reply
            in the guest&apos;s language with a {languageLabels[myLanguage]} version alongside.
          </p>
          <Button size="sm" onClick={() => prepare(false)}>
            <Sparkles /> Prepare a reply
          </Button>
        </div>
        {process.error && <ErrorNotice message={process.error.message} />}
      </Panel>
    );
  }
  return (
    <Panel>
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-primary-text" />
        <h3 className="font-medium">Prepared by Orbit</h3>
        <Button
          size="xs"
          variant="ghost"
          className="ml-auto text-muted-foreground"
          onClick={() => prepare(true)}
        >
          <RotateCw /> Prepare again
        </Button>
      </div>
      {m.processingError && <ErrorNotice message={m.processingError} />}
      {process.error && <ErrorNotice message={process.error.message} />}
      {m.parsed && (
        <ul className="flex flex-wrap gap-1.5">
          {analysisFacts(m.parsed).map((f) => (
            <li
              key={f}
              className="rounded-full bg-ink/5 px-2.5 py-0.5 text-xs text-muted-foreground"
            >
              {f}
            </li>
          ))}
        </ul>
      )}
      {m.parsed?.question && (
        <p className="text-sm">
          <span className="text-muted-foreground">Asks: </span>
          {m.parsed.question}
        </p>
      )}
      {m.suggestion?.note && <p className="text-sm text-muted-foreground">{m.suggestion.note}</p>}
      {m.suggestion && m.suggestion.options.length > 0 && (
        <Options inquiry={m} options={m.suggestion.options} />
      )}
    </Panel>
  );
}

function Panel({ children }: { children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-card bg-surface-sunken p-4 ring-1 ring-ink/5 ring-inset">
      {children}
    </section>
  );
}

function Options({ inquiry, options }: { inquiry: Inquiry; options: StayOption[] }) {
  const hold = useInboxHold(inquiry.id);
  return (
    <div className="flex flex-col gap-1.5">
      <h4 className="text-xs font-medium text-muted-foreground">Free rooms, priced</h4>
      <ul className="flex flex-col overflow-hidden rounded-stage bg-background shadow-[0_1px_2px_var(--shadow-soft)] stroke-lit">
        {options.map((o) => (
          <li key={o.roomId} className="flex items-center gap-3 border-b px-3 py-2 last:border-b-0">
            <span className="rounded-[5px] border border-ink/7 px-1.5 py-px font-mono text-xs">
              {o.roomName}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
              {o.roomTypeName} · {o.quote.nights} {o.quote.nights === 1 ? 'night' : 'nights'}
            </span>
            <span className="font-mono text-sm tabular-nums">{formatCzk(o.quote.total)}</span>
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
      {hold.isError && <ErrorNotice message={hold.error.message} />}
    </div>
  );
}

/**
 * The reply. When the guest writes in another language than the staff member reads, it is two
 * texts side by side: what is sent, in the guest's language, and the same in the staff member's.
 * Either side can be translated into the other; only the guest's side is sent.
 */
function ReplyEditor({
  inquiry: m,
  myLanguage,
  canTranslate,
}: {
  inquiry: Inquiry;
  myLanguage: Language;
  canTranslate: boolean;
}) {
  const suggestion = m.suggestion;
  const known = guestLanguage(m);
  const [theirLanguage, setTheirLanguage] = useState<Language>(known ?? myLanguage);
  const [theirs, setTheirs] = useState(suggestion?.draft ?? '');
  const [mine, setMine] = useState(
    suggestion?.draftTranslation?.language === myLanguage ? suggestion.draftTranslation.text : '',
  );
  const toTheirs = useTranslateText();
  const toMine = useTranslateText();
  const send = useSendReply(m.id);
  const sideBySide = theirLanguage !== myLanguage;
  const drafted = Boolean(suggestion?.draft);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-medium">{drafted ? 'Reply drafted by Orbit' : 'Reply'}</h3>
        <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          Guest&apos;s language
          <NativeSelect
            value={theirLanguage}
            onChange={(e) => setTheirLanguage(e.target.value as Language)}
            className="h-7 w-32"
          >
            {languages.map((l) => (
              <option key={l} value={l}>
                {languageLabels[l]}
              </option>
            ))}
          </NativeSelect>
        </label>
      </div>

      <div className={cn('grid gap-3', sideBySide && 'md:grid-cols-2')}>
        <Side
          label={sideBySide ? `To the guest · ${languageLabels[theirLanguage]}` : 'To the guest'}
          hint="This is what is sent."
          value={theirs}
          onChange={setTheirs}
          action={
            sideBySide &&
            canTranslate && (
              <TranslateButton
                pending={toMine.isPending}
                disabled={!theirs.trim()}
                onClick={() =>
                  toMine.mutate(
                    { text: theirs, to: myLanguage },
                    { onSuccess: (r) => setMine(r.text) },
                  )
                }
              >
                Update the {languageLabels[myLanguage]} version
                <ArrowRight className="hidden md:block" />
              </TranslateButton>
            )
          }
        />
        {sideBySide && (
          <Side
            label={`Your language · ${languageLabels[myLanguage]}`}
            hint={`Read or write here, then translate it into ${languageLabels[theirLanguage]}.`}
            value={mine}
            onChange={setMine}
            muted
            action={
              canTranslate && (
                <TranslateButton
                  pending={toTheirs.isPending}
                  disabled={!mine.trim()}
                  onClick={() =>
                    toTheirs.mutate(
                      { text: mine, to: theirLanguage },
                      { onSuccess: (r) => setTheirs(r.text) },
                    )
                  }
                >
                  <ArrowLeft className="hidden md:block" />
                  Translate into {languageLabels[theirLanguage]}
                </TranslateButton>
              )
            }
          />
        )}
      </div>
      {(toTheirs.error ?? toMine.error) && (
        <ErrorNotice message={(toTheirs.error ?? toMine.error)!.message} />
      )}
      {send.error && <ErrorNotice message={send.error.message} />}
      <div className="flex items-center gap-2">
        <Button disabled={!theirs.trim() || send.isPending} onClick={() => send.mutate(theirs)}>
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
      </div>
    </section>
  );
}

function Side({
  label,
  hint,
  value,
  onChange,
  action,
  muted = false,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
  action?: ReactNode;
  muted?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <Textarea
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={12}
        className={cn('leading-relaxed', muted ? 'bg-surface-sunken' : 'bg-background')}
      />
      <div className="flex min-h-7 items-center justify-between gap-2">
        <span className="text-xs text-subtle-foreground">{hint}</span>
        {action}
      </div>
    </div>
  );
}

function TranslateButton({
  pending,
  disabled,
  onClick,
  children,
}: {
  pending: boolean;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      disabled={disabled || pending}
      onClick={onClick}
      className="shrink-0 text-primary-text"
    >
      {pending ? <ThinkingOrb state="composing" size={20} className="size-4" /> : <Languages />}
      {children}
    </Button>
  );
}
