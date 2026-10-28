import type { Inquiry, StayOption } from '@orbit/shared';
import {
  Ban,
  CalendarPlus,
  Copy,
  Inbox,
  LoaderCircle,
  Plus,
  RotateCw,
  Sparkles,
} from 'lucide-react';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { EmptyState } from '@/components/empty-state';
import { ErrorNotice } from '@/components/error-notice';
import { GuestAvatar } from '@/components/guest-avatar';
import { PageHeader } from '@/components/page-header';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useBookingDrawer } from '@/hooks/use-booking-drawer';
import { useBookingEditor } from '@/hooks/use-booking-editor';
import {
  useCreateMessage,
  useDeclineInquiry,
  useGuests,
  useHealth,
  useInbox,
  useInboxHold,
  useInquiry,
  useMarkReplied,
  useProcessInquiry,
} from '@/lib/api';
import { formatCzk, formatDateTime } from '@/lib/format';
import {
  analysisFacts,
  bookingPrefillFor,
  canDecline,
  channelLabel,
  inquiryStatusLabels,
  senderLabel,
  snippet,
} from '@/lib/inbox';
import { cn } from '@/lib/utils';

export function InboxPage() {
  const { id } = useParams();
  const inbox = useInbox();
  const unread = inbox.data?.filter((m) => m.status === 'new').length ?? 0;

  return (
    <>
      <PageHeader
        title="Inbox"
        meta={unread > 0 ? `${unread} new` : undefined}
        actions={<NewMessage />}
      />
      <div className="flex min-h-0 flex-1">
        <aside
          className={cn(
            'scrollbar-thin w-full shrink-0 overflow-y-auto border-r bg-surface-sunken md:w-[22rem]',
            id && 'hidden md:block',
          )}
        >
          {inbox.isError && <ErrorNotice message={inbox.error.message} className="m-3" />}
          {!inbox.data && !inbox.isError && <Skeleton className="m-3 h-64" />}
          {inbox.data?.length === 0 && <EmptyState icon={Inbox} title="No messages" />}
          <ul className="flex flex-col p-1.5">
            {inbox.data?.map((m) => (
              <MessageRow key={m.id} message={m} active={m.id === id} />
            ))}
          </ul>
        </aside>
        <section
          className={cn('scrollbar-thin min-w-0 flex-1 overflow-y-auto', !id && 'hidden md:block')}
        >
          {id ? (
            <MessageDetail id={id} />
          ) : (
            <EmptyState
              icon={Inbox}
              title="No message selected"
              description="Pick a message to read it with Orbit’s prepared reply."
              className="h-full"
            />
          )}
        </section>
      </div>
    </>
  );
}

function MessageRow({ message: m, active }: { message: Inquiry; active: boolean }) {
  const unread = m.status === 'new';
  return (
    <li>
      <Link
        to={`/inbox/${m.id}`}
        className={cn(
          'relative flex flex-col gap-0.5 rounded-lg py-2.5 pr-3 pl-6 outline-none hover:bg-accent focus-visible:bg-accent',
          active && 'bg-accent',
        )}
      >
        {unread && (
          <span
            aria-label="New"
            className="absolute top-[15px] left-2.5 size-1.5 rounded-full bg-primary"
          />
        )}
        <span className="flex items-baseline gap-2">
          <span className={cn('truncate', unread ? 'font-semibold' : 'font-medium')}>
            {senderLabel(m)}
          </span>
          <time className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">
            {formatDateTime(m.receivedAt)}
          </time>
        </span>
        <span className="flex items-center gap-2">
          <span className="truncate">{m.subject ?? '(no subject)'}</span>
          {m.parsed && (
            <Sparkles
              aria-label="Prepared by Orbit"
              className="size-3 shrink-0 text-primary-text"
            />
          )}
        </span>
        <span className="line-clamp-2 text-muted-foreground">{snippet(m.rawText, 140)}</span>
        <span className="mt-1 flex gap-1.5 text-xs text-muted-foreground">
          <span className="rounded-full border border-ink/7 bg-ink/4 px-2">{channelLabel(m)}</span>
          {!unread && (
            <span className="rounded-full border border-ink/7 bg-ink/4 px-2">
              {inquiryStatusLabels[m.status]}
            </span>
          )}
        </span>
      </Link>
    </li>
  );
}

function NewMessage() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const create = useCreateMessage();
  const navigate = useNavigate();

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    create.mutate(
      { rawText: text, channel: 'email' },
      {
        onSuccess: (m) => {
          setText('');
          setOpen(false);
          void navigate(`/inbox/${(m as Inquiry).id}`);
        },
      },
    );
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Plus /> Paste a message
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="shadow-floating sm:max-w-lg">
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>Paste a message</DialogTitle>
              <DialogDescription>
                Add a guest email to the inbox. Orbit reads it and prepares a reply.
              </DialogDescription>
            </DialogHeader>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste the email text here"
              rows={8}
              autoFocus
            />
            {create.isError && <ErrorNotice message={create.error.message} />}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!text.trim() || create.isPending}>
                Add to inbox
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function MessageDetail({ id }: { id: string }) {
  const inquiry = useInquiry(id);
  const health = useHealth();
  const process = useProcessInquiry(id);
  const started = useRef<string | null>(null);
  const aiOn = health.data?.ai.configured ?? false;
  const m = inquiry.data;

  // The agent prepares each message when it is first opened; the result is stored server-side.
  useEffect(() => {
    if (!m || !aiOn || m.processedAt || started.current === id) return;
    started.current = id;
    process.mutate(false);
  }, [m, aiOn, id, process]);

  if (inquiry.isError) return <ErrorNotice message={inquiry.error.message} className="m-6" />;
  if (!m) return <Skeleton className="m-6 h-96" />;

  return (
    <article className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-6">
      <header className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold tracking-tight">{m.subject ?? '(no subject)'}</h2>
        <div className="flex items-center gap-3">
          <GuestAvatar name={senderLabel(m)} size="md" />
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-medium">{senderLabel(m)}</span>
            <span className="truncate text-xs text-muted-foreground">
              {m.senderAddress && m.senderName ? `${m.senderAddress}, ` : ''}via {channelLabel(m)}
            </span>
          </div>
          <time className="ml-auto shrink-0 text-xs text-muted-foreground">
            {formatDateTime(m.receivedAt)}
          </time>
        </div>
      </header>

      <p className="max-w-prose leading-relaxed whitespace-pre-wrap">{m.rawText}</p>

      <MessageActions inquiry={m} />

      <section className="flex flex-col gap-5 rounded-card bg-surface-sunken p-5 ring-1 ring-ink/5 ring-inset">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary-text" />
          <h3 className="font-medium">Prepared by Orbit</h3>
          {m.processedAt && aiOn && (
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto text-muted-foreground"
              disabled={process.isPending}
              onClick={() => process.mutate(true)}
            >
              <RotateCw /> Prepare again
            </Button>
          )}
        </div>

        {!aiOn && (
          <p className="text-muted-foreground">The agent is not configured on this server.</p>
        )}
        {process.isPending && (
          <p className="flex items-center gap-2 text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" /> Reading the message and checking rooms…
          </p>
        )}
        {process.isError && <ErrorNotice message={process.error.message} />}
        {m.processingError && (
          <div className="flex items-center gap-2">
            <ErrorNotice message={m.processingError} className="flex-1" />
            {aiOn && (
              <Button size="sm" variant="outline" onClick={() => process.mutate(false)}>
                Try again
              </Button>
            )}
          </div>
        )}

        {m.parsed && (
          <ul className="flex flex-wrap gap-1.5">
            {analysisFacts(m.parsed).map((f) => (
              <li
                key={f}
                className="rounded-full border border-ink/7 bg-ink/4 px-2.5 py-0.5 text-xs text-muted-foreground"
              >
                {f}
              </li>
            ))}
          </ul>
        )}
        {m.parsed?.question && (
          <p>
            <span className="text-muted-foreground">Asks: </span>
            {m.parsed.question}
          </p>
        )}
        {m.suggestion?.note && <p className="text-muted-foreground">{m.suggestion.note}</p>}
        {m.suggestion && m.suggestion.options.length > 0 && (
          <Options inquiry={m} options={m.suggestion.options} />
        )}
        {m.suggestion?.draft && <Reply inquiry={m} draft={m.suggestion.draft} />}
      </section>

      {!m.suggestion?.draft && m.status !== 'declined' && <Reply inquiry={m} draft="" />}
    </article>
  );
}

/** What staff can do with any message, with or without the agent. */
function MessageActions({ inquiry }: { inquiry: Inquiry }) {
  const { openNew } = useBookingEditor();
  const { open } = useBookingDrawer();
  const guests = useGuests();
  const decline = useDeclineInquiry(inquiry.id);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {inquiry.bookingId ? (
        <Button variant="outline" size="sm" onClick={() => open(inquiry.bookingId!)}>
          Open booking
        </Button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          disabled={!guests.data}
          onClick={() => openNew(bookingPrefillFor(inquiry, guests.data ?? []))}
        >
          <CalendarPlus /> Create booking
        </Button>
      )}
      {canDecline(inquiry) && (
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
      {inquiry.status === 'declined' && (
        <span className="text-sm text-muted-foreground">Declined, no booking will be made.</span>
      )}
      {decline.error && <ErrorNotice message={decline.error.message} className="w-full" />}
    </div>
  );
}

function Options({ inquiry, options }: { inquiry: Inquiry; options: StayOption[] }) {
  const hold = useInboxHold(inquiry.id);
  return (
    <Section title="Available rooms" count={options.length}>
      <ul className="flex flex-col overflow-hidden rounded-xl bg-card shadow-card">
        {options.map((o) => (
          <li key={o.roomId} className="flex items-center gap-3 border-b px-3 py-2 last:border-b-0">
            <span className="rounded-md border border-ink/7 bg-background px-1.5 py-0.5 font-mono text-xs">
              {o.roomName}
            </span>
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{o.roomTypeName}</span>
            <span className="font-medium tabular-nums">{formatCzk(o.quote.total)}</span>
            {!inquiry.bookingId && (
              <Button
                size="sm"
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
    </Section>
  );
}

function Reply({ inquiry, draft }: { inquiry: Inquiry; draft: string }) {
  const [text, setText] = useState(inquiry.reply ?? draft);
  const manual = draft === '';
  const replied = useMarkReplied(inquiry.id);
  const sent = inquiry.status === 'replied';
  return (
    <Section title={manual ? 'Write a reply' : 'Reply'}>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={manual ? 6 : 10}
        placeholder={
          manual ? 'Write the reply you send the guest, then mark it as sent.' : undefined
        }
        disabled={sent}
        className="bg-background leading-relaxed"
      />
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          disabled={sent || !text.trim() || replied.isPending}
          onClick={() => replied.mutate(text)}
        >
          {sent ? 'Marked as sent' : 'Mark as sent'}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void navigator.clipboard.writeText(text)}>
          <Copy /> Copy
        </Button>
      </div>
      {replied.isError && <ErrorNotice message={replied.error.message} />}
    </Section>
  );
}
