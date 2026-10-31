import { hotelInfoCategoryLabels, type HotelInfoEntry } from '@orbit/shared';
import {
  BookOpenText,
  CalendarClock,
  ChevronRight,
  ExternalLink,
  type LucideIcon,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { ActionMenu } from '@/components/action-menu';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState } from '@/components/empty-state';
import { ErrorNotice } from '@/components/error-notice';
import { NoteEditor } from '@/components/knowledge-editor';
import { NewNote } from '@/components/knowledge-new';
import { NoteView } from '@/components/knowledge-note';
import { PageHeader } from '@/components/page-header';
import { SearchField } from '@/components/search-field';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useDayOverview, useHotelInfo, useRemoveEntry } from '@/lib/api';
import {
  activeNotices,
  folderIcons,
  matchesNote,
  noteDraft,
  noteHref,
  tagCounts,
  tagHref,
  vaultFolders,
} from '@/lib/knowledge';
import { cn, labelCaps } from '@/lib/utils';

/**
 * Knowledge: the notes staff and the agent tell guests from, as a vault. The tree on the left
 * holds the folders, the notices in effect and the tags; the open note reads on the right, with
 * links to other notes and the notes that mention it. Staff describe a new note and Orbit files
 * it (`?new`).
 */
export function KnowledgePage() {
  const info = useHotelInfo();
  const today = useDayOverview().data?.date;
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const noteId = params.get('note');
  const adding = params.has('new');
  const tag = params.get('tag');
  const [query, setQuery] = useState('');

  const notes = info.data ?? [];
  const note = noteId ? notes.find((n) => n.id === noteId) : undefined;
  const paneOpen = adding || noteId !== null;

  return (
    <>
      <PageHeader
        title="Knowledge"
        meta={info.data && `${notes.length} ${notes.length === 1 ? 'note' : 'notes'}`}
        actions={
          <Button size="sm" asChild>
            <Link to="/knowledge?new">
              <Plus /> New note
            </Link>
          </Button>
        }
      />
      <div className="flex min-h-0 flex-1">
        <aside
          className={cn(
            'flex w-full shrink-0 flex-col border-r bg-surface-sunken lg:w-72',
            // Below lg the tree and the note take turns, as on a phone.
            paneOpen && 'hidden lg:flex',
          )}
        >
          <div className="flex flex-col gap-2 border-b p-2">
            <SearchField
              label="Search notes"
              placeholder="Search notes and tags"
              value={query}
              onChange={setQuery}
            />
            {tag && (
              <Link
                to="/knowledge"
                aria-label={`Show all notes, not only #${tag}`}
                className="flex h-6 items-center gap-1 self-start rounded-full bg-ink pr-1.5 pl-2.5 text-xs text-background outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                #{tag} <X className="size-3" />
              </Link>
            )}
          </div>
          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
            {info.isError && <ErrorNotice message={info.error.message} className="m-3" />}
            {!info.data && !info.isError && <Skeleton className="m-3 h-64" />}
            {info.data && (
              <VaultTree
                notes={notes}
                shown={notes.filter(
                  (n) => matchesNote(n, query) && (!tag || (n.tags ?? []).includes(tag)),
                )}
                activeId={noteId}
                today={today}
                tag={tag}
                filtering={query.trim() !== '' || tag !== null}
              />
            )}
          </div>
        </aside>

        <section
          className={cn(
            'scrollbar-thin min-w-0 flex-1 overflow-y-auto',
            !paneOpen && 'hidden lg:block',
          )}
        >
          {adding ? (
            <NewNote
              notes={notes}
              today={today}
              onSaved={(saved) => void navigate(noteHref(saved.id), { replace: true })}
            />
          ) : note ? (
            <NotePane key={note.id} note={note} notes={notes} today={today} />
          ) : noteId && info.data ? (
            <EmptyState icon={BookOpenText} title="Note not found" className="h-full" />
          ) : (
            <EmptyState
              icon={BookOpenText}
              title={info.data && notes.length === 0 ? 'No notes yet' : 'No note selected'}
              className="h-full"
            />
          )}
        </section>
      </div>
    </>
  );
}

/** The open note: read, edited in place, or deleted. */
function NotePane({
  note,
  notes,
  today,
}: {
  note: HotelInfoEntry;
  notes: HotelInfoEntry[];
  today: string | undefined;
}) {
  const navigate = useNavigate();
  const remove = useRemoveEntry();
  const [params, setParams] = useSearchParams();
  const [editingHere, setEditing] = useState(false);
  const [deletingHere, setDeleting] = useState(false);
  // The tree's right-click menu asks for these with `&edit` or `&delete` on the note's link.
  const editing = editingHere || params.has('edit');
  const deleting = deletingHere || params.has('delete');
  const settle = (setter: (on: boolean) => void) => (on: boolean) => {
    setter(on);
    if (on || (!params.has('edit') && !params.has('delete'))) return;
    const next = new URLSearchParams(params);
    next.delete('edit');
    next.delete('delete');
    setParams(next, { replace: true });
  };
  const setEditingNow = settle(setEditing);
  const setDeletingNow = settle(setDeleting);

  if (editing) {
    return (
      <NoteEditor
        id={note.id}
        initial={noteDraft(note)}
        onSaved={() => setEditingNow(false)}
        onCancel={() => setEditingNow(false)}
      />
    );
  }
  return (
    <>
      <NoteView
        note={note}
        notes={notes}
        today={today}
        onEdit={() => setEditing(true)}
        onDelete={() => setDeleting(true)}
        error={remove.error?.message ?? null}
      />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeletingNow}
        title={`Delete "${note.title}"?`}
        description="Orbit stops telling guests about it."
        confirmLabel="Delete"
        destructive
        busy={remove.isPending}
        onConfirm={() =>
          remove.mutate(note.id, {
            onSuccess: () => void navigate('/knowledge', { replace: true }),
            onSettled: () => setDeletingNow(false),
          })
        }
      />
    </>
  );
}

/** Notices in effect, the folders with their notes, and the tags. */
function VaultTree({
  notes,
  shown,
  activeId,
  today,
  tag,
  filtering,
}: {
  notes: HotelInfoEntry[];
  /** The notes that match the search and tag. */
  shown: HotelInfoEntry[];
  activeId: string | null;
  today: string | undefined;
  tag: string | null;
  /** Groups stay open while searching, so every match shows. */
  filtering: boolean;
}) {
  const notices = today ? activeNotices(shown, today) : [];
  const folders = vaultFolders(shown);
  const tags = tagCounts(notes);

  if (notes.length > 0 && shown.length === 0) {
    return <EmptyState icon={BookOpenText} title="Nothing matches" className="py-12" />;
  }
  return (
    <nav aria-label="Notes" className="flex flex-col gap-0.5 p-1.5">
      {notices.length > 0 && (
        <TreeGroup
          icon={CalendarClock}
          label="Notices"
          notes={notices}
          activeId={activeId}
          today={today}
          open={filtering}
        />
      )}
      {folders.map((f) => (
        <TreeGroup
          key={f.folder}
          icon={folderIcons[f.folder]}
          label={hotelInfoCategoryLabels[f.folder]}
          notes={f.notes}
          activeId={activeId}
          today={today}
          open={filtering}
        />
      ))}
      {tags.length > 0 && (
        <section aria-labelledby="vault-tags" className="mt-4 flex flex-col gap-2 px-2.5 pb-3">
          <h2 id="vault-tags" className={labelCaps}>
            Tags
          </h2>
          <div className="flex flex-wrap gap-1">
            {tags.map((t) => (
              <Link
                key={t.tag}
                to={t.tag === tag ? '/knowledge' : tagHref(t.tag)}
                aria-pressed={t.tag === tag}
                className={cn(
                  'h-6 rounded-full px-2 text-xs leading-6 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                  t.tag === tag
                    ? 'bg-ink text-background'
                    : 'bg-ink/5 text-muted-foreground hover:bg-ink/8 hover:text-foreground',
                )}
              >
                #{t.tag}
                {t.count > 1 && <span className="ml-1 opacity-60 tabular-nums">{t.count}</span>}
              </Link>
            ))}
          </div>
        </section>
      )}
    </nav>
  );
}

/** A folder (or the notices) in the tree: a row that folds, and its notes under a guide line. */
function TreeGroup({
  icon: Icon,
  label,
  notes,
  activeId,
  today,
  open: forced,
}: {
  icon: LucideIcon;
  label: string;
  notes: HotelInfoEntry[];
  activeId: string | null;
  today: string | undefined;
  open: boolean;
}) {
  const navigate = useNavigate();
  const [folded, setFolded] = useState(false);
  const open = forced || !folded;
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setFolded(open)}
        className="flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-[0.8125rem] font-medium outline-none transition-colors duration-150 ease-snap hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChevronRight
          className={cn(
            'size-3.5 text-subtle-foreground transition-transform duration-150 ease-snap',
            open && 'rotate-90',
          )}
        />
        <Icon className="size-4 text-muted-foreground" />
        <span className="flex-1 truncate">{label}</span>
        <span className="text-xs font-normal text-muted-foreground tabular-nums">
          {notes.length}
        </span>
      </button>
      {open && (
        <ul className="mb-1 ml-[0.9375rem] flex flex-col border-l border-ink/8 pl-1.5">
          {notes.map((n) => {
            const ended = Boolean(n.until && today && n.until < today);
            return (
              <li key={n.id}>
                <ActionMenu
                  label={n.title}
                  actions={[
                    {
                      label: 'Open',
                      icon: ExternalLink,
                      onSelect: () => void navigate(noteHref(n.id)),
                    },
                    {
                      label: 'Edit',
                      icon: Pencil,
                      onSelect: () => void navigate(`${noteHref(n.id)}&edit`),
                    },
                    {
                      label: 'Delete…',
                      icon: Trash2,
                      destructive: true,
                      group: true,
                      onSelect: () => void navigate(`${noteHref(n.id)}&delete`),
                    },
                  ]}
                >
                  <Link
                    to={noteHref(n.id)}
                    aria-current={n.id === activeId ? 'page' : undefined}
                    className={cn(
                      'flex h-7 items-center gap-2 rounded-md px-2 text-[0.8125rem] text-muted-foreground outline-none transition-colors duration-150 ease-snap hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
                      n.id === activeId && 'bg-sidebar-accent text-foreground',
                      ended && 'opacity-60',
                    )}
                  >
                    <span className="flex-1 truncate">{n.title}</span>
                    {n.until && !ended && (
                      <span
                        aria-label="Notice"
                        className="size-1.5 shrink-0 rounded-full bg-warning"
                      />
                    )}
                  </Link>
                </ActionMenu>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
