import { invoiceKindLabels, type SupplierInvoiceView } from '@orbit/shared';
import {
  BedDouble,
  FilePlus2,
  FileText,
  Plus,
  ReceiptText,
  Smartphone,
  Upload,
} from 'lucide-react';
import { useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router';
import { ActionMenu } from '@/components/action-menu';
import { BillDialog } from '@/components/bill-dialog';
import { BillScanDialog } from '@/components/bill-scan-dialog';
import { EmptyState } from '@/components/empty-state';
import { ErrorNotice } from '@/components/error-notice';
import { InvoiceMenuButton } from '@/components/invoice-list';
import { LogoMark } from '@/components/logo-mark';
import { PageHeader } from '@/components/page-header';
import { Segmented } from '@/components/segmented';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAskOrbit } from '@/hooks/use-ask-orbit';
import { useBookingDrawer } from '@/hooks/use-booking-drawer';
import { useInvoiceDialogs } from '@/hooks/use-invoice-dialogs';
import { useToast } from '@/hooks/use-toast';
import { useBills, useHealth, useInvoices, useUploadBill } from '@/lib/api';
import { formatDate, formatMoney } from '@/lib/format';
import { billState, invoiceActions, invoiceState, openInvoicePdf, toneText } from '@/lib/invoices';
import { BILL_PHOTO_MAX_EDGE, prepareIdPhoto } from '@/lib/photo';
import { cn, labelCaps } from '@/lib/utils';

type Tab = 'issued' | 'bills';

const tabs: { value: Tab; label: string }[] = [
  { value: 'issued', label: 'Issued' },
  { value: 'bills', label: 'Bills' },
];

function Head({ columns }: { columns: { label: string; className?: string }[] }) {
  return (
    <thead className="sticky top-0 z-10 bg-surface-sunken/90 backdrop-blur-md">
      <tr className="border-b">
        {columns.map((c) => (
          <th
            key={c.label}
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
 * check and pay. `?tab=bills` shows the bills, `?bill=<id>` opens one and `?new=bill` a new one.
 */
export function InvoicesPage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'bills' ? 'bills' : 'issued';
  const setParam = useCallback(
    (key: string, value: string | null) =>
      setParams(
        (p) => {
          if (value === null) p.delete(key);
          else p.set(key, value);
          return p;
        },
        { replace: true },
      ),
    [setParams],
  );
  const health = useHealth().data;
  const upload = useUploadBill();
  const { toast } = useToast();
  const file = useRef<HTMLInputElement>(null);
  const scanning = params.get('scan') === 'bill';
  const openBill = useCallback(
    (id: string) =>
      setParams(
        (p) => {
          p.set('tab', 'bills');
          p.set('bill', id);
          p.delete('scan');
          return p;
        },
        { replace: true },
      ),
    [setParams],
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

  return (
    <>
      <PageHeader
        title="Invoices"
        actions={
          <>
            <Segmented
              label="Show"
              size="sm"
              value={tab}
              options={tabs}
              onChange={(t) => setParam('tab', t === 'bills' ? 'bills' : null)}
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
                  <Button variant="outline" size="sm" onClick={() => setParam('scan', 'bill')}>
                    <Smartphone /> <span className="hidden sm:inline">Scan with phone</span>
                  </Button>
                )}
                <Button size="sm" onClick={() => setParam('new', 'bill')}>
                  <Plus /> <span className="hidden sm:inline">New bill</span>
                </Button>
              </>
            )}
          </>
        }
      />
      {upload.error && <ErrorNotice message={upload.error.message} className="mx-4 mt-4 md:mx-6" />}
      <div className="min-h-0 flex-1 overflow-auto">
        {tab === 'issued' ? <IssuedTable /> : <BillsTable onOpen={openBill} />}
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
        open={scanning}
        onOpenChange={(open) => !open && setParam('scan', null)}
        onRead={openBill}
      />
      <OpenBill
        id={params.get('bill')}
        creating={params.get('new') === 'bill'}
        onClose={() =>
          setParams(
            (p) => {
              p.delete('bill');
              p.delete('new');
              return p;
            },
            { replace: true },
          )
        }
      />
    </>
  );
}

function OpenBill({
  id,
  creating,
  onClose,
}: {
  id: string | null;
  creating: boolean;
  onClose: () => void;
}) {
  const bills = useBills();
  const bill = id ? (bills.data?.find((b) => b.id === id) ?? null) : null;
  return <BillDialog bill={bill} open={creating || bill !== null} onClose={onClose} />;
}

function IssuedTable() {
  const invoices = useInvoices();
  const { open: openBooking } = useBookingDrawer();
  const { on, dialogs } = useInvoiceDialogs();
  if (invoices.isError) {
    return <ErrorNotice message={invoices.error.message} className="m-4 md:m-6" />;
  }
  if (!invoices.data) return <Skeleton className="m-4 h-64 md:m-6" />;
  if (invoices.data.length === 0) {
    return <EmptyState icon={FileText} title="No invoices or receipts yet" className="mt-16" />;
  }
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
          {invoices.data.map((i) => {
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
                  onClick={() => openInvoicePdf(i.id)}
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
                      <span className="max-w-56 truncate">{i.buyer.company ?? i.buyer.name}</span>
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

function BillsTable({ onOpen }: { onOpen: (id: string) => void }) {
  const bills = useBills();
  const ask = useAskOrbit();
  if (bills.isError) return <ErrorNotice message={bills.error.message} className="m-4 md:m-6" />;
  if (!bills.data) return <Skeleton className="m-4 h-64 md:m-6" />;
  if (bills.data.length === 0) {
    return <EmptyState icon={ReceiptText} title="No bills" className="mt-16" />;
  }
  return (
    <table className="w-full text-sm">
      <Head
        columns={[
          { label: 'From' },
          { label: 'For', className: 'max-md:hidden' },
          { label: 'Due', className: 'max-sm:hidden' },
          { label: 'Total', className: 'text-right' },
          { label: 'Status' },
        ]}
      />
      <tbody>
        {bills.data.map((b: SupplierInvoiceView) => {
          const state = billState(b);
          return (
            <ActionMenu
              key={b.id}
              label={b.supplierName}
              actions={[
                {
                  label: b.status === 'to_review' ? 'Check…' : 'Open…',
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
                <td className="max-w-64 truncate px-4 text-muted-foreground max-md:hidden">
                  {b.repairLabel ?? b.lines[0]?.label ?? b.note ?? '–'}
                </td>
                <td className="px-4 whitespace-nowrap text-muted-foreground max-sm:hidden">
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
