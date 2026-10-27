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
import { useNavigate } from 'react-router';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useGuests } from '@/lib/api';
import { languageLabels } from '@/lib/format';

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
  helper.accessor('name', { header: 'Name', sortFn: 'text' }),
  helper.accessor('language', {
    header: 'Language',
    cell: (info) => languageLabels[info.getValue()],
  }),
  helper.accessor('email', { header: 'Email', cell: (info) => info.getValue() ?? '–' }),
  helper.accessor('phone', { header: 'Phone', cell: (info) => info.getValue() ?? '–' }),
]);

const searchable = new Set(['name', 'email']);
const noGuests: Guest[] = [];

export function GuestsPage() {
  const guests = useGuests();
  const navigate = useNavigate();
  const table = useTable({
    features,
    columns,
    data: guests.data ?? noGuests,
    globalFilterFn: 'includesString',
    getColumnCanGlobalFilter: (column) => searchable.has(column.id),
    initialState: { sorting: [{ id: 'name', desc: false }] },
  });

  if (guests.isError) return <p className="text-destructive">{guests.error.message}</p>;
  if (!guests.data) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="flex flex-col gap-4">
      <Input
        placeholder="Search by name or email…"
        value={String(table.state.globalFilter ?? '')}
        onChange={(e) => table.setGlobalFilter(e.target.value)}
        className="max-w-xs"
      />
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id}>
              {group.headers.map((header) => (
                <TableHead
                  key={header.id}
                  className="cursor-pointer select-none"
                  onClick={header.column.getToggleSortingHandler()}
                >
                  <table.FlexRender header={header} />
                  {{ asc: ' ↑', desc: ' ↓' }[String(header.column.getIsSorted())] ?? ''}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow
              key={row.id}
              className="cursor-pointer"
              onClick={() => void navigate(`/guests/${row.original.id}`)}
            >
              {row.getAllCells().map((cell) => (
                <TableCell key={cell.id}>
                  <table.FlexRender cell={cell} />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
