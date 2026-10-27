import type { Inquiry, StayOption } from '@orbit/shared';
import { Sparkles } from 'lucide-react';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useBookingDrawer } from '@/hooks/use-booking-drawer';
import {
  useCreateMessage,
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
  channelLabel,
  inquiryStatusLabels,
  senderLabel,
  snippet,
} from '@/lib/inbox';
import { cn } from '@/lib/utils';

export function InboxPage() {
  const { id } = useParams();
  const inbox = useInbox();

  return (
    <div className="grid h-full gap-4 lg:grid-cols-[minmax(18rem,24rem)_1fr]">
      <div className="flex min-h-0 flex-col gap-3">
        <PasteMessage />
        {inbox.isError && <p className="text-destructive">{inbox.error.message}</p>}
        {!inbox.data && !inbox.isError && <Skeleton className="h-64 w-full" />}
        <ul className="flex flex-col gap-1 overflow-y-auto">
          {inbox.data?.map((m) => (
            <MessageRow key={m.id} message={m} active={m.id === id} />
          ))}
        </ul>
      </div>
      <div className="min-w-0">
        {id ? (
          <MessageDetail id={id} />
        ) : (
          <p className="text-sm text-muted-foreground">Select a message.</p>
        )}
      </div>
    </div>
  );
}

function MessageRow({ message: m, active }: { message: Inquiry; active: boolean }) {
  return (
    <li>
      <Link
        to={`/inbox/${m.id}`}
        className={cn(
          'flex flex-col gap-1 rounded-md border p-3 text-sm hover:bg-accent',
          active && 'border-primary bg-accent',
        )}
      >
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{senderLabel(m)}</span>
          <Badge variant="outline">{channelLabel(m)}</Badge>
          <span className="ml-auto shrink-0 text-xs text-muted-foreground">
            {formatDateTime(m.receivedAt)}
          </span>
        </div>
        {m.subject && <span className="truncate">{m.subject}</span>}
        <span className="truncate text-muted-foreground">{snippet(m.rawText)}</span>
        <div className="flex gap-2">
          <Badge variant={m.status === 'new' ? 'default' : 'secondary'}>
            {inquiryStatusLabels[m.status]}
          </Badge>
          {m.parsed && <Badge variant="outline">Prepared</Badge>}
        </div>
      </Link>
    </li>
  );
}

function PasteMessage() {
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

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        Paste a message
      </Button>
    );
  }
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste a guest email here…"
        rows={6}
        autoFocus
      />
      <div className="flex gap-2">
        <Button type="submit" disabled={!text.trim() || create.isPending}>
          Add to inbox
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
      {create.isError && <p className="text-sm text-destructive">{create.error.message}</p>}
    </form>
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

  if (inquiry.isError) return <p className="text-destructive">{inquiry.error.message}</p>;
  if (!m) return <Skeleton className="h-96 w-full" />;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{m.subject ?? '(no subject)'}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {senderLabel(m)}
            {m.senderAddress && m.senderName && ` <${m.senderAddress}>`} · {channelLabel(m)} ·{' '}
            {formatDateTime(m.receivedAt)}
          </p>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap text-sm">{m.rawText}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          <CardTitle>Prepared by the agent</CardTitle>
          {m.processedAt && aiOn && (
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto"
              disabled={process.isPending}
              onClick={() => process.mutate(true)}
            >
              Prepare again
            </Button>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm">
          {!aiOn && (
            <p className="text-muted-foreground">The agent is not configured on this server.</p>
          )}
          {process.isPending && (
            <p className="text-muted-foreground">Reading the message and checking rooms…</p>
          )}
          {process.isError && <p className="text-destructive">{process.error.message}</p>}
          {m.processingError && (
            <div className="flex items-center gap-2">
              <p className="text-destructive">{m.processingError}</p>
              {aiOn && (
                <Button size="sm" variant="outline" onClick={() => process.mutate(false)}>
                  Try again
                </Button>
              )}
            </div>
          )}
          {m.parsed && (
            <div className="flex flex-wrap gap-1">
              {analysisFacts(m.parsed).map((f) => (
                <Badge key={f} variant="secondary">
                  {f}
                </Badge>
              ))}
            </div>
          )}
          {m.parsed?.question && <p>Asks: {m.parsed.question}</p>}
          {m.suggestion?.note && <p className="text-muted-foreground">{m.suggestion.note}</p>}
          {m.suggestion && m.suggestion.options.length > 0 && (
            <Options inquiry={m} options={m.suggestion.options} />
          )}
          {m.suggestion?.draft && <Reply inquiry={m} draft={m.suggestion.draft} />}
        </CardContent>
      </Card>
    </div>
  );
}

function Options({ inquiry, options }: { inquiry: Inquiry; options: StayOption[] }) {
  const hold = useInboxHold(inquiry.id);
  const { open } = useBookingDrawer();
  return (
    <div className="flex flex-col gap-2">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Room</TableHead>
            <TableHead>Type</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {options.map((o) => (
            <TableRow key={o.roomId}>
              <TableCell>{o.roomName}</TableCell>
              <TableCell>{o.roomTypeName}</TableCell>
              <TableCell className="text-right tabular-nums">{formatCzk(o.quote.total)}</TableCell>
              <TableCell className="text-right">
                {!inquiry.bookingId && (
                  <Button size="sm" disabled={hold.isPending} onClick={() => hold.mutate(o.roomId)}>
                    Hold
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {inquiry.bookingId && (
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => open(inquiry.bookingId!)}
        >
          Open hold
        </Button>
      )}
      {hold.isError && <p className="text-destructive">{hold.error.message}</p>}
    </div>
  );
}

function Reply({ inquiry, draft }: { inquiry: Inquiry; draft: string }) {
  const [text, setText] = useState(inquiry.reply ?? draft);
  const replied = useMarkReplied(inquiry.id);
  const sent = inquiry.status === 'replied';
  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-medium">Reply draft</h3>
      <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={10} disabled={sent} />
      <div className="flex items-center gap-2">
        <Button
          disabled={sent || !text.trim() || replied.isPending}
          onClick={() => replied.mutate(text)}
        >
          {sent ? 'Marked as sent' : 'Mark as sent'}
        </Button>
        <Button variant="ghost" onClick={() => void navigator.clipboard.writeText(text)}>
          Copy
        </Button>
      </div>
      {replied.isError && <p className="text-destructive">{replied.error.message}</p>}
    </div>
  );
}
