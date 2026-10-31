import {
  backlinks,
  type HotelInfoCategory,
  hotelInfoCategoryLabels,
  type HotelInfoEntry,
  type HotelInfoSource,
  type NoteRun,
  withoutLinks,
} from '@orbit/shared';
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ErrorNotice } from '@/components/error-notice';
import { Panel } from '@/components/panel';
import { Button } from '@/components/ui/button';
import { formatDate, formatRecent } from '@/lib/format';
import { findNote, folderIcons, noteBlocks, noteHref, tagHref } from '@/lib/knowledge';
import { cn } from '@/lib/utils';
import { Tip } from '@/components/ui/tooltip';

const sourceLabels: Record<HotelInfoSource, string> = {
  staff: 'Edited',
  agent: 'Saved via Orbit',
  reply: 'Learned from a reply',
};

/** The note's folder, as the first line of its header. */
export function FolderLabel({ folder }: { folder: HotelInfoCategory }) {
  const Icon = folderIcons[folder];
  return (
    <span className="flex items-center gap-1.5 text-[0.8125rem] text-muted-foreground">
      <Icon className="size-3.5" /> {hotelInfoCategoryLabels[folder]}
    </span>
  );
}

/** Back to the vault, where the tree and the note take turns (below lg). */
export function BackToVault() {
  return (
    <Button variant="ghost" size="icon-sm" asChild className="-ml-2 lg:hidden">
      <Link to="/knowledge" aria-label="Back to notes">
        <ArrowLeft />
      </Link>
    </Button>
  );
}

/** Tags, the notice's last day, and who last wrote the note. */
export function NoteMeta({
  tags,
  until,
  today,
  source,
  updatedAt,
}: {
  tags: string[];
  until: string | null | undefined;
  today: string | undefined;
  source?: HotelInfoSource | undefined;
  updatedAt?: string | undefined;
}) {
  const ended = Boolean(until && today && until < today);
  if (tags.length === 0 && !until && !(source && updatedAt)) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      {tags.map((t) => (
        <Link
          key={t}
          to={tagHref(t)}
          className="rounded-full bg-ink/5 px-2 py-px text-muted-foreground outline-none transition-colors hover:bg-ink/8 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          #{t}
        </Link>
      ))}
      {until && (
        <span
          className={cn(
            'rounded-full px-2 py-px',
            ended ? 'bg-ink/5 text-muted-foreground' : 'bg-warning/12 text-warning',
          )}
        >
          {ended ? 'Ended' : 'Until'} {formatDate(until)}
        </span>
      )}
      {source && updatedAt && (
        <span className="ml-1 text-subtle-foreground">
          {sourceLabels[source]} · {formatRecent(updatedAt)}
        </span>
      )}
    </div>
  );
}

/** A note's text: paragraphs, lists, and links that open the note they name. */
export function NoteBody({
  details,
  notes,
  className,
}: {
  details: string;
  notes: HotelInfoEntry[];
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-3 text-[0.9375rem] leading-7', className)}>
      {noteBlocks(details).map((block, i) =>
        block.kind === 'text' ? (
          <p key={i}>
            <Runs runs={block.runs} notes={notes} />
          </p>
        ) : (
          <ul key={i} className="flex list-disc flex-col gap-1 pl-5 marker:text-subtle-foreground">
            {block.items.map((runs, j) => (
              <li key={j}>
                <Runs runs={runs} notes={notes} />
              </li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}

function Runs({ runs, notes }: { runs: NoteRun[]; notes: HotelInfoEntry[] }) {
  return runs.map((run, i) => {
    if ('text' in run) return <Fragment key={i}>{run.text}</Fragment>;
    const target = findNote(notes, run.link);
    return target ? (
      <Link
        key={i}
        to={noteHref(target.id)}
        className="rounded-sm font-medium underline decoration-ink/25 underline-offset-[3px] outline-none transition-colors hover:decoration-ink/70 focus-visible:ring-2 focus-visible:ring-ring"
      >
        {run.link}
      </Link>
    ) : (
      <Tip key={i} label="No note with this title">
        <span className="text-muted-foreground underline decoration-ink/25 decoration-dotted underline-offset-[3px]">
          {run.link}
        </span>
      </Tip>
    );
  });
}

/** The reading view of a note, with the notes that mention it underneath. */
export function NoteView({
  note,
  notes,
  today,
  onEdit,
  onDelete,
  error,
}: {
  note: HotelInfoEntry;
  notes: HotelInfoEntry[];
  today: string | undefined;
  onEdit: () => void;
  onDelete: () => void;
  error: string | null;
}) {
  const mentions = backlinks(notes, note.title);
  return (
    <NoteLayout
      header={
        <>
          <BackToVault />
          <FolderLabel folder={note.category} />
          <span className="ml-auto flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={onEdit}>
              <Pencil /> Edit
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Delete"
              tooltip="Delete"
              onClick={onDelete}
            >
              <Trash2 />
            </Button>
          </span>
        </>
      }
    >
      <div className="flex flex-col gap-2.5">
        <h2 className="text-2xl font-semibold tracking-tight text-balance">{note.title}</h2>
        <NoteMeta
          tags={note.tags ?? []}
          until={note.until}
          today={today}
          source={note.source}
          updatedAt={note.updatedAt}
        />
      </div>
      {error && <ErrorNotice message={error} />}
      <NoteBody details={note.details} notes={notes} />
      {mentions.length > 0 && (
        <Panel title="Mentioned in" count={mentions.length} className="mt-4">
          <ul className="flex flex-col">
            {mentions.map((m) => (
              <li key={m.id}>
                <Link
                  to={noteHref(m.id)}
                  className="flex flex-col gap-0.5 rounded-lg px-3 py-2 outline-none transition-colors hover:bg-accent focus-visible:bg-accent"
                >
                  <span className="text-[0.8125rem] font-medium">{m.title}</span>
                  <span className="line-clamp-1 text-xs text-muted-foreground">
                    {withoutLinks(m.details)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </NoteLayout>
  );
}

/** The column a note is read, written or reviewed in, with its header row. */
export function NoteLayout({ header, children }: { header: ReactNode; children: ReactNode }) {
  return (
    <article className="mx-auto flex min-h-full max-w-2xl flex-col gap-5 px-4 py-6 md:px-8 md:py-8">
      <header className="flex min-h-8 items-center gap-2">{header}</header>
      {children}
    </article>
  );
}
