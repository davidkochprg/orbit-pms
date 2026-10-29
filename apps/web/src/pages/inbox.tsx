import type { Inquiry } from '@orbit/shared';
import { Archive, Inbox, Mail, MailOpen, PenSquare, Plus, Reply, Search } from 'lucide-react';
import { type ComponentType, useState } from 'react';
import { Link, useParams } from 'react-router';
import { EmptyState } from '@/components/empty-state';
import { ErrorNotice } from '@/components/error-notice';
import { GuestAvatar } from '@/components/guest-avatar';
import { ComposeEmail } from '@/components/inbox-compose';
import { IncomingDialog } from '@/components/inbox-dialogs';
import { Conversation } from '@/components/inbox-conversation';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useInbox } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import {
  channelLabel,
  channelsOf,
  filterConversations,
  folderCounts,
  folderLabels,
  type InboxFolder,
  preview,
  senderLabel,
} from '@/lib/inbox';
import { cn } from '@/lib/utils';

const folders: { id: InboxFolder; icon: ComponentType<{ className?: string }> }[] = [
  { id: 'inbox', icon: Inbox },
  { id: 'unread', icon: Mail },
  { id: 'awaiting', icon: Reply },
  { id: 'archived', icon: Archive },
];

/**
 * A basic mail client for every guest channel: direct email and OTA messaging in one list,
 * folders, search and filters, conversations with their full history, and replies. A new email
 * is written in the reading pane (`/inbox/new`).
 */
export function InboxPage() {
  const { id } = useParams();
  const composing = id === 'new';
  const inbox = useInbox();
  const [folder, setFolder] = useState<InboxFolder>('inbox');
  const [channel, setChannel] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const all = inbox.data ?? [];
  const counts = folderCounts(all);
  const shown = filterConversations(all, { folder, channel, query });
  const channels = channelsOf(all);

  return (
    <>
      <PageHeader
        title="Inbox"
        meta={counts.unread > 0 ? `${counts.unread} unread` : undefined}
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={() => setAdding(true)}>
              <Plus /> Add a guest message
            </Button>
            <Button size="sm" asChild>
              <Link to="/inbox/new">
                <PenSquare /> New email
              </Link>
            </Button>
          </>
        }
      />
      <div className="flex min-h-0 flex-1">
        <nav
          aria-label="Folders"
          className="hidden w-52 shrink-0 flex-col gap-0.5 border-r p-2 xl:flex"
        >
          {folders.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFolder(f.id)}
              aria-current={folder === f.id ? 'page' : undefined}
              className={cn(
                'flex h-8 items-center gap-2.5 rounded-control px-2.5 text-left outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring',
                folder === f.id && 'bg-accent font-medium',
              )}
            >
              <f.icon className="size-4 text-muted-foreground" />
              <span className="flex-1">{folderLabels[f.id]}</span>
              {counts[f.id] > 0 && f.id !== 'archived' && (
                <span className="text-xs text-muted-foreground tabular-nums">{counts[f.id]}</span>
              )}
            </button>
          ))}
          {channels.length > 1 && (
            <>
              <h2 className="mt-4 px-2.5 pb-1 text-xs font-medium text-subtle-foreground">
                Channels
              </h2>
              {[null, ...channels].map((c) => (
                <button
                  key={c ?? 'all'}
                  type="button"
                  onClick={() => setChannel(c)}
                  aria-pressed={channel === c}
                  className={cn(
                    'flex h-8 items-center rounded-control px-2.5 text-left text-sm outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring',
                    channel === c ? 'bg-accent font-medium' : 'text-muted-foreground',
                  )}
                >
                  {c ?? 'All channels'}
                </button>
              ))}
            </>
          )}
        </nav>

        <aside
          className={cn(
            'flex w-full shrink-0 flex-col border-r bg-surface-sunken md:w-[22rem]',
            id && 'hidden md:flex',
          )}
        >
          <div className="flex flex-col gap-2 border-b p-2">
            <label className="relative">
              <span className="sr-only">Search messages</span>
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search guests and messages"
                className="h-8 bg-background pl-8"
              />
            </label>
            {/* Folders and channels as chips where the rail doesn't fit. */}
            <div className="flex flex-wrap gap-1 xl:hidden">
              {folders.map((f) => (
                <Chip key={f.id} active={folder === f.id} onClick={() => setFolder(f.id)}>
                  {folderLabels[f.id]}
                  {counts[f.id] > 0 && f.id !== 'archived' && ` ${counts[f.id]}`}
                </Chip>
              ))}
              {channels.length > 1 &&
                channels.map((c) => (
                  <Chip
                    key={c}
                    active={channel === c}
                    onClick={() => setChannel(channel === c ? null : c)}
                  >
                    {c}
                  </Chip>
                ))}
            </div>
          </div>
          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
            {inbox.isError && <ErrorNotice message={inbox.error.message} className="m-3" />}
            {!inbox.data && !inbox.isError && <Skeleton className="m-3 h-64" />}
            {inbox.data && shown.length === 0 && (
              <EmptyState
                icon={folder === 'archived' ? Archive : MailOpen}
                title={query ? 'Nothing matches' : `No conversations in ${folderLabels[folder]}`}
                className="py-12"
              />
            )}
            <ul className="flex flex-col p-1.5">
              {shown.map((m) => (
                <ConversationRow key={m.id} conversation={m} active={m.id === id} />
              ))}
            </ul>
          </div>
        </aside>

        <section
          className={cn('scrollbar-thin min-w-0 flex-1 overflow-y-auto', !id && 'hidden md:block')}
        >
          {composing ? (
            <ComposeEmail />
          ) : id ? (
            <Conversation key={id} id={id} />
          ) : (
            <EmptyState
              icon={Inbox}
              title="No conversation selected"
              description="Pick one to read and answer it."
              className="h-full"
            />
          )}
        </section>
      </div>
      <IncomingDialog open={adding} onOpenChange={setAdding} />
    </>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'h-6 rounded-full px-2.5 text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
        active ? 'bg-ink text-background' : 'bg-ink/5 text-muted-foreground hover:bg-ink/8',
      )}
    >
      {children}
    </button>
  );
}

function ConversationRow({ conversation: m, active }: { conversation: Inquiry; active: boolean }) {
  return (
    <li>
      <Link
        to={`/inbox/${m.id}`}
        className={cn(
          'relative flex gap-3 rounded-lg px-3 py-2.5 outline-none hover:bg-accent focus-visible:bg-accent',
          active && 'bg-accent',
        )}
      >
        {m.unread && (
          <span
            aria-label="Unread"
            className="absolute top-[18px] left-1 size-1.5 rounded-full bg-primary"
          />
        )}
        <GuestAvatar name={senderLabel(m)} size="md" />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-baseline gap-2">
            <span className={cn('truncate', m.unread ? 'font-semibold' : 'font-medium')}>
              {senderLabel(m)}
            </span>
            {m.messages.length > 1 && (
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {m.messages.length}
              </span>
            )}
            <time className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">
              {formatDateTime(m.lastMessageAt)}
            </time>
          </span>
          <span className={cn('truncate', m.unread && 'font-medium')}>
            {m.subject ?? '(no subject)'}
          </span>
          <span className="line-clamp-2 text-xs text-muted-foreground">{preview(m)}</span>
          <span className="mt-1 flex gap-1.5 text-[0.6875rem] text-muted-foreground">
            <span className="rounded-full bg-ink/5 px-2 py-px">{channelLabel(m)}</span>
            {m.bookingId && <span className="rounded-full bg-ink/5 px-2 py-px">Booking</span>}
            {m.status === 'declined' && (
              <span className="rounded-full bg-ink/5 px-2 py-px">Declined</span>
            )}
          </span>
        </span>
      </Link>
    </li>
  );
}
