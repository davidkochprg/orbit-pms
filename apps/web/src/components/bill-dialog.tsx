import type { PaymentMethod, SupplierInvoiceView } from '@orbit/shared';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { ErrorNotice } from '@/components/error-notice';
import { FormField } from '@/components/form-field';
import { Segmented } from '@/components/segmented';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  billFileUrl,
  useContacts,
  useCreateBill,
  useHousekeeping,
  usePayBill,
  useRemoveBill,
  useUpdateBill,
} from '@/lib/api';
import {
  currencyMark,
  formatDate,
  formatMoney,
  hotelTodayIso,
  paymentMethodLabels,
} from '@/lib/format';
import { type BillForm, billBody, billFormFrom, emptyBillForm } from '@/lib/invoices';
import { cn } from '@/lib/utils';

const methods: { value: PaymentMethod; label: string }[] = [
  { value: 'bank_transfer', label: paymentMethodLabels.bank_transfer },
  { value: 'card', label: paymentMethodLabels.card },
  { value: 'cash', label: paymentMethodLabels.cash },
];

/**
 * A supplier's bill: the file it was read from beside its fields, to check against each other.
 * A bill Orbit read is saved as checked; one to pay can be marked paid; any can be deleted.
 * Without `bill`, a new one is typed in.
 */
export function BillDialog({
  bill,
  open,
  onClose,
}: {
  bill: SupplierInvoiceView | null;
  open: boolean;
  onClose: () => void;
}) {
  const wide = bill?.file != null;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        aria-describedby={undefined}
        className={cn(
          'max-h-[calc(100dvh-2rem)] overflow-y-auto shadow-floating',
          wide ? 'sm:max-w-5xl' : 'sm:max-w-lg',
        )}
      >
        {open && <BillEditor key={bill?.id ?? 'new'} bill={bill} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function BillFile({ bill }: { bill: SupplierInvoiceView }) {
  if (!bill.file) return null;
  const url = billFileUrl(bill.id);
  return (
    <div className="flex min-h-80 flex-col overflow-hidden rounded-stage bg-surface-sunken ring-1 ring-ink/5 ring-inset">
      {bill.file.contentType === 'application/pdf' ? (
        <iframe aria-label={bill.file.name} src={url} className="min-h-[32rem] w-full flex-1" />
      ) : (
        <img src={url} alt={bill.file.name} className="max-h-[36rem] w-full object-contain" />
      )}
    </div>
  );
}

function BillEditor({ bill, onClose }: { bill: SupplierInvoiceView | null; onClose: () => void }) {
  const contacts = useContacts().data ?? [];
  const board = useHousekeeping().data;
  const create = useCreateBill();
  const update = useUpdateBill();
  const pay = usePayBill();
  const remove = useRemoveBill();
  const { toast } = useToast();
  const [form, setForm] = useState<BillForm>(bill ? billFormFrom(bill) : emptyBillForm);
  const [method, setMethod] = useState<PaymentMethod>('bank_transfer');
  const [paidOn, setPaidOn] = useState(hotelTodayIso());
  const [deleting, setDeleting] = useState(false);
  const set = (patch: Partial<BillForm>) => setForm((f) => ({ ...f, ...patch }));
  const body = billBody(form);
  const review = bill?.status === 'to_review';
  const save = bill ? update : create;
  const error = save.error ?? pay.error ?? remove.error;

  // Open repairs on the board, and the one the bill is for even once it is done.
  const repairs = (board?.rooms ?? []).flatMap((r) =>
    r.openTasks
      .filter((t) => t.type === 'maintenance')
      .map((t) => ({ id: t.id, label: `${t.notes ?? 'Repair'} · Room ${r.room.name}` })),
  );
  if (bill?.taskId && bill.repairLabel && !repairs.some((r) => r.id === bill.taskId)) {
    repairs.push({ id: bill.taskId, label: bill.repairLabel });
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!body) return;
    if (!bill) {
      create.mutate(body, {
        onSuccess: () => {
          onClose();
          toast({ title: `Bill from ${body.supplierName} added` });
        },
      });
      return;
    }
    update.mutate(
      { id: bill.id, patch: { ...body, ...(review && { checked: true as const }) } },
      { onSuccess: onClose },
    );
  }

  function markPaid() {
    if (!bill) return;
    pay.mutate(
      { id: bill.id, body: { method, paidOn } },
      {
        onSuccess: () => {
          onClose();
          toast({ title: `Bill from ${bill.supplierName} marked paid` });
        },
      },
    );
  }

  const fields = (
    <form onSubmit={submit} className="flex min-w-0 flex-col gap-4">
      {bill && bill.warnings.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-control bg-warning/10 px-3 py-2 text-sm">
          {bill.warnings.map((w) => (
            <li key={w} className="flex gap-2">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />
              {w}
            </li>
          ))}
        </ul>
      )}
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Supplier" htmlFor="bill-supplier">
          <Input
            id="bill-supplier"
            required
            value={form.supplierName}
            onChange={(e) => set({ supplierName: e.target.value })}
          />
        </FormField>
        <FormField label="Contact" htmlFor="bill-contact">
          <Select
            id="bill-contact"
            value={form.contactId ?? ''}
            onValueChange={(v) => {
              const contact = contacts.find((c) => c.id === v);
              set({
                contactId: v || null,
                ...(contact && !form.supplierName.trim() && { supplierName: contact.name }),
              });
            }}
          >
            <option value="">None</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Number" htmlFor="bill-number">
          <Input
            id="bill-number"
            value={form.number}
            onChange={(e) => set({ number: e.target.value })}
            className="font-mono"
          />
        </FormField>
        <FormField label="Supplier tax ID" htmlFor="bill-tax-id">
          <Input
            id="bill-tax-id"
            value={form.supplierTaxId}
            onChange={(e) => set({ supplierTaxId: e.target.value })}
            className="font-mono"
          />
        </FormField>
        <FormField label="Issued" htmlFor="bill-issued">
          <DatePicker
            id="bill-issued"
            value={form.issuedOn}
            clearable
            onChange={(v) => set({ issuedOn: v })}
          />
        </FormField>
        <FormField label="Due" htmlFor="bill-due">
          <DatePicker
            id="bill-due"
            value={form.dueOn}
            min={form.issuedOn || undefined}
            clearable
            onChange={(v) => set({ dueOn: v })}
          />
        </FormField>
        <FormField label={`Total, ${currencyMark()}`} htmlFor="bill-total">
          <Input
            id="bill-total"
            required
            inputMode="numeric"
            value={form.total}
            onChange={(e) => set({ total: e.target.value })}
            className="tabular-nums"
          />
        </FormField>
        <FormField label={`Of which tax, ${currencyMark()}`} htmlFor="bill-tax">
          <Input
            id="bill-tax"
            inputMode="numeric"
            value={form.tax}
            onChange={(e) => set({ tax: e.target.value })}
            className="tabular-nums"
          />
        </FormField>
        <FormField label="Pay to" htmlFor="bill-account">
          <Input
            id="bill-account"
            value={form.bankAccount}
            onChange={(e) => set({ bankAccount: e.target.value })}
            className="font-mono"
          />
        </FormField>
        <FormField label="Payment reference" htmlFor="bill-reference">
          <Input
            id="bill-reference"
            value={form.paymentReference}
            onChange={(e) => set({ paymentReference: e.target.value })}
            className="font-mono"
          />
        </FormField>
      </div>
      <FormField label="Repair" htmlFor="bill-repair">
        <Select
          id="bill-repair"
          value={form.taskId ?? ''}
          onValueChange={(v) => set({ taskId: v || null })}
        >
          <option value="">None</option>
          {repairs.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </Select>
      </FormField>
      <FormField label="Note" htmlFor="bill-note">
        <Input id="bill-note" value={form.note} onChange={(e) => set({ note: e.target.value })} />
      </FormField>
      {bill && bill.lines.length > 0 && (
        <div className="flex flex-col gap-1">
          <h3 className="text-xs font-medium text-muted-foreground">Lines as read</h3>
          <ul className="flex flex-col text-sm">
            {bill.lines.map((l, i) => (
              <li key={i} className="flex items-baseline justify-between gap-4 py-0.5">
                <span className="min-w-0 truncate">{l.label}</span>
                {l.amount !== null && (
                  <span className="shrink-0 font-mono tabular-nums">{formatMoney(l.amount)}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {bill?.status === 'unpaid' && (
        <div className="flex flex-wrap items-end gap-3 rounded-stage bg-surface-sunken p-3 ring-1 ring-ink/5 ring-inset">
          <Segmented label="Paid by" value={method} options={methods} onChange={setMethod} />
          <DatePicker value={paidOn} max={hotelTodayIso()} onChange={setPaidOn} className="w-40" />
          <Button type="button" variant="outline" disabled={pay.isPending} onClick={markPaid}>
            Mark paid
          </Button>
        </div>
      )}
      {bill?.status === 'paid' && bill.paidOn && (
        <p className="text-sm text-success">
          Paid {formatDate(bill.paidOn)}
          {bill.paidMethod && ` by ${paymentMethodLabels[bill.paidMethod].toLowerCase()}`}
        </p>
      )}
      {error && <ErrorNotice message={error.message} />}
      <DialogFooter className="sm:justify-between">
        {bill ? (
          <Button type="button" variant="ghost" onClick={() => setDeleting(true)}>
            <Trash2 /> Delete
          </Button>
        ) : (
          <span />
        )}
        <span className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!body || save.isPending}>
            {review ? 'Save as checked' : bill ? 'Save' : 'Add bill'}
          </Button>
        </span>
      </DialogFooter>
      {bill && (
        <ConfirmDialog
          open={deleting}
          onOpenChange={setDeleting}
          title={`Delete the bill from ${bill.supplierName}?`}
          description="Its file stays in the mailbox if it came by email."
          confirmLabel="Delete"
          destructive
          busy={remove.isPending}
          onConfirm={() => remove.mutate(bill.id, { onSuccess: onClose })}
        />
      )}
    </form>
  );

  return (
    <>
      <DialogHeader>
        <DialogTitle>{bill ? `Bill from ${bill.supplierName}` : 'New bill'}</DialogTitle>
        {bill && (
          <DialogDescription>
            {formatMoney(bill.total)}
            {bill.number && ` · ${bill.number}`}
          </DialogDescription>
        )}
      </DialogHeader>
      {bill?.file ? (
        <div className="grid gap-5 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <BillFile bill={bill} />
          {fields}
        </div>
      ) : (
        fields
      )}
    </>
  );
}
