import type {
  Booking,
  Folio,
  FolioLine,
  PaymentKind,
  PaymentMethod,
  PricingConfig,
  VatBracket,
} from '@orbit/shared';
import { Plus, Trash2 } from 'lucide-react';
import { type FormEvent, type ReactNode, useState } from 'react';
import { ErrorNotice } from '@/components/error-notice';
import { FormField } from '@/components/form-field';
import { Segmented } from '@/components/segmented';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useAddCharge,
  useFolio,
  usePricing,
  useRecordPayment,
  useRemoveCharge,
  useUpdateCharge,
} from '@/lib/api';
import { balanceLabel, canCharge, vatBracketLabels, vatRateLabel } from '@/lib/billing';
import { formatCzk, formatDate, paymentMethodLabels } from '@/lib/format';
import { INLINE_EDITOR } from '@/lib/inline-edit';
import { cn } from '@/lib/utils';

const methods: { value: PaymentMethod; label: string }[] = [
  { value: 'card', label: paymentMethodLabels.card },
  { value: 'cash', label: paymentMethodLabels.cash },
  { value: 'bank_transfer', label: paymentMethodLabels.bank_transfer },
];

const brackets: VatBracket[] = ['standard', 'reduced', 'none'];

type VatRates = PricingConfig['vat'] | undefined;

/** "Standard (21%)" for the VAT select, with the current rates once loaded. */
function bracketOptions(rates: VatRates) {
  return brackets.map((b) => ({
    value: b,
    label: b === 'none' || !rates ? vatBracketLabels[b] : `${vatBracketLabels[b]} (${rates[b]}%)`,
  }));
}

/**
 * The booking's bill: totals, the stay, city tax and extras with their VAT, payments, and the VAT
 * recap per bracket. Extras are added and corrected in place.
 */
export function BookingBill({ booking }: { booking: Booking }) {
  const folio = useFolio(booking.id);
  const rates = usePricing().data?.vat;
  const [paying, setPaying] = useState(false);

  if (folio.isError) return <ErrorNotice message={folio.error.message} />;
  if (!folio.data) return <Skeleton className="h-64" />;
  const bill = folio.data;
  const chargeable = canCharge(booking);
  const stay = bill.lines.filter((l) => l.kind === 'stay');
  const tax = bill.lines.filter((l) => l.kind === 'city_tax');
  const extras = bill.lines.filter((l) => l.kind === 'extra');

  return (
    <div className="flex flex-col gap-4">
      <Totals folio={bill} />

      <div className="flex flex-col overflow-hidden rounded-stage bg-background shadow-[0_1px_2px_var(--shadow-soft)] stroke-lit">
        <TableHead />
        {stay.length > 0 && (
          <Group title="Stay">
            {stay.map((l, i) => (
              <LineRow key={i} line={l} />
            ))}
          </Group>
        )}
        {tax.length > 0 && (
          <Group title="City tax">
            {tax.map((l, i) => (
              <LineRow key={i} line={l} />
            ))}
          </Group>
        )}
        <Group title="Extras">
          {extras.map((l) => (
            <ExtraRow
              key={l.chargeId}
              bookingId={booking.id}
              line={l}
              rates={rates}
              editable={chargeable}
            />
          ))}
          {extras.length === 0 && !chargeable && (
            <p className="px-3 py-2 text-muted-foreground">No extras.</p>
          )}
          {chargeable && <NewExtraRow bookingId={booking.id} rates={rates} />}
        </Group>
        <div className="flex items-baseline justify-between gap-4 border-t px-3 py-2.5 font-medium">
          <span>Total</span>
          <span className="font-mono tabular-nums">{formatCzk(bill.charged)}</span>
        </div>
      </div>

      <Payments
        folio={bill}
        canPay={booking.status !== 'cancelled'}
        onPay={() => setPaying(true)}
      />

      {bill.vat.length > 0 && <VatRecap folio={bill} />}

      <Dialog open={paying} onOpenChange={setPaying}>
        <DialogContent className="shadow-floating sm:max-w-sm">
          {paying && (
            <PaymentForm
              bookingId={booking.id}
              balance={bill.balance}
              onDone={() => setPaying(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Totals({ folio }: { folio: Folio }) {
  const owed = folio.balance > 0;
  const cells: { label: string; value: number; tone?: string }[] = [
    { label: 'Charged', value: folio.charged },
    { label: 'Paid', value: folio.paid },
    {
      label: balanceLabel(folio.balance),
      value: Math.abs(folio.balance),
      tone: owed ? 'text-warning' : folio.balance < 0 ? 'text-primary-text' : 'text-success',
    },
  ];
  return (
    <dl className="grid grid-cols-3 gap-1 rounded-card bg-surface-sunken p-1 ring-1 ring-ink/5 ring-inset">
      {cells.map((c) => (
        <div
          key={c.label}
          className="flex flex-col gap-0.5 rounded-stage px-3 py-2 last:bg-background last:stroke-lit last:shadow-[0_1px_2px_var(--shadow-soft)]"
        >
          <dt className="text-xs text-muted-foreground">{c.label}</dt>
          <dd className={cn('font-mono text-base tabular-nums', c.tone)}>{formatCzk(c.value)}</dd>
        </div>
      ))}
    </dl>
  );
}

const lineGrid = 'grid grid-cols-[1fr_4.5rem_6.5rem] items-center gap-3 px-3';

function TableHead() {
  return (
    <div
      className={cn(
        lineGrid,
        'border-b py-1.5 text-[0.6875rem] tracking-wide text-subtle-foreground uppercase',
      )}
    >
      <span>Item</span>
      <span className="text-right">VAT</span>
      <span className="text-right">Amount</span>
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col border-b last:border-b-0">
      <h3 className="px-3 pt-2.5 pb-1 text-xs font-medium text-muted-foreground">{title}</h3>
      {children}
    </div>
  );
}

function lineLabel(line: FolioLine) {
  return line.kind === 'extra' && line.quantity > 1
    ? `${line.label}, ${line.quantity} × ${formatCzk(line.unitPrice)}`
    : line.label;
}

function VatChip({ line }: { line: Pick<FolioLine, 'vatBracket' | 'vatRate'> }) {
  return (
    <span className="justify-self-end rounded-full bg-ink/5 px-1.5 font-mono text-[0.6875rem] leading-5 text-muted-foreground">
      {vatRateLabel(line.vatBracket, line.vatRate)}
    </span>
  );
}

function LineRow({ line }: { line: FolioLine }) {
  return (
    <div className={cn(lineGrid, 'py-1.5')}>
      <span className="min-w-0 text-muted-foreground">{lineLabel(line)}</span>
      <VatChip line={line} />
      <span className="text-right font-mono tabular-nums">{formatCzk(line.amount)}</span>
    </div>
  );
}

function ExtraRow({
  bookingId,
  line,
  rates,
  editable,
}: {
  bookingId: string;
  line: FolioLine;
  rates: VatRates;
  editable: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const update = useUpdateCharge(bookingId);
  const remove = useRemoveCharge(bookingId);

  if (editing && line.chargeId) {
    const chargeId = line.chargeId;
    return (
      <ExtraEditor
        rates={rates}
        initial={line}
        submitLabel="Save"
        pending={update.isPending}
        error={update.error?.message ?? remove.error?.message}
        onCancel={() => setEditing(false)}
        onSubmit={(patch) =>
          update.mutate({ chargeId, patch }, { onSuccess: () => setEditing(false) })
        }
        onRemove={() => remove.mutate(chargeId)}
      />
    );
  }
  return (
    <button
      type="button"
      disabled={!editable}
      onClick={() => setEditing(true)}
      aria-label={`Edit ${line.label}`}
      className={cn(
        lineGrid,
        'py-1.5 text-left outline-none transition-colors hover:bg-accent focus-visible:bg-accent disabled:hover:bg-transparent',
      )}
    >
      <span className="min-w-0">{lineLabel(line)}</span>
      <VatChip line={line} />
      <span className="text-right font-mono tabular-nums">{formatCzk(line.amount)}</span>
    </button>
  );
}

function NewExtraRow({ bookingId, rates }: { bookingId: string; rates: VatRates }) {
  const [adding, setAdding] = useState(false);
  const add = useAddCharge(bookingId);
  if (!adding) {
    return (
      <button
        type="button"
        onClick={() => setAdding(true)}
        className="flex items-center gap-1.5 px-3 py-2 text-left text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:bg-accent"
      >
        <Plus className="size-3.5" /> Add an extra
      </button>
    );
  }
  return (
    <ExtraEditor
      rates={rates}
      submitLabel="Add"
      pending={add.isPending}
      error={add.error?.message}
      onCancel={() => setAdding(false)}
      onSubmit={(body) => add.mutate(body, { onSuccess: () => setAdding(false) })}
    />
  );
}

interface ExtraValues {
  label: string;
  quantity: number;
  unitPrice: number;
  vatBracket: VatBracket;
}

/** An extra being added or corrected, in place of its row. Negative prices are discounts. */
function ExtraEditor({
  rates,
  initial,
  submitLabel,
  pending,
  error,
  onCancel,
  onSubmit,
  onRemove,
}: {
  rates: VatRates;
  initial?: FolioLine;
  submitLabel: string;
  pending: boolean;
  error?: string | undefined;
  onCancel: () => void;
  onSubmit: (values: ExtraValues) => void;
  onRemove?: () => void;
}) {
  const [label, setLabel] = useState(initial?.label ?? '');
  const [quantity, setQuantity] = useState(String(initial?.quantity ?? 1));
  const [unitPrice, setUnitPrice] = useState(initial ? String(initial.unitPrice) : '');
  const [vatBracket, setVatBracket] = useState<VatBracket>(initial?.vatBracket ?? 'standard');
  const qty = Number(quantity);
  const price = Number(unitPrice);
  const valid =
    label.trim() !== '' &&
    Number.isInteger(qty) &&
    qty >= 1 &&
    qty <= 99 &&
    Number.isInteger(price) &&
    price !== 0;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (valid) onSubmit({ label: label.trim(), quantity: qty, unitPrice: price, vatBracket });
  }

  return (
    <form
      {...{ [INLINE_EDITOR]: '' }}
      onSubmit={submit}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onCancel();
        }
      }}
      className="flex flex-col gap-2 bg-surface-sunken px-3 py-2.5"
    >
      <div className="grid grid-cols-[1fr_4rem_6rem] gap-2">
        <Input
          autoFocus
          aria-label="What"
          placeholder="e.g. Sauna"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="h-8"
        />
        <Input
          aria-label="Quantity"
          type="number"
          inputMode="numeric"
          min={1}
          max={99}
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          className="h-8 text-right tabular-nums"
        />
        <Input
          aria-label="Price each, CZK"
          type="number"
          inputMode="numeric"
          step={1}
          placeholder="CZK each"
          value={unitPrice}
          onChange={(e) => setUnitPrice(e.target.value)}
          className="h-8 text-right tabular-nums"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <NativeSelect
          aria-label="VAT bracket"
          value={vatBracket}
          onChange={(e) => setVatBracket(e.target.value as VatBracket)}
          className="h-8 w-44"
        >
          {bracketOptions(rates).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </NativeSelect>
        <span className="text-xs text-muted-foreground tabular-nums">
          {valid && `= ${formatCzk(qty * price)}`}
        </span>
        <div className="ml-auto flex items-center gap-1">
          {onRemove && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Remove"
              onClick={onRemove}
              className="hover:text-destructive"
            >
              <Trash2 />
            </Button>
          )}
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={!valid || pending}>
            {submitLabel}
          </Button>
        </div>
      </div>
      {error && <ErrorNotice message={error} />}
    </form>
  );
}

function Payments({ folio, canPay, onPay }: { folio: Folio; canPay: boolean; onPay: () => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex h-7 items-center justify-between">
        <h3 className="text-xs font-medium text-muted-foreground">Payments</h3>
        {canPay && (
          <Button variant={folio.balance > 0 ? 'outline' : 'ghost'} size="xs" onClick={onPay}>
            <Plus /> {folio.balance < 0 ? 'Refund' : 'Take payment'}
          </Button>
        )}
      </div>
      {folio.payments.length === 0 ? (
        <p className="text-muted-foreground">Nothing paid yet.</p>
      ) : (
        <ul className="flex flex-col">
          {folio.payments.map((p) => (
            <li key={p.id} className="flex items-baseline justify-between gap-4 py-1">
              <span className="min-w-0 truncate">
                {p.kind === 'refund' ? 'Refund' : (p.note ?? 'Payment')}
                <span className="text-muted-foreground">
                  {' '}
                  · {paymentMethodLabels[p.method]} · {formatDate(p.paidOn)}
                </span>
              </span>
              <span className="shrink-0 font-mono tabular-nums">
                {formatCzk(p.kind === 'refund' ? p.amount : -p.amount)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function VatRecap({ folio }: { folio: Folio }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="text-xs font-medium text-muted-foreground">VAT recap · prices include VAT</h3>
      <table className="w-full text-sm">
        <thead className="text-[0.6875rem] tracking-wide text-subtle-foreground uppercase">
          <tr>
            <th className="py-1 text-left font-normal">Rate</th>
            <th className="py-1 text-right font-normal">Net</th>
            <th className="py-1 text-right font-normal">VAT</th>
            <th className="py-1 text-right font-normal">Total</th>
          </tr>
        </thead>
        <tbody className="font-mono tabular-nums">
          {folio.vat.map((v) => (
            <tr key={v.bracket} className="border-t">
              <td className="py-1 font-sans">
                {vatRateLabel(v.bracket, v.rate)}
                {v.bracket !== 'none' && (
                  <span className="text-muted-foreground">
                    {' '}
                    {vatBracketLabels[v.bracket].toLowerCase()}
                  </span>
                )}
              </td>
              <td className="py-1 text-right">{formatCzk(v.net)}</td>
              <td className="py-1 text-right">{formatCzk(v.vat)}</td>
              <td className="py-1 text-right">{formatCzk(v.gross)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Takes a payment, prefilled with what is due, or pays money back when the guest is owed. */
export function PaymentForm({
  bookingId,
  balance,
  onDone,
}: {
  bookingId: string;
  balance: number;
  onDone: () => void;
}) {
  const record = useRecordPayment(bookingId);
  const [kind, setKind] = useState<PaymentKind>(balance < 0 ? 'refund' : 'payment');
  const [method, setMethod] = useState<PaymentMethod>('card');
  const [amount, setAmount] = useState(balance === 0 ? '' : String(Math.abs(balance)));
  const [note, setNote] = useState('');
  const value = Number(amount);
  const valid = Number.isInteger(value) && value > 0;

  function submit(e: FormEvent) {
    e.preventDefault();
    record.mutate(
      { kind, method, amount: value, note: note.trim() || null },
      { onSuccess: onDone },
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{kind === 'refund' ? 'Refund' : 'Take a payment'}</DialogTitle>
        <DialogDescription>
          {balance > 0
            ? `${formatCzk(balance)} is due.`
            : balance < 0
              ? `${formatCzk(-balance)} is owed to the guest.`
              : 'The bill is paid in full.'}
        </DialogDescription>
      </DialogHeader>
      <Segmented
        label="Payment or refund"
        value={kind}
        options={[
          { value: 'payment', label: 'Payment' },
          { value: 'refund', label: 'Refund' },
        ]}
        onChange={setKind}
      />
      <Segmented label="Method" value={method} options={methods} onChange={setMethod} />
      <FormField label="Amount, CZK" htmlFor="payment-amount">
        <Input
          id="payment-amount"
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="tabular-nums"
        />
      </FormField>
      <FormField label="Note" htmlFor="payment-note">
        <Input
          id="payment-note"
          placeholder="Optional, e.g. Deposit"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </FormField>
      {record.error && <ErrorNotice message={record.error.message} />}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={!valid || record.isPending}>
          {kind === 'refund' ? 'Refund' : 'Record payment'}
        </Button>
      </DialogFooter>
    </form>
  );
}
