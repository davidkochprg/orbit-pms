import type { PaymentMethod, SupplierInvoiceView } from '@orbit/shared';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { type FormEvent, type ReactNode, useState } from 'react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DocumentDialog, DocumentFacts } from '@/components/document-dialog';
import { DocumentPages } from '@/components/document-pages';
import { ErrorNotice } from '@/components/error-notice';
import { FormField } from '@/components/form-field';
import { Segmented } from '@/components/segmented';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { DialogTitle } from '@/components/ui/dialog';
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
import {
  type BillForm,
  billBody,
  billFormFrom,
  billState,
  emptyBillForm,
  toneText,
} from '@/lib/invoices';
import { cn } from '@/lib/utils';

const methods: { value: PaymentMethod; label: string }[] = [
  { value: 'bank_transfer', label: paymentMethodLabels.bank_transfer },
  { value: 'card', label: paymentMethodLabels.card },
  { value: 'cash', label: paymentMethodLabels.cash },
];

/**
 * A supplier's bill beside the file it was read from. One Orbit read is checked against the file
 * and saved; after that it is the supplier's document, so what they printed stays as it is and
 * only the hotel's links (contact, repair, note) change. Without `bill`, a new one is typed in.
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
  return (
    <DocumentDialog
      open={open}
      onClose={onClose}
      pages={
        bill?.file ? (
          <DocumentPages
            url={billFileUrl(bill.id)}
            contentType={bill.file.contentType}
            name={bill.file.name}
            className="flex-1"
          />
        ) : null
      }
    >
      {open &&
        (bill && bill.status !== 'to_review' ? (
          <BillDetails key={bill.id} bill={bill} onClose={onClose} />
        ) : (
          <BillEditor key={bill?.id ?? 'new'} bill={bill} onClose={onClose} />
        ))}
    </DocumentDialog>
  );
}

function Heading({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 pr-8">
      <DialogTitle>{title}</DialogTitle>
      {children && <p className="text-sm text-muted-foreground">{children}</p>}
    </div>
  );
}

/** The repairs a bill can be for: open ones on the board, and the one it is for even once done. */
function useRepairs(bill: SupplierInvoiceView | null) {
  const board = useHousekeeping().data;
  const repairs = (board?.rooms ?? []).flatMap((r) =>
    r.openTasks
      .filter((t) => t.type === 'maintenance')
      .map((t) => ({ id: t.id, label: `${t.notes ?? 'Repair'} · Room ${r.room.name}` })),
  );
  if (bill?.taskId && bill.repairLabel && !repairs.some((r) => r.id === bill.taskId)) {
    repairs.push({ id: bill.taskId, label: bill.repairLabel });
  }
  return repairs;
}

function ContactSelect({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (id: string | null, name: string | null) => void;
}) {
  const contacts = useContacts().data ?? [];
  return (
    <Select
      id="bill-contact"
      value={value ?? ''}
      onValueChange={(v) => onChange(v || null, contacts.find((c) => c.id === v)?.name ?? null)}
    >
      <option value="">None</option>
      {contacts.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </Select>
  );
}

function RepairSelect({
  repairs,
  value,
  onChange,
}: {
  repairs: { id: string; label: string }[];
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  return (
    <Select id="bill-repair" value={value ?? ''} onValueChange={(v) => onChange(v || null)}>
      <option value="">None</option>
      {repairs.map((r) => (
        <option key={r.id} value={r.id}>
          {r.label}
        </option>
      ))}
    </Select>
  );
}

function Lines({ bill }: { bill: SupplierInvoiceView }) {
  if (bill.lines.length === 0) return null;
  return (
    <ul className="flex flex-col border-t pt-3 text-sm">
      {bill.lines.map((l, i) => (
        <li key={i} className="flex items-baseline justify-between gap-4 py-0.5">
          <span className="min-w-0">{l.label}</span>
          {l.amount !== null && (
            <span className="shrink-0 font-mono text-[0.8125rem] tabular-nums">
              {formatMoney(l.amount, bill.currency)}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

function Warnings({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1 rounded-control bg-warning/10 px-3 py-2 text-sm">
      {warnings.map((w) => (
        <li key={w} className="flex gap-2">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />
          {w}
        </li>
      ))}
    </ul>
  );
}

function DeleteButton({ bill, onClose }: { bill: SupplierInvoiceView; onClose: () => void }) {
  const remove = useRemoveBill();
  const [deleting, setDeleting] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-destructive hover:text-destructive"
        onClick={() => setDeleting(true)}
      >
        <Trash2 /> Delete
      </Button>
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete the bill from ${bill.supplierName}?`}
        description={remove.error?.message ?? 'Its file stays in the mailbox if it came by email.'}
        confirmLabel="Delete"
        destructive
        busy={remove.isPending}
        onConfirm={() => remove.mutate(bill.id, { onSuccess: onClose })}
      />
    </>
  );
}

/** A checked bill: what the supplier printed, how it was paid, and the hotel's own links. */
function BillDetails({ bill, onClose }: { bill: SupplierInvoiceView; onClose: () => void }) {
  const update = useUpdateBill();
  const pay = usePayBill();
  const repairs = useRepairs(bill);
  const { toast } = useToast();
  const [links, setLinks] = useState({
    contactId: bill.contactId,
    taskId: bill.taskId,
    note: bill.note ?? '',
  });
  const [method, setMethod] = useState<PaymentMethod>('bank_transfer');
  const [paidOn, setPaidOn] = useState(hotelTodayIso());
  const state = billState(bill);
  const changed =
    links.contactId !== bill.contactId ||
    links.taskId !== bill.taskId ||
    (links.note.trim() || null) !== bill.note;
  const error = update.error ?? pay.error;

  function saveLinks(e: FormEvent) {
    e.preventDefault();
    update.mutate(
      {
        id: bill.id,
        patch: {
          contactId: links.contactId,
          taskId: links.taskId,
          note: links.note.trim() || null,
        },
      },
      { onSuccess: () => toast({ title: 'Bill saved' }) },
    );
  }

  return (
    <>
      <Heading title={bill.supplierName}>
        {bill.number && <span className="font-mono text-[0.8125rem]">{bill.number}</span>}
        {bill.number && ' · '}
        <span className={toneText[state.tone]}>{state.label}</span>
      </Heading>

      <DocumentFacts
        facts={[
          bill.supplierTaxId !== null && { label: 'Tax ID', value: bill.supplierTaxId, mono: true },
          bill.issuedOn !== null && { label: 'Issued', value: formatDate(bill.issuedOn) },
          bill.dueOn !== null && {
            label: 'Due',
            value: (
              <span className={cn(bill.overdue && 'text-destructive')}>
                {formatDate(bill.dueOn)}
              </span>
            ),
          },
          bill.bankAccount !== null && { label: 'Pay to', value: bill.bankAccount, mono: true },
          bill.paymentReference !== null && {
            label: 'Reference',
            value: bill.paymentReference,
            mono: true,
          },
        ]}
      />

      <Lines bill={bill} />
      <DocumentFacts
        className="border-t pt-3"
        facts={[
          bill.tax !== null && {
            label: 'Of which tax',
            value: formatMoney(bill.tax, bill.currency),
            mono: true,
          },
          {
            label: 'Total',
            value: <span className="font-medium">{formatMoney(bill.total, bill.currency)}</span>,
            mono: true,
          },
        ]}
      />

      {bill.status === 'unpaid' ? (
        <div className="flex flex-col gap-2 rounded-stage bg-surface-sunken p-3 ring-1 ring-ink/5 ring-inset">
          <Segmented label="Paid by" value={method} options={methods} onChange={setMethod} />
          <div className="flex gap-2">
            <DatePicker
              value={paidOn}
              max={hotelTodayIso()}
              onChange={setPaidOn}
              className="min-w-0 flex-1"
            />
            <Button
              type="button"
              disabled={pay.isPending}
              onClick={() =>
                pay.mutate(
                  { id: bill.id, body: { method, paidOn } },
                  {
                    onSuccess: () => {
                      onClose();
                      toast({ title: `Bill from ${bill.supplierName} marked paid` });
                    },
                  },
                )
              }
            >
              Mark paid
            </Button>
          </div>
        </div>
      ) : (
        bill.paidOn && (
          <p className="text-sm text-success">
            Paid {formatDate(bill.paidOn)}
            {bill.paidMethod && ` by ${paymentMethodLabels[bill.paidMethod].toLowerCase()}`}
          </p>
        )
      )}

      <form onSubmit={saveLinks} className="flex flex-col gap-3 border-t pt-4">
        <FormField label="Contact" htmlFor="bill-contact">
          <ContactSelect
            value={links.contactId}
            onChange={(contactId) => setLinks((l) => ({ ...l, contactId }))}
          />
        </FormField>
        <FormField label="Repair" htmlFor="bill-repair">
          <RepairSelect
            repairs={repairs}
            value={links.taskId}
            onChange={(taskId) => setLinks((l) => ({ ...l, taskId }))}
          />
        </FormField>
        <FormField label="Note" htmlFor="bill-note">
          <Input
            id="bill-note"
            value={links.note}
            onChange={(e) => setLinks((l) => ({ ...l, note: e.target.value }))}
          />
        </FormField>
        {error && <ErrorNotice message={error.message} />}
        <div className="flex items-center justify-between gap-2">
          <DeleteButton bill={bill} onClose={onClose} />
          {changed && (
            <Button type="submit" variant="outline" size="sm" disabled={update.isPending}>
              Save
            </Button>
          )}
        </div>
      </form>
    </>
  );
}

/** A bill Orbit read, to check against its file, or a new one typed in from paper. */
function BillEditor({ bill, onClose }: { bill: SupplierInvoiceView | null; onClose: () => void }) {
  const create = useCreateBill();
  const update = useUpdateBill();
  const repairs = useRepairs(bill);
  const { toast } = useToast();
  const [form, setForm] = useState<BillForm>(bill ? billFormFrom(bill) : emptyBillForm);
  const set = (patch: Partial<BillForm>) => setForm((f) => ({ ...f, ...patch }));
  const body = billBody(form);
  const save = bill ? update : create;

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
      { id: bill.id, patch: { ...body, checked: true } },
      {
        onSuccess: () => {
          onClose();
          toast({ title: `Bill from ${body.supplierName} checked` });
        },
      },
    );
  }

  return (
    <form onSubmit={submit} className="flex min-w-0 flex-col gap-4">
      <Heading title={bill ? `Check the bill from ${bill.supplierName}` : 'New bill'} />
      {bill && <Warnings warnings={bill.warnings} />}
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Supplier" htmlFor="bill-supplier" className="col-span-2">
          <Input
            id="bill-supplier"
            required
            value={form.supplierName}
            onChange={(e) => set({ supplierName: e.target.value })}
          />
        </FormField>
        <FormField label="Contact" htmlFor="bill-contact" className="col-span-2">
          <ContactSelect
            value={form.contactId}
            onChange={(contactId, name) =>
              set({ contactId, ...(name && !form.supplierName.trim() && { supplierName: name }) })
            }
          />
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
        <FormField label="Pay to" htmlFor="bill-account" className="col-span-2">
          <Input
            id="bill-account"
            value={form.bankAccount}
            onChange={(e) => set({ bankAccount: e.target.value })}
            className="font-mono"
          />
        </FormField>
        <FormField label="Payment reference" htmlFor="bill-reference" className="col-span-2">
          <Input
            id="bill-reference"
            value={form.paymentReference}
            onChange={(e) => set({ paymentReference: e.target.value })}
            className="font-mono"
          />
        </FormField>
        <FormField label="Repair" htmlFor="bill-repair" className="col-span-2">
          <RepairSelect
            repairs={repairs}
            value={form.taskId}
            onChange={(taskId) => set({ taskId })}
          />
        </FormField>
        <FormField label="Note" htmlFor="bill-note" className="col-span-2">
          <Input id="bill-note" value={form.note} onChange={(e) => set({ note: e.target.value })} />
        </FormField>
      </div>
      {bill && <Lines bill={bill} />}
      {save.error && <ErrorNotice message={save.error.message} />}
      <div className="mt-auto flex items-center justify-between gap-2 pt-2">
        {bill ? <DeleteButton bill={bill} onClose={onClose} /> : <span />}
        <span className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!body || save.isPending}>
            {bill ? 'Save as checked' : 'Add bill'}
          </Button>
        </span>
      </div>
    </form>
  );
}
