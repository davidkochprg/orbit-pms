import type { BulkAction, Inquiry, MailDraft, MailFolder } from '@orbit/shared';
import {
  Archive,
  ArchiveRestore,
  Check,
  File,
  Inbox,
  Keyboard,
  Mail,
  MailOpen,
  MoreHorizontal,
  Paperclip,
  PenSquare,
  Plus,
  Reply,
  Send,
  Star,
  Tag,
  Trash2,
  Undo2,
} from 'lucide-react';
import {
  type ComponentType,
  type ReactNode,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState } from '@/components/empty-state';
import { ErrorNotice } from '@/components/error-notice';
import { GuestAvatar } from '@/components/guest-avatar';
import { IncomingDialog } from '@/components/inbox-dialogs';
import { Conversation } from '@/components/inbox-conversation';
import { type ComposerStart, MailComposer } from '@/components/mail-composer';
import { LabelChips, LabelDialog, LabelDot, LabelMenu } from '@/components/mail-labels';
import { ShortcutsDialog } from '@/components/mail-shortcuts';
import { PageHeader } from '@/components/page-header';
import { SearchField } from '@/components/search-field';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import {
  useBulkInbox,
  useDeleteForever,
  useDrafts,
  useHotelProfile,
  useInbox,
  useInquiry,
  useMailLabels,
} from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import {
  channelLabel,
  channelsOf,
  filterConversations,
  folderCounts,
  folderLabels,
  labelCounts,
  preview,
  senderLabel,
  snippet,
} from '@/lib/inbox';
import {
  conversationFiles,
  forwardBody,
  forwardLink,
  forwardSubject,
  newDraftId,
  recipientLabel,
  REPLY_EVENT,
  stripCompose,
} from '@/lib/mail';
import { mailKeyAction, typingIn } from '@/lib/mail-keys';
import { cn, labelCaps } from '@/lib/utils';

const folders: { id: MailFolder; icon: ComponentType<{ className?: string }> }[] = [
  { id: 'inbox', icon: Inbox },
  { id: 'starred', icon: Star },
  { id: 'awaiting', icon: Reply },
  { id: 'sent', icon: Send },
  { id: 'drafts', icon: File },
  { id: 'archived', icon: Archive },
  { id: 'trash', icon: Trash2 },
];
const folderIds = new Set<string>(folders.map((f) => f.id));

/**
 * A mail client for every guest channel, Gmail style: folders, labels, stars, a trash, drafts
 * that save as staff type, replies with copies and files, forwards, bulk changes and keyboard
 * shortcuts. Direct email and OTA messaging share one list. A new email or a draft is written
 * in the reading pane (`/inbox/new`). Orbit records what is sent; delivery happens outside it.
 */
export function InboxPage() {
  const { id } = useParams();
  const composing = id === 'new';
  const location = useLocation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const folderParam = params.get('folder') ?? 'inbox';
  const folder: MailFolder = folderIds.has(folderParam) ? (folderParam as MailFolder) : 'inbox';
  const label = params.get('label');
  const inbox = useInbox();
  const drafts = useDrafts();
  const labels = useMailLabels();
  const bulk = useBulkInbox();
  const remove = useDeleteForever();
  const { toast } = useToast();
  const [channel, setChannel] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [labelEditing, setLabelEditing] = useState<string | null | undefined>(undefined);
  const [help, setHelp] = useState(false);
  const [purging, setPurging] = useState(false);
  const search = useRef<HTMLInputElement>(null);
  const all = inbox.data ?? [];
  const counts = folderCounts(all);
  const perLabel = labelCounts(all);
  const shown = filterConversations(all, { folder, label, channel, query });
  const shownDrafts = (drafts.data ?? []).filter(
    (d) => !query.trim() || matchesDraft(d, all, query),
  );
  const channels = channelsOf(all);
  const draftFor = new Set((drafts.data ?? []).flatMap((d) => (d.inquiryId ? [d.inquiryId] : [])));
  const view = label
    ? (labels.data?.find((l) => l.id === label)?.name ?? 'Label')
    : folderLabels[folder];
  const listing = folder === 'drafts' && !label;
  // Keep the folder in links, so opening a conversation doesn't lose the list.
  const keep = (path: string) => `${path}${location.search}`;

  const go = (next: { folder?: MailFolder; label?: string | null }) => {
    setSelected([]);
    setParams(
      (p) => {
        p.delete('draft');
        p.delete('forward');
        if (next.label) {
          p.set('label', next.label);
          p.delete('folder');
        } else {
          p.delete('label');
          if (next.folder && next.folder !== 'inbox') p.set('folder', next.folder);
          else p.delete('folder');
        }
        return p;
      },
      { replace: true },
    );
  };

  /** The conversations an action applies to: the selection, or else the open one. */
  const targets = () => (selected.length > 0 ? selected : id && !composing ? [id] : []);
  function act(action: BulkAction, labelId: string | null = null, ids = targets()) {
    if (ids.length === 0) return;
    bulk.mutate(
      { ids, action, labelId },
      {
        onSuccess: () => {
          setSelected([]);
          const undo: Partial<Record<BulkAction, BulkAction>> = {
            archive: 'unarchive',
            trash: 'restore',
            unarchive: 'archive',
            restore: 'trash',
          };
          const titles: Partial<Record<BulkAction, string>> = {
            archive: 'Archived',
            unarchive: 'Moved to the inbox',
            trash: 'Moved to the trash',
            restore: 'Restored',
            unread: 'Marked as unread',
          };
          const title = titles[action];
          const back = undo[action];
          if (title) {
            toast({
              title: ids.length > 1 ? `${title}: ${ids.length} conversations` : title,
              ...(back && {
                action: { label: 'Undo', run: () => bulk.mutate({ ids, action: back }) },
              }),
            });
          }
          // An archived or trashed conversation leaves the view; show the list again.
          if (id && ids.includes(id) && (action === 'archive' || action === 'trash')) {
            void navigate(`/inbox${location.search}`);
          }
        },
      },
    );
  }

  // Gmail's keys. "g" waits for the next key to say where to go.
  const goKey = useRef(false);
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (typingIn(e.target) || document.querySelector('[role="dialog"]')) return;
    const action = mailKeyAction(e, goKey.current);
    goKey.current = action === 'g';
    if (!action || action === 'g') return;
    const s = { shown, id, composing, act, go, selected, all };
    const at = s.shown.findIndex((m) => m.id === s.id);
    const open = (m: Inquiry | undefined) => m && void navigate(`/inbox/${m.id}${location.search}`);
    e.preventDefault();
    switch (action) {
      case 'compose':
        return void navigate(`/inbox/new${location.search}`);
      case 'search':
        return search.current?.focus();
      case 'next':
        return open(s.shown[at + 1] ?? (at < 0 ? s.shown[0] : undefined));
      case 'previous':
        return open(at > 0 ? s.shown[at - 1] : undefined);
      case 'list':
        return void navigate(`/inbox${location.search}`);
      case 'select':
        if (s.id && !s.composing) {
          setSelected((sel) =>
            sel.includes(s.id!) ? sel.filter((x) => x !== s.id) : [...sel, s.id!],
          );
        }
        return;
      case 'reply':
      case 'replyAll':
        return window.dispatchEvent(new CustomEvent(REPLY_EVENT, { detail: action }));
      case 'forward':
        if (s.id && !s.composing) void navigate(forwardLink(s.id, location.search));
        return;
      case 'archive':
        return s.act('archive');
      case 'trash':
        return s.act('trash');
      case 'star': {
        const ids = s.selected.length > 0 ? s.selected : s.id ? [s.id] : [];
        const starred = ids.every((x) => s.all.find((m) => m.id === x)?.starred);
        return s.act(starred ? 'unstar' : 'star', null, ids);
      }
      case 'unread':
        return s.act('unread');
      case 'read':
        return s.act('read');
      case 'help':
        return setHelp(true);
      case 'goInbox':
        return s.go({ folder: 'inbox' });
      case 'goStarred':
        return s.go({ folder: 'starred' });
      case 'goSent':
        return s.go({ folder: 'sent' });
      case 'goDrafts':
        return s.go({ folder: 'drafts' });
    }
  });
  useEffect(() => {
    const listener = (e: KeyboardEvent) => onKey(e);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);

  const allSelected = shown.length > 0 && shown.every((m) => selected.includes(m.id));
  const chosen = all.filter((m) => selected.includes(m.id));
  const inTrash = folder === 'trash' && !label;

  return (
    <>
      <PageHeader
        title="Inbox"
        meta={counts.unread > 0 ? `${counts.unread} unread` : undefined}
        actions={
          <>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Keyboard shortcuts"
              title="Keyboard shortcuts (?)"
              onClick={() => setHelp(true)}
              className="max-md:hidden"
            >
              <Keyboard />
            </Button>
            <Button
              variant="outline"
              size="sm"
              aria-label="Add a guest message"
              title="Add a guest message"
              onClick={() => setAdding(true)}
            >
              <Plus /> <span className="hidden sm:inline">Add a guest message</span>
            </Button>
            <Button size="sm" asChild>
              <Link to={keep('/inbox/new')}>
                <PenSquare /> Compose
              </Link>
            </Button>
          </>
        }
      />
      <div className="flex min-h-0 flex-1">
        <nav
          aria-label="Folders"
          className="scrollbar-thin hidden w-52 shrink-0 flex-col gap-0.5 overflow-y-auto border-r px-3.5 py-3 xl:flex"
        >
          {folders.map((f) => (
            <RailItem
              key={f.id}
              icon={<f.icon className="size-4" />}
              active={!label && folder === f.id}
              onClick={() => go({ folder: f.id })}
              count={railCount(f.id, counts, drafts.data?.length ?? 0)}
              strong={f.id === 'inbox' && counts.unread > 0}
            >
              {folderLabels[f.id]}
            </RailItem>
          ))}
          <div className={cn(labelCaps, 'mt-4 flex h-7 items-center pr-1 pl-2.5')}>
            <span className="flex-1">Labels</span>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="New label"
              title="New label"
              onClick={() => setLabelEditing(null)}
            >
              <Plus />
            </Button>
          </div>
          {(labels.data ?? []).map((l) => (
            <div key={l.id} className="group/label relative">
              <RailItem
                icon={<LabelDot color={l.color} className="mx-1" />}
                active={label === l.id}
                onClick={() => go({ label: l.id })}
                count={perLabel.get(l.id) ?? 0}
              >
                {l.name}
              </RailItem>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Edit ${l.name}`}
                onClick={() => setLabelEditing(l.id)}
                className="absolute top-1.5 right-1 bg-sidebar-accent opacity-0 group-hover/label:opacity-100 focus-visible:opacity-100"
              >
                <MoreHorizontal />
              </Button>
            </div>
          ))}
          {channels.length > 1 && (
            <>
              <h2 className={cn(labelCaps, 'mt-4 flex h-7 items-center px-2.5')}>Channels</h2>
              {[null, ...channels].map((c) => (
                <RailItem key={c ?? 'all'} active={channel === c} onClick={() => setChannel(c)}>
                  {c ?? 'All channels'}
                </RailItem>
              ))}
            </>
          )}
        </nav>

        <aside
          className={cn(
            'flex w-full shrink-0 flex-col border-r bg-surface-sunken lg:w-[24rem]',
            // Below lg the list and the conversation take turns, as on a phone.
            id && 'hidden lg:flex',
          )}
        >
          <div className="flex flex-col gap-2 border-b p-2">
            <SearchField
              ref={search}
              label="Search mail"
              placeholder="Search mail"
              value={query}
              onChange={setQuery}
            />
            {/* Folders and labels as chips where the rail doesn't fit. */}
            <div className="flex flex-wrap gap-1 xl:hidden">
              {folders.map((f) => (
                <Chip
                  key={f.id}
                  active={!label && folder === f.id}
                  onClick={() => go({ folder: f.id })}
                >
                  {folderLabels[f.id]}
                </Chip>
              ))}
              {(labels.data ?? []).map((l) => (
                <Chip key={l.id} active={label === l.id} onClick={() => go({ label: l.id })}>
                  {l.name}
                </Chip>
              ))}
            </div>
          </div>
          {!listing && (
            <div className="flex h-10 items-center gap-1 border-b px-2">
              <Checkbox
                label={allSelected ? 'Select none' : 'Select all'}
                checked={allSelected ? true : selected.length > 0 ? 'mixed' : false}
                onChange={() => setSelected(allSelected ? [] : shown.map((m) => m.id))}
              />
              {selected.length === 0 ? (
                <span className="ml-1.5 text-xs text-muted-foreground">
                  {view} · {shown.length}
                </span>
              ) : (
                <span className="flex min-w-0 flex-1 items-center gap-0.5">
                  <span className="mr-1 ml-1.5 text-xs text-muted-foreground tabular-nums">
                    {selected.length}
                  </span>
                  {inTrash ? (
                    <>
                      <ToolButton label="Restore" onClick={() => act('restore')}>
                        <Undo2 />
                      </ToolButton>
                      <ToolButton label="Delete forever" onClick={() => setPurging(true)}>
                        <Trash2 />
                      </ToolButton>
                    </>
                  ) : (
                    <>
                      {folder === 'archived' && !label ? (
                        <ToolButton label="Move to the inbox" onClick={() => act('unarchive')}>
                          <ArchiveRestore />
                        </ToolButton>
                      ) : (
                        <ToolButton label="Archive (e)" onClick={() => act('archive')}>
                          <Archive />
                        </ToolButton>
                      )}
                      <ToolButton label="Move to trash (#)" onClick={() => act('trash')}>
                        <Trash2 />
                      </ToolButton>
                      {chosen.some((m) => m.unread) ? (
                        <ToolButton label="Mark as read" onClick={() => act('read')}>
                          <MailOpen />
                        </ToolButton>
                      ) : (
                        <ToolButton label="Mark as unread" onClick={() => act('unread')}>
                          <Mail />
                        </ToolButton>
                      )}
                      <ToolButton
                        label={chosen.every((m) => m.starred) ? 'Unstar' : 'Star'}
                        onClick={() => act(chosen.every((m) => m.starred) ? 'unstar' : 'star')}
                      >
                        <Star />
                      </ToolButton>
                      <LabelMenu
                        align="start"
                        checked={(l) =>
                          chosen.length > 0 && chosen.every((m) => m.labelIds.includes(l))
                        }
                        onToggle={(l, on) => act(on ? 'label' : 'unlabel', l)}
                      >
                        <Button variant="ghost" size="icon-sm" aria-label="Label" title="Label">
                          <Tag />
                        </Button>
                      </LabelMenu>
                    </>
                  )}
                </span>
              )}
            </div>
          )}
          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
            {(inbox.error ?? bulk.error ?? remove.error) && (
              <ErrorNotice
                message={(inbox.error ?? bulk.error ?? remove.error)!.message}
                className="m-3"
              />
            )}
            {!inbox.data && !inbox.isError && <Skeleton className="m-3 h-64" />}
            {listing ? (
              <>
                {drafts.data && shownDrafts.length === 0 && (
                  <EmptyState
                    icon={File}
                    title={query ? 'Nothing matches' : 'No drafts'}
                    className="py-12"
                  />
                )}
                <ul className="flex flex-col p-1.5">
                  {shownDrafts.map((d) => (
                    <DraftRow key={d.id} draft={d} all={all} search={location.search} />
                  ))}
                </ul>
              </>
            ) : (
              <>
                {inbox.data && shown.length === 0 && (
                  <EmptyState
                    icon={folder === 'trash' ? Trash2 : MailOpen}
                    title={query ? 'Nothing matches' : `Nothing in ${view}`}
                    className="py-12"
                  />
                )}
                <ul className="flex flex-col p-1.5">
                  {shown.map((m) => (
                    <ConversationRow
                      key={m.id}
                      conversation={m}
                      href={keep(`/inbox/${m.id}`)}
                      active={m.id === id}
                      selected={selected.includes(m.id)}
                      draft={draftFor.has(m.id)}
                      sent={folder === 'sent' && !label}
                      label={label}
                      onSelect={(on) =>
                        setSelected((s) => (on ? [...s, m.id] : s.filter((x) => x !== m.id)))
                      }
                      onStar={() => act(m.starred ? 'unstar' : 'star', null, [m.id])}
                    />
                  ))}
                </ul>
              </>
            )}
          </div>
        </aside>

        <section
          className={cn('scrollbar-thin min-w-0 flex-1 overflow-y-auto', !id && 'hidden lg:block')}
        >
          {composing ? (
            <ComposePane
              key={params.get('draft') ?? 'new'}
              back={`/inbox${stripCompose(location.search)}`}
            />
          ) : id ? (
            <Conversation key={id} id={id} />
          ) : (
            <EmptyState icon={Inbox} title="No conversation selected" className="h-full" />
          )}
        </section>
      </div>
      <IncomingDialog open={adding} onOpenChange={setAdding} />
      <ShortcutsDialog open={help} onOpenChange={setHelp} />
      <LabelDialog
        open={labelEditing !== undefined}
        onOpenChange={(open) => !open && setLabelEditing(undefined)}
        label={labels.data?.find((l) => l.id === labelEditing)}
      />
      <ConfirmDialog
        open={purging}
        onOpenChange={setPurging}
        title={`Delete ${selected.length === 1 ? 'this conversation' : `${selected.length} conversations`} forever?`}
        description="They can't be restored."
        confirmLabel="Delete forever"
        destructive
        busy={remove.isPending}
        onConfirm={() => {
          const ids = selected;
          void Promise.all(ids.map((x) => remove.mutateAsync(x))).then(() => {
            setSelected([]);
            setPurging(false);
            if (id && ids.includes(id)) void navigate(`/inbox${location.search}`);
          });
        }}
      />
    </>
  );
}

/** The composer's starting point: a saved draft, a forward of a conversation, or a new email. */
function ComposePane({ back }: { back: string }) {
  const [params, setParams] = useSearchParams();
  const drafts = useDrafts();
  const forward = params.get('forward');
  const original = useInquiry(forward ?? undefined);
  const profile = useHotelProfile();
  const [fresh] = useState(newDraftId);
  const draftId = params.get('draft') ?? fresh;

  // The draft's ID goes into the address, so a reload opens the same draft.
  useEffect(() => {
    if (!params.get('draft')) {
      setParams(
        (p) => {
          p.set('draft', draftId);
          return p;
        },
        { replace: true },
      );
    }
  }, [params, setParams, draftId]);

  if (drafts.isError) return <ErrorNotice message={drafts.error.message} className="m-6" />;
  if (!drafts.data || (forward && (!original.data || !profile.data))) {
    return <Skeleton className="m-6 h-96" />;
  }
  const saved = drafts.data.find((d) => d.id === draftId);
  const m = original.data;
  const start: ComposerStart = saved
    ? { ...saved, draftId: saved.id, saved: true }
    : m && forward
      ? {
          draftId,
          forwardOf: m.id,
          to: [],
          cc: [],
          bcc: [],
          subject: forwardSubject(m.subject),
          body: forwardBody(m, profile.data?.name ?? 'Hotel'),
          attachments: conversationFiles(m),
          saved: false,
        }
      : {
          draftId,
          forwardOf: null,
          to: [],
          cc: [],
          bcc: [],
          subject: '',
          body: '',
          attachments: [],
          saved: false,
        };
  return <MailComposer start={start} back={back} />;
}

function railCount(
  folder: MailFolder,
  counts: ReturnType<typeof folderCounts>,
  drafts: number,
): number {
  if (folder === 'inbox') return counts.unread;
  if (folder === 'awaiting') return counts.awaiting;
  if (folder === 'drafts') return drafts;
  return 0;
}

function matchesDraft(d: MailDraft, all: Inquiry[], query: string): boolean {
  const m = d.inquiryId ? all.find((x) => x.id === d.inquiryId) : undefined;
  const text = [d.subject, d.body, m?.subject, ...d.to.map((r) => `${r.name ?? ''} ${r.address}`)]
    .join(' ')
    .toLowerCase();
  return text.includes(query.trim().toLowerCase());
}

function RailItem({
  icon,
  active,
  onClick,
  count = 0,
  strong,
  children,
}: {
  icon?: ReactNode;
  active: boolean;
  onClick: () => void;
  count?: number;
  strong?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-sm text-muted-foreground outline-none transition-colors duration-150 ease-snap hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
        active && 'bg-sidebar-accent text-foreground',
        strong && 'font-medium text-foreground',
      )}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {count > 0 && <span className="text-xs text-muted-foreground tabular-nums">{count}</span>}
    </button>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
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

function ToolButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button variant="ghost" size="icon-sm" aria-label={label} title={label} onClick={onClick}>
      {children}
    </Button>
  );
}

function Checkbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean | 'mixed';
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onChange();
      }}
      className="grid size-7 shrink-0 place-items-center rounded-md outline-none hover:bg-ink/5 focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span
        className={cn(
          'grid size-3.5 place-items-center rounded-[4px] border border-border-strong bg-background',
          checked && 'border-primary bg-primary text-primary-foreground',
        )}
      >
        {checked === true && <Check className="size-2.5" />}
        {checked === 'mixed' && <span className="h-0.5 w-2 rounded-full bg-current" />}
      </span>
    </button>
  );
}

function ConversationRow({
  conversation: m,
  href,
  active,
  selected,
  draft,
  sent,
  label,
  onSelect,
  onStar,
}: {
  conversation: Inquiry;
  href: string;
  active: boolean;
  selected: boolean;
  draft: boolean;
  /** In Sent, a row names who the hotel wrote to. */
  sent: boolean;
  label: string | null;
  onSelect: (on: boolean) => void;
  onStar: () => void;
}) {
  const labels = useMailLabels().data ?? [];
  const lastOut = m.messages.findLast((x) => x.direction === 'out');
  const who =
    sent && lastOut && lastOut.to.length > 0
      ? `To: ${lastOut.to.map(recipientLabel).join(', ')}`
      : sent
        ? `To: ${senderLabel(m)}`
        : senderLabel(m);
  const files = m.messages.some((x) => x.attachments.length > 0);
  return (
    <li
      className={cn(
        'group/row relative flex rounded-lg hover:bg-accent',
        active && 'bg-accent',
        selected && 'bg-primary-soft hover:bg-primary-soft',
      )}
    >
      {m.unread && (
        <span
          aria-label="Unread"
          className="absolute top-[22px] left-0.5 size-1.5 rounded-full bg-primary"
        />
      )}
      <span className="flex shrink-0 flex-col items-center gap-0.5 py-1.5 pl-2">
        <Checkbox
          label={`Select ${senderLabel(m)}`}
          checked={selected}
          onChange={() => onSelect(!selected)}
        />
        <button
          type="button"
          aria-label={m.starred ? 'Unstar' : 'Star'}
          aria-pressed={m.starred}
          onClick={onStar}
          className={cn(
            'grid size-7 place-items-center rounded-md outline-none hover:bg-ink/5 focus-visible:ring-2 focus-visible:ring-ring',
            m.starred ? 'text-warning' : 'text-subtle-foreground',
          )}
        >
          <Star className={cn('size-4', m.starred && 'fill-current')} />
        </button>
      </span>
      <Link
        to={href}
        className="flex min-w-0 flex-1 gap-3 rounded-lg py-2.5 pr-3 pl-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <GuestAvatar name={senderLabel(m)} size="md" />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-baseline gap-2">
            <span className={cn('truncate', m.unread ? 'font-semibold' : 'font-medium')}>
              {who}
            </span>
            {m.messages.length > 1 && (
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {m.messages.length}
              </span>
            )}
            {draft && <span className="shrink-0 text-xs text-destructive">Draft</span>}
            <span className="ml-auto flex shrink-0 items-center gap-1 text-xs text-muted-foreground tabular-nums">
              {files && <Paperclip aria-label="Has attachments" className="size-3" />}
              <time>{formatDateTime(m.lastMessageAt)}</time>
            </span>
          </span>
          <span className={cn('truncate', m.unread && 'font-medium')}>
            {m.subject ?? '(no subject)'}
          </span>
          <span className="line-clamp-2 text-xs text-muted-foreground">{preview(m)}</span>
          <span className="mt-1 flex flex-wrap gap-1.5 text-[0.6875rem] text-muted-foreground">
            <span className="rounded-full bg-ink/5 px-2 py-px">{channelLabel(m)}</span>
            {m.bookingId && <span className="rounded-full bg-ink/5 px-2 py-px">Booking</span>}
            {m.status === 'declined' && (
              <span className="rounded-full bg-ink/5 px-2 py-px">Declined</span>
            )}
            <LabelChips ids={m.labelIds} labels={labels} hide={label} />
          </span>
        </span>
      </Link>
    </li>
  );
}

function DraftRow({ draft: d, all, search }: { draft: MailDraft; all: Inquiry[]; search: string }) {
  const m = d.inquiryId ? all.find((x) => x.id === d.inquiryId) : undefined;
  const to = m ? senderLabel(m) : d.to.map(recipientLabel).join(', ') || '(no recipients)';
  const href = m
    ? `/inbox/${m.id}${search}`
    : `/inbox/new?${new URLSearchParams([...new URLSearchParams(search).entries(), ['draft', d.id]]).toString()}`;
  return (
    <li>
      <Link
        to={href}
        className="flex flex-col gap-0.5 rounded-lg px-3 py-2.5 outline-none hover:bg-accent focus-visible:bg-accent"
      >
        <span className="flex items-baseline gap-2">
          <span className="text-xs text-destructive">Draft</span>
          <span className="truncate font-medium">{to}</span>
          <time className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">
            {formatDateTime(d.updatedAt)}
          </time>
        </span>
        <span className="truncate">
          {m ? `Re: ${m.subject ?? '(no subject)'}` : d.subject || '(no subject)'}
        </span>
        <span className="line-clamp-2 text-xs text-muted-foreground">
          {snippet(d.body, 140) || ' '}
        </span>
      </Link>
    </li>
  );
}
