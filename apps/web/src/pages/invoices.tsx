import { invoiceKindLabels, type InvoiceView, type SupplierInvoiceView } from '@orbit/shared';
import {
  BedDouble,
  FilePlus2,
  FileText,
  Plus,
  ReceiptText,
  SearchX,
  Smartphone,
  Upload,
} from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { ActionMenu } from '@/components/action-menu';
import { BillDialog } from '@/components/bill-dialog';
import { BillScanDialog } from '@/components/bill-scan-dialog';
import { EmptyState } from '@/components/empty-state';
import { ErrorNotice } from '@/components/error-notice';
import { InvoiceMenuButton } from '@/components/invoice-list';
import { LogoMark } from '@/components/logo-mark';
import { PageHeader } from '@/components/page-header';
import { Rail, RailHeading, RailItem } from '@/components/rail';
import { SearchField } from '@/components/search-field';
import { Segmented } from '@/components/segmented';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useAskOrbit } from '@/hooks/use-ask-orbit';
import { useBookingDrawer } from '@/hooks/use-booking-drawer';
import { useInvoiceDialogs } from '@/hooks/use-invoice-dialogs';
import { useToast } from '@/hooks/use-toast';
import { useBills, useHealth, useInvoices, useUploadBill } from '@/lib/api';
import { currencyMark, formatDate, formatMoney, hotelTodayIso } from '@/lib/format';
import {
  type BillFolder,
  billDate,
  billFolderLabels,
  billFolders,
  buyerOf,
  type DocumentFilter,
  inBillFolder,
  inIssuedFolder,
  type InvoiceTab,
  isFiltered,
  type IssuedFolder,
  issuedFolderLabels,
  issuedFolders,
  matchesBill,
  matchesIssued,
  noFilter,
  partyCounts,
  periodLabels,
  periods,
} from '@/lib/invoice-filters';
import { billState, invoiceActions, invoiceState, parseAmount, toneText } from '@/lib/invoices';
import { BILL_PHOTO_MAX_EDGE, prepareIdPhoto } from '@/lib/photo';
import { cn, labelCaps } from '@/lib/utils';

const tabs: { value: InvoiceTab; label: string }[] = [
  { value: 'issued', label: 'Issued' },
  { value: 'bills', label: 'Bills' },
];

/** The most parties listed in the rail; search finds the rest. */
const PARTIES = 8;

function Head({ columns }: { columns: { label: string; className?: string }[] }) {
  return (
    <thead className="sticky top-0 z-10 bg-surface-sunken/90 backdrop-blur-md">
      <tr className="border-b">
        {columns.map((c, i) => (
          <th
            key={c.label || i}
            className={cn(labelCaps, 'h-10 px-4 text-left first:pl-6 last:pr-6', c.className)}
          >
            {c.label}
          </th>
        ))}
      </tr>
    </thead>
  );
}

/**
 * Invoicing: the invoices and receipts issued for guests' bills, and the bills from suppliers to
 * check and pay. A rail beside the list picks where they stand, and narrows them by date, amount
 * and who they are for or from. `?tab=bills` shows the bills, `?show=` a folder, `?bill=<id>`
 * opens a bill and `?new=bill` a new one; an issued document opens from `?invoice=<id>`.
 */
export function InvoicesPage() {
  const [params, setParams] = useSearchParams();
  const tab: InvoiceTab = params.get('tab') === 'bills' ? 'bills' : 'issued';
  const shown = params.get('show');
  const issuedFolder: IssuedFolder = issuedFolders.find((f) => f === shown) ?? 'all';
  const billFolder: BillFolder = billFolders.find((f) => f === shown) ?? 'all';
  const [filter, setFilter] = useState<DocumentFilter>(noFilter);
  const today = hotelTodayIso();
  const invoices = useInvoices();
  const bills = useBills();

  const setParam = useCallback(
    (patch: Record<string, string | null>) =>
      setParams(
        (p) => {
          for (const [key, value] of Object.entries(patch)) {
            if (value === null) p.delete(key);
            else p.set(key, value);
          }
          return p;
        },
        { replace: true },
      ),
    [setParams],
  );
  /** Another tab or folder; the party picked belongs to one tab, so it goes. */
  const go = (next: InvoiceTab, folder: string) => {
    if (next !== tab) setFilter((f) => ({ ...f, party: null }));
    setParam({ tab: next === 'bills' ? 'bills' : null, show: folder === 'all' ? null : folder });
  };

  const clear = () => {
    setFilter(noFilter);
    setParam({ show: null });
  };

  const health = useHealth().data;
  const upload = useUploadBill();
  const { toast } = useToast();
  const file = useRef<HTMLInputElement>(null);
  const openBill = useCallback(
    (id: string) => setParam({ tab: 'bills', bill: id, scan: null }),
    [setParam],
  );

  async function onFile(input: HTMLInputElement) {
    const picked = input.files?.[0];
    input.value = '';
    if (!picked) return;
    const isPdf = picked.type === 'application/pdf' || picked.name.toLowerCase().endsWith('.pdf');
    let blob: Blob = picked;
    if (!isPdf) {
      try {
        blob = await prepareIdPhoto(picked, BILL_PHOTO_MAX_EDGE);
      } catch {
        toast({ title: "This browser couldn't open that file. Try a PDF, JPEG or PNG." });
        return;
      }
    }
    const named = Object.assign(blob, { name: isPdf ? picked.name : 'bill.jpg' });
    upload.mutate(named, { onSuccess: (bill) => openBill(bill.id) });
  }

  const issuedShown = useMemo(
    () => (invoices.data ?? []).filter((i) => matchesIssued(i, issuedFolder, filter, today)),
    [invoices.data, issuedFolder, filter, today],
  );
  const billsShown = useMemo(
    () => (bills.data ?? []).filter((b) => matchesBill(b, billFolder, filter, today)),
    [bills.data, billFolder, filter, today],
  );
  const total = (tab === 'issued' ? invoices.data : bills.data)?.length;
  const count = tab === 'issued' ? issuedShown.length : billsShown.length;
  const meta =
    total === undefined
      ? undefined
      : count === total
        ? `${total} ${tab === 'issued' ? 'issued' : total === 1 ? 'bill' : 'bills'}`
        : `${count} of ${total}`;
  const search = (
    <SearchField
      label={tab === 'issued' ? 'Search issued documents' : 'Search bills'}
      placeholder={tab === 'issued' ? 'Number, guest, company, amount' : 'Supplier, number, amount'}
      value={filter.query}
      onChange={(query) => setFilter((f) => ({ ...f, query }))}
    />
  );

  return (
    <>
      <PageHeader
        title="Invoices"
        meta={meta}
        actions={
          <>
            <Segmented
              label="Show"
              size="sm"
              value={tab}
              options={tabs}
              onChange={(t) => go(t, 'all')}
              className="xl:hidden"
            />
            {tab === 'bills' && (
              <>
                {health?.ai.configured && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={upload.isPending}
                    onClick={() => file.current?.click()}
                  >
                    <Upload />{' '}
                    <span className="hidden sm:inline">
                      {upload.isPending ? 'Reading…' : 'Upload'}
                    </span>
                  </Button>
                )}
                {health?.ai.vision && (
                  <Button variant="outline" size="sm" onClick={() => setParam({ scan: 'bill' })}>
                    <Smartphone /> <span className="hidden sm:inline">Scan with phone</span>
                  </Button>
                )}
                <Button size="sm" onClick={() => setParam({ new: 'bill' })}>
                  <Plus /> <span className="hidden sm:inline">New bill</span>
                </Button>
              </>
            )}
          </>
        }
      />
      <div className="flex min-h-0 flex-1">
        <Rail label="Invoices" header={search} className="hidden xl:flex">
          <RailHeading>Issued</RailHeading>
          {issuedFolders.map((f) => (
            <RailItem
              key={f}
              active={tab === 'issued' && issuedFolder === f}
              onClick={() => go('issued', f)}
              count={(invoices.data ?? []).filter((i) => inIssuedFolder(i, f)).length}
              strong={f === 'overdue' && (invoices.data ?? []).some((i) => i.overdue)}
            >
              {issuedFolderLabels[f]}
            </RailItem>
          ))}
          <RailHeading>Bills</RailHeading>
          {billFolders.map((f) => (
            <RailItem
              key={f}
              active={tab === 'bills' && billFolder === f}
              onClick={() => go('bills', f)}
              count={(bills.data ?? []).filter((b) => inBillFolder(b, f)).length}
              strong={f === 'to_review' && (bills.data ?? []).some((b) => b.status === 'to_review')}
            >
              {billFolderLabels[f]}
            </RailItem>
          ))}

          <RailHeading>Date</RailHeading>
          {periods.map((p) => (
            <RailItem
              key={p}
              active={filter.period === p}
              onClick={() => setFilter((f) => ({ ...f, period: p }))}
            >
              {periodLabels[p]}
            </RailItem>
          ))}

          <RailHeading>Amount, {currencyMark()}</RailHeading>
          <AmountRange filter={filter} onChange={setFilter} />

          <Parties
            title={tab === 'issued' ? 'Made out to' : 'Suppliers'}
            names={
              tab === 'issued'
                ? (invoices.data ?? []).map(buyerOf)
                : (bills.data ?? []).map((b) => b.supplierName)
            }
            active={filter.party}
            onPick={(party) => setFilter((f) => ({ ...f, party }))}
          />
        </Rail>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="border-b px-4 py-2 md:px-6 xl:hidden">{search}</div>
          {upload.error && (
            <ErrorNotice message={upload.error.message} className="mx-4 mt-4 md:mx-6" />
          )}
          <div className="min-h-0 flex-1 overflow-auto">
            {tab === 'issued' ? (
              <IssuedTable
                query={invoices}
                shown={issuedShown}
                onClear={clear}
                filtered={isFiltered(filter) || issuedFolder !== 'all'}
              />
            ) : (
              <BillsTable
                query={bills}
                shown={billsShown}
                onOpen={openBill}
                onClear={clear}
                filtered={isFiltered(filter) || billFolder !== 'all'}
              />
            )}
          </div>
        </div>
      </div>
      <input
        ref={file}
        type="file"
        accept="application/pdf,.pdf,image/*"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => void onFile(e.currentTarget)}
      />
      <BillScanDialog
        open={params.get('scan') === 'bill'}
        onOpenChange={(open) => !open && setParam({ scan: null })}
        onRead={openBill}
      />
      <OpenBill
        bills={bills.data}
        id={params.get('bill')}
        creating={params.get('new') === 'bill'}
        onClose={() => setParam({ bill: null, new: null })}
      />
    </>
  );
}

/** Lowest and highest total, typed as whole amounts. */
function AmountRange({
  filter,
  onChange,
}: {
  filter: DocumentFilter;
  onChange: (update: (f: DocumentFilter) => DocumentFilter) => void;
}) {
  const field = (key: 'min' | 'max', label: string) => (
    <label className="min-w-0 flex-1">
      <span className="sr-only">{label}</span>
      <Input
        inputMode="numeric"
        placeholder={label}
        value={filter[key] ?? ''}
        onChange={(e) => {
          const value = e.target.value.trim() ? parseAmount(e.target.value) : null;
          onChange((f) => ({ ...f, [key]: value }));
        }}
        className="h-8 tabular-nums"
      />
    </label>
  );
  return (
    <div className="flex items-center gap-1.5 px-1 py-1">
      {field('min', 'From')}
      <span className="text-muted-foreground">–</span>
      {field('max', 'To')}
    </div>
  );
}

/** Who the documents are made out to or from, the most first; a second click shows everyone. */
function Parties({
  title,
  names,
  active,
  onPick,
}: {
  title: string;
  names: string[];
  active: string | null;
  onPick: (party: string | null) => void;
}) {
  const parties = partyCounts(names);
  if (parties.length < 2) return null;
  const listed = parties.slice(0, PARTIES);
  if (active && !listed.some((p) => p.name === active)) {
    const picked = parties.find((p) => p.name === active);
    if (picked) listed.push(picked);
  }
  return (
    <>
      <RailHeading>{title}</RailHeading>
      {listed.map((p) => (
        <RailItem
          key={p.name}
          active={active === p.name}
          onClick={() => onPick(active === p.name ? null : p.name)}
          count={p.count}
        >
          {p.name}
        </RailItem>
      ))}
    </>
  );
}

function OpenBill({
  bills,
  id,
  creating,
  onClose,
}: {
  bills: SupplierInvoiceView[] | undefined;
  id: string | null;
  creating: boolean;
  onClose: () => void;
}) {
  const bill = id ? (bills?.find((b) => b.id === id) ?? null) : null;
  return <BillDialog bill={bill} open={creating || bill !== null} onClose={onClose} />;
}

interface ListQuery<T> {
  data?: T[];
  isError: boolean;
  error: Error | null;
}

/** The list's loading, error and empty states; null once there are rows to show. */
function ListState<T>({
  query,
  shown,
  filtered,
  onClear,
  icon,
  empty,
}: {
  query: ListQuery<T>;
  shown: T[];
  filtered: boolean;
  onClear: () => void;
  icon: typeof FileText;
  empty: string;
}) {
  if (query.isError) {
    return <ErrorNotice message={query.error?.message ?? ''} className="m-4 md:m-6" />;
  }
  if (!query.data) return <Skeleton className="m-4 h-64 md:m-6" />;
  if (query.data.length === 0) return <EmptyState icon={icon} title={empty} className="mt-16" />;
  if (shown.length === 0) {
    return (
      <EmptyState
        icon={SearchX}
        title={filtered ? 'Nothing matches' : empty}
        className="mt-16"
        action={
          <Button variant="outline" size="sm" onClick={onClear}>
            Clear filters
          </Button>
        }
      />
    );
  }
  return null;
}

function IssuedTable({
  query,
  shown,
  filtered,
  onClear,
}: {
  query: ListQuery<InvoiceView>;
  shown: InvoiceView[];
  filtered: boolean;
  onClear: () => void;
}) {
  const { open: openBooking } = useBookingDrawer();
  const { on, dialogs } = useInvoiceDialogs();
  const placeholder = (
    <ListState
      query={query}
      shown={shown}
      filtered={filtered}
      onClear={onClear}
      icon={FileText}
      empty="No invoices or receipts yet"
    />
  );
  if (!query.data || shown.length === 0) return placeholder;
  return (
    <>
      <table className="w-full text-sm">
        <Head
          columns={[
            { label: 'Number' },
            { label: 'Made out to' },
            { label: 'Issued', className: 'max-md:hidden' },
            { label: 'Total', className: 'text-right' },
            { label: 'Status' },
            { label: '' },
          ]}
        />
        <tbody>
          {shown.map((i) => {
            const state = invoiceState(i);
            const actions = [
              ...invoiceActions(i, on),
              {
                label: 'Open booking',
                icon: BedDouble,
                onSelect: () => openBooking(i.bookingId),
                group: true,
              },
            ];
            return (
              <ActionMenu key={i.id} label={i.number} actions={actions}>
                <tr
                  className="cursor-pointer border-b border-grid-line hover:bg-accent"
                  onClick={() => on.view(i.id)}
                >
                  <td className="py-2.5 pr-4 pl-6">
                    <span className="flex flex-col">
                      <span
                        className={cn(
                          'font-mono text-[0.8125rem]',
                          i.status === 'void' && 'text-muted-foreground line-through',
                        )}
                      >
                        {i.number}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {invoiceKindLabels[i.kind]}
                      </span>
                    </span>
                  </td>
                  <td className="px-4">
                    <span className="flex flex-col">
                      <span className="max-w-56 truncate">{buyerOf(i)}</span>
                      {i.buyer.company && (
                        <span className="max-w-56 truncate text-xs text-muted-foreground">
                          {i.guestName}
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-4 whitespace-nowrap text-muted-foreground max-md:hidden">
                    {formatDate(i.issuedOn)}
                  </td>
                  <td className="px-4 text-right font-mono whitespace-nowrap tabular-nums">
                    {formatMoney(i.total)}
                  </td>
                  <td className={cn('px-4 whitespace-nowrap', toneText[state.tone])}>
                    {state.label}
                    {i.outdated && <span className="ml-1.5 text-warning">· Outdated</span>}
                  </td>
                  <td className="w-10 pr-6" onClick={(e) => e.stopPropagation()}>
                    <InvoiceMenuButton actions={actions} />
                  </td>
                </tr>
              </ActionMenu>
            );
          })}
        </tbody>
      </table>
      {dialogs}
    </>
  );
}

function BillsTable({
  query,
  shown,
  filtered,
  onOpen,
  onClear,
}: {
  query: ListQuery<SupplierInvoiceView>;
  shown: SupplierInvoiceView[];
  filtered: boolean;
  onOpen: (id: string) => void;
  onClear: () => void;
}) {
  const ask = useAskOrbit();
  const placeholder = (
    <ListState
      query={query}
      shown={shown}
      filtered={filtered}
      onClear={onClear}
      icon={ReceiptText}
      empty="No bills"
    />
  );
  if (!query.data || shown.length === 0) return placeholder;
  return (
    <table className="w-full text-sm">
      <Head
        columns={[
          { label: 'From' },
          { label: 'For', className: 'max-lg:hidden' },
          { label: 'Issued', className: 'max-md:hidden' },
          { label: 'Due', className: 'max-sm:hidden' },
          { label: 'Total', className: 'text-right' },
          { label: 'Status' },
        ]}
      />
      <tbody>
        {shown.map((b) => {
          const state = billState(b);
          return (
            <ActionMenu
              key={b.id}
              label={b.supplierName}
              actions={[
                {
                  label: b.status === 'to_review' ? 'Check…' : 'Open',
                  icon: FilePlus2,
                  onSelect: () => onOpen(b.id),
                },
                ask && {
                  label: 'Ask Orbit',
                  icon: LogoMark,
                  onSelect: () => ask({ kind: 'bill', id: b.id }),
                },
              ]}
            >
              <tr
                className="cursor-pointer border-b border-grid-line hover:bg-accent"
                onClick={() => onOpen(b.id)}
              >
                <td className="py-2.5 pr-4 pl-6">
                  <span className="flex flex-col">
                    <span className="font-medium">{b.supplierName}</span>
                    {b.number && (
                      <span className="font-mono text-xs text-muted-foreground">{b.number}</span>
                    )}
                  </span>
                </td>
                <td className="max-w-64 truncate px-4 text-muted-foreground max-lg:hidden">
                  {b.repairLabel ?? b.lines[0]?.label ?? b.note ?? '–'}
                </td>
                <td className="px-4 whitespace-nowrap text-muted-foreground max-md:hidden">
                  {formatDate(billDate(b))}
                </td>
                <td
                  className={cn(
                    'px-4 whitespace-nowrap max-sm:hidden',
                    b.overdue ? 'text-destructive' : 'text-muted-foreground',
                  )}
                >
                  {b.dueOn ? formatDate(b.dueOn) : '–'}
                </td>
                <td className="px-4 text-right font-mono whitespace-nowrap tabular-nums">
                  {formatMoney(b.total)}
                </td>
                <td className={cn('px-4 pr-6 whitespace-nowrap', toneText[state.tone])}>
                  {state.label}
                </td>
              </tr>
            </ActionMenu>
          );
        })}
      </tbody>
    </table>
  );
}
