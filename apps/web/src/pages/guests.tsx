import type { Guest } from '@orbit/shared';
import {
  columnFilteringFeature,
  createColumnHelper,
  createFilteredRowModel,
  createSortedRowModel,
  filterFn_includesString,
  globalFilteringFeature,
  rowSortingFeature,
  sortFn_text,
  tableFeatures,
  useTable,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, CalendarPlus, ExternalLink, Plus, Users } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router';
import { ActionMenu } from '@/components/action-menu';
import { EmptyState } from '@/components/empty-state';
import { ErrorNotice } from '@/components/error-notice';
import { GuestAvatar } from '@/components/guest-avatar';
import { GuestEditorDialog } from '@/components/guest-editor';
import { PageHeader } from '@/components/page-header';
import { SearchField } from '@/components/search-field';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useBookingEditor } from '@/hooks/use-booking-editor';
import { useGuests } from '@/lib/api';
import { languageLabels } from '@/lib/format';
import { cn, labelCaps } from '@/lib/utils';

const features = tableFeatures({
  columnFilteringFeature,
  globalFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
  filterFns: { includesString: filterFn_includesString },
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { text: sortFn_text },
});

const helper = createColumnHelper<typeof features, Guest>();
const columns = helper.columns([
  helper.accessor('name', {
    header: 'Name',
    sortFn: 'text',
    cell: (info) => (
      <span className="flex items-center gap-2.5 font-medium">
        <GuestAvatar name={info.getValue()} />
        {info.getValue()}
      </span>
    ),
  }),
  helper.accessor('language', {
    header: 'Language',
    cell: (info) => languageLabels[info.getValue()],
  }),
  helper.accessor('email', { header: 'Email', cell: (info) => info.getValue() ?? '–' }),
  helper.accessor('phone', { header: 'Phone', cell: (info) => info.getValue() ?? '–' }),
]);

const searchable = new Set(['name', 'email']);
/** Columns left out on phones, where the name and email fill the width. */
const wideOnly = new Set(['language', 'phone']);
const noGuests: Guest[] = [];

export function GuestsPage() {
  const guests = useGuests();
  const { openNew } = useBookingEditor();
  const navigate = useNavigate();
  // `?new=guest` opens the form, so the command bar can link to it.
  const [params, setParams] = useSearchParams();
  const creating = params.get('new') === 'guest';
  const setCreating = (open: boolean) =>
    setParams(
      (p) => {
        if (open) p.set('new', 'guest');
        else p.delete('new');
        return p;
      },
      { replace: true },
    );
  const table = useTable({
    features,
    columns,
    data: guests.data ?? noGuests,
    globalFilterFn: 'includesString',
    getColumnCanGlobalFilter: (column) => searchable.has(column.id),
    initialState: { sorting: [{ id: 'name', desc: false }] },
  });
  const rows = table.getRowModel().rows;

  return (
    <>
      <PageHeader
        title="Guests"
        meta={guests.data && `${rows.length}`}
        actions={
          <>
            <SearchField
              label="Filter guests"
              placeholder="Filter by name or email"
              value={String(table.state.globalFilter ?? '')}
              onChange={(v) => table.setGlobalFilter(v)}
              className="w-40 sm:w-56"
            />
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus /> <span className="hidden sm:inline">New guest</span>
            </Button>
          </>
        }
      />
      <div className="scrollbar-thin min-h-0 flex-1 overflow-auto">
        {guests.isError ? (
          <ErrorNotice message={guests.error.message} className="m-6" />
        ) : !guests.data ? (
          <Skeleton className="m-6 h-64" />
        ) : rows.length === 0 ? (
          <EmptyState icon={Users} title="No guests match this filter" className="mt-16" />
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-surface-sunken/90 backdrop-blur-md">
              {table.getHeaderGroups().map((group) => (
                <tr key={group.id} className="border-b">
                  {group.headers.map((header) => {
                    const sorted = header.column.getIsSorted();
                    return (
                      <th
                        key={header.id}
                        className={cn(
                          labelCaps,
                          'h-10 px-4 text-left first:pl-6',
                          wideOnly.has(header.column.id) && 'max-md:hidden',
                        )}
                      >
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 uppercase hover:text-foreground"
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          <table.FlexRender header={header} />
                          {sorted === 'asc' && <ArrowUp className="size-3" />}
                          {sorted === 'desc' && <ArrowDown className="size-3" />}
                        </button>
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {rows.map((row) => (
                <ActionMenu
                  key={row.id}
                  label={row.original.name}
                  actions={[
                    {
                      label: 'Open profile',
                      icon: ExternalLink,
                      onSelect: () => void navigate(`/guests/${row.original.id}`),
                    },
                    {
                      label: 'New booking…',
                      icon: CalendarPlus,
                      onSelect: () => openNew({ guestId: row.original.id }),
                    },
                  ]}
                >
                  <tr
                    className="cursor-pointer border-b border-grid-line hover:bg-accent"
                    onClick={() => void navigate(`/guests/${row.original.id}`)}
                  >
                    {row.getAllCells().map((cell) => (
                      <td
                        key={cell.id}
                        className={cn(
                          'h-11 px-4 text-muted-foreground first:pl-6 first:text-foreground',
                          wideOnly.has(cell.column.id) && 'max-md:hidden',
                        )}
                      >
                        <table.FlexRender cell={cell} />
                      </td>
                    ))}
                  </tr>
                </ActionMenu>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <GuestEditorDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}
