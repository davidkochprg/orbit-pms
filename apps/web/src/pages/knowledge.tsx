import {
  type HotelInfoCategory,
  hotelInfoCategories,
  type HotelInfoEntry,
  type HotelInfoSource,
} from '@orbit/shared';
import { BookOpenText, Plus } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { EmptyState } from '@/components/empty-state';
import { ErrorNotice } from '@/components/error-notice';
import { KnowledgeEditor } from '@/components/knowledge-editor';
import { PageBody, PageHeader } from '@/components/page-header';
import { Panel } from '@/components/panel';
import { SearchField } from '@/components/search-field';
import { Segmented } from '@/components/segmented';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useDayOverview, useHotelInfo } from '@/lib/api';
import { formatDate, formatRecent } from '@/lib/format';
import { entryHints, isEntryCategory } from '@/lib/settings';
import { cn } from '@/lib/utils';

type Filter = 'all' | HotelInfoCategory | 'notices';

const filters: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  ...hotelInfoCategories.map((c) => ({ value: c, label: entryHints[c].title })),
  { value: 'notices', label: 'Notices' },
];

const sourceLabels: Record<HotelInfoSource, string> = {
  staff: 'Edited',
  agent: 'Saved via Orbit',
  reply: 'Learned from a reply',
};

const matches = (e: HotelInfoEntry, query: string) =>
  `${e.title} ${e.details}`.toLowerCase().includes(query.trim().toLowerCase());

/**
 * What staff and the agent tell guests about the hotel: policies, amenities, guest info and
 * notices that end on a date. The whole team keeps it up to date; facts Orbit saved show where
 * they came from.
 */
export function KnowledgePage() {
  const info = useHotelInfo();
  const today = useDayOverview().data?.date;
  const [params, setParams] = useSearchParams();
  const kind = params.get('kind') ?? undefined;
  const filter: Filter = kind === 'notices' || isEntryCategory(kind) ? kind : 'all';
  const [query, setQuery] = useState('');
  // null: closed; { entry: null }: a new entry.
  const [editing, setEditing] = useState<{ entry: HotelInfoEntry | null } | null>(null);

  const entries = info.data ?? [];
  const shown = entries.filter(
    (e) =>
      matches(e, query) &&
      (filter === 'all' || (filter === 'notices' ? Boolean(e.until) : e.category === filter)),
  );
  const groups: { title: string; entries: HotelInfoEntry[] }[] =
    filter === 'notices'
      ? [
          {
            title: 'Notices',
            entries: shown.sort((a, b) => (a.until ?? '').localeCompare(b.until ?? '')),
          },
        ]
      : hotelInfoCategories
          .map((c) => ({
            title: entryHints[c].title,
            entries: shown.filter((e) => e.category === c),
          }))
          .filter((g) => g.entries.length > 0);

  return (
    <>
      <PageHeader
        title="Knowledge"
        meta={info.data && `${entries.length}`}
        actions={
          <>
            <SearchField
              label="Search knowledge"
              placeholder="Search"
              value={query}
              onChange={setQuery}
              className="w-56 max-sm:hidden"
            />
            <Button size="sm" onClick={() => setEditing({ entry: null })}>
              <Plus /> <span className="hidden sm:inline">New entry</span>
            </Button>
          </>
        }
      />
      <PageBody>
        <div className="flex max-w-4xl flex-col gap-4">
          <Segmented
            label="Show"
            size="sm"
            value={filter}
            options={filters}
            onChange={(value) =>
              setParams(value === 'all' ? {} : { kind: value }, { replace: true })
            }
            className="self-start max-sm:max-w-full max-sm:overflow-x-auto"
          />
          {info.isError ? (
            <ErrorNotice message={info.error.message} />
          ) : !info.data ? (
            <Skeleton className="h-80" />
          ) : groups.length === 0 ? (
            <EmptyState
              icon={BookOpenText}
              title={entries.length === 0 ? 'No entries yet' : 'Nothing matches'}
              className="mt-10"
            />
          ) : (
            groups.map((g) => (
              <Panel key={g.title} title={g.title} count={g.entries.length} contentClassName="p-0">
                <ul className="divide-y divide-ink/5">
                  {g.entries.map((e) => (
                    <li key={e.id}>
                      <EntryRow entry={e} today={today} onOpen={() => setEditing({ entry: e })} />
                    </li>
                  ))}
                </ul>
              </Panel>
            ))
          )}
        </div>
      </PageBody>
      {editing && (
        <KnowledgeEditor
          entry={editing.entry}
          category={filter !== 'all' && filter !== 'notices' ? filter : 'info'}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function EntryRow({
  entry,
  today,
  onOpen,
}: {
  entry: HotelInfoEntry;
  today: string | undefined;
  onOpen: () => void;
}) {
  const ended = Boolean(entry.until && today && entry.until < today);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-start gap-4 px-4 py-3 text-left outline-none transition-colors hover:bg-accent/60 focus-visible:bg-accent"
    >
      <span className={cn('flex min-w-0 flex-1 flex-col gap-0.5', ended && 'opacity-60')}>
        <span className="text-[0.8125rem] font-medium">{entry.title}</span>
        <span className="line-clamp-2 text-[0.8125rem] text-muted-foreground">{entry.details}</span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1 pt-0.5 text-xs">
        {entry.until && (
          <span
            className={cn(
              'rounded-full px-2 py-px',
              ended ? 'bg-ink/5 text-muted-foreground' : 'bg-warning/12 text-warning',
            )}
          >
            {ended ? 'Ended' : 'Until'} {formatDate(entry.until)}
          </span>
        )}
        {entry.source && entry.updatedAt && (
          <span className="text-subtle-foreground">
            {sourceLabels[entry.source]} · {formatRecent(entry.updatedAt)}
          </span>
        )}
      </span>
    </button>
  );
}
