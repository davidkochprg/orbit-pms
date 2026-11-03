import {
  type Attachment,
  type BookingDetail,
  hotelInfoCategoryLabels,
  type InboxMessage,
  type Inquiry,
  type Language,
  languages,
  type MailDraft,
  type PendingAction,
  type Recipient,
  type RoomBlock,
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
  Contact as ContactIcon,
  Copy,
  Forward,
  Languages,
  LoaderCircle,
  Mail,
  MessageSquarePlus,
  PenLine,
  ReceiptText,
  RotateCw,
  Send,
  Star,
  Tag,
  Trash2,
  Undo2,
  Wrench,
} from 'lucide-react';
import { type ReactNode, useEffect, useEffectEvent, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { ThinkingOrb } from 'thinking-orbs';
import { AttachButton, AttachmentList } from '@/components/attachments';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { ErrorNotice } from '@/components/error-notice';
import { GuestAvatar } from '@/components/guest-avatar';
import { ReceiveDialog } from '@/components/inbox-dialogs';
import { LabelChips, LabelMenu } from '@/components/mail-labels';
import { Panel } from '@/components/panel';
import { RecipientField } from '@/components/recipient-field';
import { RepairDialog } from '@/components/repair-panel';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useBookingDrawer } from '@/hooks/use-booking-drawer';
import { useAddressBook } from '@/hooks/use-address-book';
import { useAutosave } from '@/hooks/use-autosave';
import { useBookingEditor } from '@/hooks/use-booking-editor';
import { useSession } from '@/hooks/use-session';
import { useToast } from '@/hooks/use-toast';
import {
  useBillFromAttachment,
  useBookingDetail,
  useDeclineInquiry,
  useDeleteDraft,
  useDeleteForever,
  useDrafts,
  useHotelProfile,
  useMailLabels,
  useSaveDraft,
  useSetLabels,
  useSetStarred,
  useSetTrashed,
  useContacts,
  useGuests,
  useHealth,
  useDraftInquiry,
  useInboxHold,
  useInboxHoldBlock,
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
  formatParty,
  formatPrice,
  languageLabels,
  statusLabels,
} from '@/lib/format';
import {
  analysisFacts,
  bookingPrefillFor,
  canDecline,
  contactOf,
  channelLabel,
  guestLanguage,
  isRead,
  sendLabel,
  senderLabel,
} from '@/lib/inbox';
import {
  canReplyAll,
  formatRecipient,
  newDraftId,
  forwardLink,
  recipientLabel,
  REPLY_EVENT,
  replyAllCc,
} from '@/lib/mail';
import { cn } from '@/lib/utils';
import { Tip } from '@/components/ui/tooltip';

/**
 * One conversation: its history, Orbit's help when asked for, and the reply box, the same for every
 * conversation. Drafting a reply to a guest reads the request and shows its rooms first, then
 * writes the reply; holding a room rewrites the reply to say so, unless staff have edited it, when
 * they are asked first.
 */
export function Conversation({ id }: { id: string }) {
  const inquiry = useInquiry(id);
  const health = useHealth();
  const contacts = useContacts();
  const { current } = useSession();
  const setUnread = useSetUnread(id);
  const reading = useReadInquiry(id);
  const drafting = useDraftInquiry(id);
  const learn = useLearnFromReply(id);
  const drafts = useDrafts();
  const removeDraft = useDeleteDraft();
  const hotelAddress = useHotelProfile().data?.email ?? null;
  const savedDraft = drafts.data?.find((d) => d.inquiryId === id && !d.forwardOf);
  const aiOn = health.data?.ai.configured ?? false;
  const myLanguage: Language = current?.language ?? 'en';
  const m = inquiry.data;
  // The reply box starts again from each new draft; staff edits are tracked per draft.
  const draftKey = `${m?.suggestion?.draft ?? ''}|${m?.messages.length ?? 0}`;
  const [editedKey, setEditedKey] = useState<string | null>(null);
  const edited = editedKey === draftKey;
  // A room held after staff edited the reply: the reply doesn't say so until they update it.
  const [heldSinceEdit, setHeldSinceEdit] = useState<string | null>(null);

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

  // Orbit's new reply replaces whatever was saved before.
  const draft = () => {
    setHeldSinceEdit(null);
    if (savedDraft) removeDraft.mutate(savedDraft.id);
    drafting.mutate({ language: myLanguage });
  };
  // Rooms first, from the reading, then the reply written for them.
  const prepare = () =>
    reading.mutate({ force: false }, { onSuccess: (r) => isRead(r) && draft() });
  const onHeld = (what: string) => {
    if (!aiOn) return;
    if (edited) setHeldSinceEdit(what);
    else draft();
  };
  // A conversation about a repair has no reading, only the reply Orbit wrote to the contractor.
  const read = m.taskId
    ? m.processedAt !== null && !m.processingError && Boolean(m.suggestion?.draft)
    : isRead(m);
  // A guest's request is read before a reply is drafted; a repair's is answered with the repair in
  // hand. A supplier's mail isn't a request to read.
  const canDraft = aiOn && (m.taskId !== null || !contactOf(m, contacts.data ?? []));

  return (
    <article className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-6 md:px-6">
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
      {read && m.suggestion?.note && m.suggestion.options.length === 0 && !m.suggestion.block && (
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
      {read && m.suggestion?.block && (
        <Block inquiry={m} block={m.suggestion.block} locked={drafting.isPending} onHeld={onHeld} />
      )}
      {m.status !== 'declined' && !drafts.data && <Skeleton className="h-56" />}
      {m.status !== 'declined' && drafts.data && (
        <ReplyEditor
          key={draftKey}
          inquiry={m}
          savedDraft={savedDraft}
          hotelAddress={hotelAddress}
          myLanguage={myLanguage}
          aiOn={aiOn}
          working={reading.isPending ? 'reading' : drafting.isPending ? 'drafting' : null}
          error={reading.error ?? drafting.error}
          heldSinceEdit={heldSinceEdit}
          onEdit={() => setEditedKey(draftKey)}
          onDraft={canDraft ? (read ? draft : prepare) : undefined}
          // What staff wrote themselves may hold something the hotel information lacks.
          onSent={() => aiOn && !m.taskId && (edited || !m.suggestion?.draft) && learn.mutate()}
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
  const where = hotelInfoCategoryLabels[category];
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

function Header({ inquiry: m }: { inquiry: Inquiry }) {
  const { openNew } = useBookingEditor();
  const { open } = useBookingDrawer();
  const guests = useGuests();
  // Mail with a supplier or contractor opens them, not a booking.
  const contact = contactOf(m, useContacts().data ?? []);
  const setUnread = useSetUnread(m.id);
  const setArchived = useSetArchived(m.id);
  const setStarred = useSetStarred(m.id);
  const setTrashed = useSetTrashed(m.id);
  const setLabels = useSetLabels(m.id);
  const remove = useDeleteForever();
  const labels = useMailLabels();
  const decline = useDeclineInquiry(m.id);
  const location = useLocation();
  const navigate = useNavigate();
  const [receiving, setReceiving] = useState(false);
  const [purging, setPurging] = useState(false);
  const [repairOpen, setRepairOpen] = useState(false);
  const { toast } = useToast();
  const archived = m.archivedAt !== null;
  const trashed = m.trashedAt !== null;
  const toList = () => void navigate(`/inbox${location.search}`);
  const error =
    setUnread.error ??
    setArchived.error ??
    setStarred.error ??
    setTrashed.error ??
    setLabels.error ??
    remove.error ??
    decline.error;

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
          <LabelChips ids={m.labelIds} labels={labels.data ?? []} className="mt-1.5" />
        </h2>
        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={m.starred ? 'Unstar' : 'Star'}
            aria-pressed={m.starred}
            tooltip={m.starred ? 'Unstar (s)' : 'Star (s)'}
            onClick={() => setStarred.mutate(!m.starred)}
            className={m.starred ? 'text-warning' : 'text-muted-foreground'}
          >
            <Star className={cn(m.starred && 'fill-current')} />
          </Button>
          <LabelMenu
            checked={(l) => m.labelIds.includes(l)}
            onToggle={(l, on) =>
              setLabels.mutate(on ? [...m.labelIds, l] : m.labelIds.filter((x) => x !== l))
            }
          >
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Labels"
              tooltip="Labels"
              className="text-muted-foreground"
            >
              <Tag />
            </Button>
          </LabelMenu>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Forward"
            tooltip="Forward (f)"
            asChild
            className="text-muted-foreground"
          >
            <Link to={forwardLink(m.id, location.search)}>
              <Forward />
            </Link>
          </Button>
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
          {trashed ? (
            <>
              <IconButton label="Restore" onClick={() => setTrashed.mutate(false)}>
                <Undo2 />
              </IconButton>
              <IconButton label="Delete forever" onClick={() => setPurging(true)}>
                <Trash2 />
              </IconButton>
            </>
          ) : (
            <IconButton
              label="Move to trash"
              onClick={() =>
                setTrashed.mutate(true, {
                  onSuccess: () => {
                    toast({
                      title: 'Moved to the trash',
                      action: { label: 'Undo', run: () => setTrashed.mutate(false) },
                    });
                    toList();
                  },
                })
              }
            >
              <Trash2 />
            </IconButton>
          )}
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
          {m.taskId ? (
            <Button variant="outline" size="sm" onClick={() => setRepairOpen(true)}>
              <Wrench /> Open repair
            </Button>
          ) : contact && !m.bookingId ? (
            <Button variant="outline" size="sm" asChild>
              <Link to={`/contacts?contact=${encodeURIComponent(contact.id)}`}>
                <ContactIcon /> Open contact
              </Link>
            </Button>
          ) : m.bookingId ? (
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
          {canDecline(m) && !contact && (
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
      {trashed && <p className="text-sm text-muted-foreground">In the trash</p>}
      {error && <ErrorNotice message={error.message} />}
      <ReceiveDialog id={m.id} open={receiving} onOpenChange={setReceiving} />
      {m.taskId && (
        <RepairDialog
          taskId={repairOpen ? m.taskId : null}
          onOpenChange={(open) => !open && setRepairOpen(false)}
        />
      )}
      <ConfirmDialog
        open={purging}
        onOpenChange={setPurging}
        title="Delete this conversation forever?"
        description="It can't be restored."
        confirmLabel="Delete forever"
        destructive
        busy={remove.isPending}
        onConfirm={() => remove.mutate(m.id, { onSuccess: toList })}
      />
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
      tooltip={label}
      onClick={onClick}
      className="text-muted-foreground"
    >
      {children}
    </Button>
  );
}

/**
 * A message in the thread, in the reader's language when it has been put into it: a guest's once
 * translated, the hotel's own when staff wrote it in theirs. Either can be translated on request,
 * once; the original is a click away.
 */
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
  // Both sides write in the guest's language; a message already in the reader's needs nothing.
  const original = guestLanguage(inquiry);
  const offerTranslation = canTranslate && !translated && original !== myLanguage;
  const originalName = original && original !== myLanguage ? languageLabels[original] : null;

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
      <Addressees message={message} />
      {translated && !showOriginal ? (
        <div className="flex flex-col gap-1">
          <p className="leading-relaxed whitespace-pre-wrap">{translated.text}</p>
          <button
            type="button"
            onClick={() => setShowOriginal(true)}
            className="flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <Languages className="size-3" />
            {originalName
              ? fromGuest
                ? `Translated from ${originalName}`
                : `Sent in ${originalName}`
              : 'Translated'}{' '}
            · Show original
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
              <Languages className="size-3" /> Show in {languageLabels[myLanguage]}
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
      <AttachmentList
        files={message.attachments}
        action={
          message.direction === 'in'
            ? (file) => <ReadBillButton file={file} inquiryId={inquiry.id} />
            : undefined
        }
      />
      {translate.error && <ErrorNotice message={translate.error.message} />}
    </li>
  );
}

/**
 * Reads a PDF or photo someone sent as a supplier's bill, then opens it to check. Shown only when
 * AI can read the file: PDFs need the agent model, photos the vision model.
 */
function ReadBillButton({ file, inquiryId }: { file: Attachment; inquiryId: string }) {
  const ai = useHealth().data?.ai;
  const read = useBillFromAttachment();
  const navigate = useNavigate();
  const { toast } = useToast();
  const pdf = file.contentType === 'application/pdf';
  const photo = /^image\/(jpeg|png|webp)$/.test(file.contentType);
  if (!ai?.configured || !(pdf || (photo && ai.vision))) return null;
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      tooltip="Read as a bill"
      aria-label={`Read ${file.name} as a bill`}
      disabled={read.isPending}
      onClick={() =>
        read.mutate(
          { attachmentId: file.id, inquiryId },
          {
            onSuccess: (bill) =>
              void navigate(`/invoices?tab=bills&bill=${encodeURIComponent(bill.id)}`),
            onError: (err) => toast({ title: err.message }),
          },
        )
      }
    >
      {read.isPending ? <LoaderCircle className="animate-spin" /> : <ReceiptText />}
    </Button>
  );
}

/** Who else a message went to, when it went to more than the guest. */
function Addressees({ message }: { message: InboxMessage }) {
  const lines: [string, Recipient[]][] = [
    ['to', message.to],
    ['cc', message.cc],
    ['bcc', message.bcc],
  ];
  const shown = lines.filter(([, list]) => list.length > 0);
  if (shown.length === 0) return null;
  return (
    <p className="-mt-1 text-xs text-muted-foreground">
      {shown.map(([kind, list], i) => (
        <span key={kind}>
          {i > 0 && ' · '}
          {kind}{' '}
          {list.map((r, j) => (
            <Tip key={r.address} label={formatRecipient(r)}>
              <span>
                {j > 0 && ', '}
                {recipientLabel(r)}
              </span>
            </Tip>
          ))}
        </span>
      ))}
    </p>
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
  onHeld: (what: string) => void;
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
                    onClick={() =>
                      hold.mutate(o.roomId, { onSuccess: () => onHeld(`room ${o.roomName}`) })
                    }
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

/**
 * Rooms for a group, priced room by room with who sleeps where, and one button that holds them
 * all for the guest. Once held, each room opens its booking.
 */
function Block({
  inquiry,
  block,
  locked,
  onHeld,
}: {
  inquiry: Inquiry;
  block: RoomBlock;
  /** While the reply is being written, the choice it is about stays put. */
  locked: boolean;
  onHeld: (what: string) => void;
}) {
  const hold = useInboxHoldBlock(inquiry.id);
  const lead = useBookingDetail(inquiry.bookingId);
  const { open } = useBookingDrawer();
  const heldIds = inquiry.blockBookingIds;
  const booking = lead.data?.booking;
  const nights = block.rooms[0]?.quote.nights ?? 0;
  const count = block.rooms.length;

  return (
    <Panel
      title="Rooms for this group"
      count={count}
      contentClassName="p-0"
      actions={
        heldIds.length === 0 &&
        !inquiry.bookingId && (
          <Button
            size="xs"
            variant="outline"
            disabled={hold.isPending || locked}
            onClick={() =>
              hold.mutate(undefined, { onSuccess: () => onHeld(`the ${count} rooms`) })
            }
          >
            {hold.isPending ? 'Holding…' : `Hold all ${count}`}
          </Button>
        )
      }
    >
      {heldIds.length > 0 && booking && (
        <p className="border-b bg-primary-soft px-3 py-2 text-xs text-primary-text first:rounded-t-stage">
          {booking.status === 'hold'
            ? booking.holdExpiresAt
              ? `Held for the guest until ${formatDateTime(booking.holdExpiresAt)}`
              : 'Held for the guest'
            : `${statusLabels[booking.status]} booking`}
        </p>
      )}
      <ul className="flex flex-col">
        {block.rooms.map((o, i) => {
          const bookingId = heldIds[i];
          return (
            <li key={o.roomId} className="flex items-center gap-3 border-b px-3 py-2">
              <span className="rounded-[5px] border border-ink/7 bg-background px-1.5 py-px font-mono text-xs">
                {o.roomName}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                {o.roomTypeName} · {formatParty(o.quote.adults, o.quote.childAges)}
              </span>
              <span className="font-mono text-sm tabular-nums">{formatPrice(o.quote.total)}</span>
              {bookingId && (
                <Button size="xs" variant="ghost" onClick={() => open(bookingId)}>
                  Open
                </Button>
              )}
            </li>
          );
        })}
        <li className="flex items-center gap-3 px-3 py-2 text-sm">
          <span className="flex-1 font-medium">
            Total · {nights} {nights === 1 ? 'night' : 'nights'}
          </span>
          <span className="font-mono font-medium tabular-nums">{formatPrice(block.total)}</span>
          {heldIds.length > 0 && <span className="w-[3.25rem]" aria-hidden />}
        </li>
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
 * The reply box, the same for every conversation. What is sent is the text in the guest's
 * language; a staff member who reads another language writes and reads in theirs, and the side
 * edited last is translated into the other when the other is opened or the reply is sent. The
 * staff member's text is kept with the sent message, so the thread reads back in their language.
 * Orbit drafts a reply only when asked, and says what it is doing in the box itself.
 */
function ReplyEditor({
  inquiry: m,
  savedDraft,
  hotelAddress,
  myLanguage,
  aiOn,
  working,
  error: prepareError,
  heldSinceEdit,
  onEdit,
  onDraft,
  onSent,
}: {
  inquiry: Inquiry;
  /** What staff wrote before and didn't send, to carry on with. */
  savedDraft: MailDraft | undefined;
  /** The hotel's own address, left out of a reply all. */
  hotelAddress: string | null;
  myLanguage: Language;
  aiOn: boolean;
  /** Orbit reading the request or writing the draft, which replaces the text. */
  working: 'reading' | 'drafting' | null;
  error: Error | null;
  /** What was held after the staff member edited the reply, e.g. "room 104", not in it yet. */
  heldSinceEdit: string | null;
  /** The staff member changed the reply. */
  onEdit: () => void;
  /** Drafts the reply; absent where Orbit doesn't draft, e.g. a supplier's mail. */
  onDraft?: () => void;
  onSent: () => void;
}) {
  const suggestion = m.suggestion;
  const toTheirs = useTranslateText();
  const toMine = useTranslateText();
  const send = useSendReply(m.id);
  const save = useSaveDraft();
  const discard = useDeleteDraft();
  const book = useAddressBook();
  const email = m.channel === 'email';
  const [draftId] = useState(() => savedDraft?.id ?? newDraftId());
  const [cc, setCc] = useState<Recipient[]>(savedDraft?.cc ?? []);
  const [bcc, setBcc] = useState<Recipient[]>(savedDraft?.bcc ?? []);
  const [showCopies, setShowCopies] = useState(cc.length + bcc.length > 0);
  const [files, setFiles] = useState(savedDraft?.attachments ?? []);
  // Saved only once staff change something themselves, not for Orbit's own draft.
  const [touched, setTouched] = useState(savedDraft !== undefined);
  const [sending, setSending] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [theirLanguage, setTheirLanguage] = useState<Language>(guestLanguage(m) ?? myLanguage);
  const [theirs, setTheirs] = useState(savedDraft?.body ?? suggestion?.draft ?? '');
  const [mine, setMine] = useState(
    !savedDraft && suggestion?.draftTranslation?.language === myLanguage
      ? suggestion.draftTranslation.text
      : '',
  );
  // The side changed since the two last matched; the other one is behind. A saved draft keeps
  // only the guest's text, so that is the side to translate from.
  const [edited, setEdited] = useState<Side | null>(savedDraft ? 'theirs' : null);
  const bilingual = aiOn && theirLanguage !== myLanguage;
  // A reply opens in the staff member's language, so they can read and write in it; a saved
  // draft opens as it was written.
  const [view, setView] = useState<Side>(mine || !theirs.trim() ? 'mine' : 'theirs');
  const showing: Side = bilingual ? view : 'theirs';
  const translating = toTheirs.isPending || toMine.isPending;
  const theirName = languageLabels[theirLanguage];
  const myName = languageLabels[myLanguage];
  const replyAll = canReplyAll(m, hotelAddress);
  const allCc = replyAll ? replyAllCc(m, hotelAddress) : [];
  const toAll = replyAll && allCc.every((r) => cc.some((c) => c.address === r.address));
  const empty = !theirs.trim() && !mine.trim();
  const busy = working !== null || translating || sending;

  useAutosave(
    { inquiryId: m.id, cc, bcc, body: theirs, attachmentIds: files.map((f) => f.id) },
    (body) => save.mutate({ id: draftId, body }),
    touched && !sending,
  );
  const startReply = (all: boolean) => {
    if (all) {
      setCc((c) => [...c, ...allCc.filter((r) => !c.some((x) => x.address === r.address))]);
      setShowCopies(true);
    } else {
      setCc((c) => c.filter((x) => !allCc.some((r) => r.address === x.address)));
    }
    setTouched(true);
  };

  // "r" and "a" from the list start a reply here.
  const onReply = useEffectEvent((e: Event) => {
    if (!(e instanceof CustomEvent)) return;
    if (e.detail === 'replyAll' && replyAll) startReply(true);
    if (e.detail === 'reply') startReply(false);
    textarea.current?.focus();
    textarea.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });
  useEffect(() => {
    const listener = (e: Event) => onReply(e);
    window.addEventListener(REPLY_EVENT, listener);
    return () => window.removeEventListener(REPLY_EVENT, listener);
  }, []);

  /** Brings one side up to date with the other, if it is behind. */
  const sync = async (into: Side): Promise<{ theirs: string; mine: string }> => {
    if (into === 'theirs' && edited === 'mine' && mine.trim()) {
      const { text } = await toTheirs.mutateAsync({ text: mine, to: theirLanguage });
      setTheirs(text);
      setEdited(null);
      return { theirs: text, mine };
    }
    if (into === 'mine' && theirs.trim() && (edited === 'theirs' || !mine.trim())) {
      const { text } = await toMine.mutateAsync({ text: theirs, to: myLanguage });
      setMine(text);
      setEdited(null);
      return { theirs, mine: text };
    }
    return { theirs, mine };
  };
  // The staff member's text carries over to the new language; the guest's side follows from it.
  const changeLanguage = (language: Language) => {
    const myText = bilingual ? mine : theirs;
    setTheirLanguage(language);
    if (aiOn && language !== myLanguage) {
      setMine(myText);
      setView('mine');
      setEdited(myText.trim() ? 'mine' : null);
    } else {
      setTheirs(myText);
      setEdited(null);
    }
  };
  const open = (side: Side) => {
    setView(side);
    if (!translating) void sync(side).catch(() => {});
  };

  const sendNow = async () => {
    if (empty || busy || send.isPending) return;
    setSending(true);
    try {
      // The guest gets their language; the staff member's version is kept to read back.
      // Only one side is ever behind: the one not edited last.
      const text = bilingual ? await sync(edited === 'mine' ? 'theirs' : 'mine') : { theirs, mine };
      if (!text.theirs.trim()) return setSending(false);
      send.mutate(
        {
          body: text.theirs,
          cc: email ? cc : [],
          bcc: email ? bcc : [],
          attachmentIds: files.map((f) => f.id),
          draftId,
          translation:
            bilingual && text.mine.trim() ? { language: myLanguage, text: text.mine } : null,
        },
        { onSuccess: onSent, onError: () => setSending(false) },
      );
    } catch {
      setSending(false);
    }
  };
  const discardDraft = () => {
    discard.mutate(draftId);
    setTheirs('');
    setMine('');
    setEdited(null);
    setCc([]);
    setBcc([]);
    setFiles([]);
    setTouched(false);
  };

  const error = prepareError ?? toTheirs.error ?? toMine.error ?? send.error;
  const status =
    working === 'reading'
      ? 'Reading the message…'
      : working === 'drafting'
        ? 'Writing the reply…'
        : (showing === 'mine' ? toMine.isPending : toTheirs.isPending)
          ? `Translating into ${showing === 'mine' ? myName : theirName}…`
          : null;
  const behindHere = bilingual && edited !== null && edited !== showing;

  return (
    <section
      aria-label="Reply"
      className="flex flex-col rounded-card bg-surface-sunken p-1 ring-1 ring-ink/5 ring-inset"
    >
      <div className="flex min-h-9 flex-wrap items-center gap-2 px-2 pt-0.5 pb-1">
        {replyAll ? (
          <div role="tablist" aria-label="Reply to" className="flex items-center gap-0.5">
            <LanguageTab selected={!toAll} onClick={() => startReply(false)}>
              Reply
            </LanguageTab>
            <LanguageTab selected={toAll} onClick={() => startReply(true)}>
              Reply all
            </LanguageTab>
          </div>
        ) : (
          <h3 className="px-1 text-[0.8125rem] text-muted-foreground">Reply</h3>
        )}
        {aiOn && (
          <div className="ml-auto flex items-center gap-1">
            {bilingual && (
              <div role="tablist" aria-label="Reply language" className="flex items-center gap-0.5">
                <LanguageTab selected={showing === 'mine'} onClick={() => open('mine')}>
                  {myName}
                </LanguageTab>
                <LanguageTab selected={showing === 'theirs'} onClick={() => open('theirs')}>
                  {theirName}
                  <Send aria-label="sent" className="size-3 text-subtle-foreground" />
                </LanguageTab>
              </div>
            )}
            <ReplyLanguageMenu value={theirLanguage} onChange={changeLanguage} />
          </div>
        )}
      </div>

      {heldSinceEdit && (
        <div className="mb-1 flex flex-wrap items-center gap-2 rounded-stage bg-primary-soft px-3 py-2 text-sm">
          <span className="min-w-0 flex-1">
            Your reply doesn&apos;t mention {heldSinceEdit} yet.
          </span>
          {onDraft && (
            <Button size="xs" variant="outline" disabled={busy} onClick={onDraft}>
              <RotateCw /> Rewrite for {heldSinceEdit}
            </Button>
          )}
        </div>
      )}
      <div className="relative flex flex-col rounded-stage bg-background shadow-[0_1px_2px_var(--shadow-soft)] stroke-lit">
        {email && (
          <>
            <div className="flex h-10 items-center gap-3 border-b px-4 text-sm">
              <span className="w-14 shrink-0 text-muted-foreground">To</span>
              <span className="min-w-0 flex-1 truncate">
                {m.senderAddress
                  ? formatRecipient({ name: m.senderName, address: m.senderAddress })
                  : senderLabel(m)}
              </span>
              {!showCopies && (
                <button
                  type="button"
                  onClick={() => setShowCopies(true)}
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                >
                  Cc Bcc
                </button>
              )}
            </div>
            {showCopies && (
              <>
                <RecipientField
                  label="Cc"
                  value={cc}
                  onChange={(v) => {
                    setCc(v);
                    setTouched(true);
                  }}
                  book={book}
                />
                <RecipientField
                  label="Bcc"
                  value={bcc}
                  onChange={(v) => {
                    setBcc(v);
                    setTouched(true);
                  }}
                  book={book}
                />
              </>
            )}
          </>
        )}
        {/* While Orbit works, it covers the text, which a new draft is about to replace. */}
        <div className="relative flex flex-col">
          <Textarea
            ref={textarea}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void sendNow();
              }
            }}
            aria-label={showing === 'mine' ? `Reply in ${myName}` : `Reply in ${theirName}`}
            value={showing === 'mine' ? mine : theirs}
            onChange={(e) => {
              if (showing === 'mine') setMine(e.target.value);
              else setTheirs(e.target.value);
              setEdited(showing);
              setTouched(true);
              onEdit();
            }}
            placeholder={status ? undefined : 'Write a reply…'}
            disabled={status !== null || sending}
            className="min-h-56 resize-none rounded-stage border-0 bg-transparent px-4 py-3 leading-relaxed shadow-none focus-visible:ring-0 disabled:bg-transparent"
          />
          {status && (
            <div
              role="status"
              className="absolute inset-0 flex items-start gap-3 rounded-t-stage bg-background/90 px-4 py-3 text-sm text-muted-foreground"
            >
              <ThinkingOrb
                state={working === 'reading' ? 'searching' : 'composing'}
                size={20}
                aria-hidden
              />
              {status}
            </div>
          )}
          {!status && empty && onDraft && (
            <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
              <Button variant="outline" size="sm" className="pointer-events-auto" onClick={onDraft}>
                <PenLine /> Draft reply
              </Button>
            </div>
          )}
        </div>

        <AttachmentList
          files={files}
          onRemove={(f) => {
            setFiles((all) => all.filter((x) => x.id !== f.id));
            setTouched(true);
          }}
          className="px-4 pb-3"
        />
        <div className="flex items-center gap-2 border-t px-2 py-2">
          <Button
            size="sm"
            disabled={empty || busy || send.isPending}
            tooltip={bilingual ? `Sends the ${theirName} reply` : undefined}
            onClick={() => void sendNow()}
          >
            {sending && translating ? <LoaderCircle className="animate-spin" /> : <Send />}
            {sendLabel(m)}
          </Button>
          <AttachButton
            onAttached={(f) => {
              setFiles((all) => [...all, f]);
              setTouched(true);
            }}
          />
          <Button
            variant="ghost"
            size="sm"
            disabled={!theirs.trim() || (bilingual && edited === 'mine')}
            tooltip={bilingual && edited === 'mine' ? `Open ${theirName} first` : undefined}
            // The clipboard is missing on plain-HTTP addresses, e.g. the app opened over the LAN.
            onClick={() => void navigator.clipboard?.writeText(theirs).catch(() => {})}
          >
            <Copy /> Copy {bilingual && theirName}
          </Button>
          <span className="flex min-w-0 flex-1 items-center justify-end gap-2 text-xs text-muted-foreground">
            {behindHere && !translating && (
              <Button variant="ghost" size="xs" onClick={() => void sync(showing).catch(() => {})}>
                <RotateCw /> Update from {showing === 'mine' ? theirName : myName}
              </Button>
            )}
            {touched &&
              (save.isPending ? 'Saving…' : save.isSuccess || savedDraft ? 'Draft saved' : null)}
            {onDraft && !empty && suggestion?.draft && (
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Redraft"
                tooltip="Redraft"
                disabled={busy}
                onClick={onDraft}
              >
                <RotateCw />
              </Button>
            )}
            {touched && (
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Discard draft"
                tooltip="Discard draft"
                onClick={discardDraft}
              >
                <Trash2 />
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

/** The language the reply goes out in, the guest's unless staff pick another. */
function ReplyLanguageMenu({
  value,
  onChange,
}: {
  value: Language;
  onChange: (language: Language) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Reply language"
          tooltip="Reply language"
          className="text-muted-foreground"
        >
          <Languages />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Reply in
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup value={value} onValueChange={(v) => onChange(v as Language)}>
          {languages.map((l) => (
            <DropdownMenuRadioItem key={l} value={l}>
              {languageLabels[l]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
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
