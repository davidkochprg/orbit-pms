import type { Booking, Folio, PaymentKind, PaymentMethod } from '@orbit/shared';
import { Plus, X } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { ErrorNotice } from '@/components/error-notice';
import { FormField } from '@/components/form-field';
import { Section } from '@/components/section';
import { Segmented } from '@/components/segmented';
import { Stepper } from '@/components/stepper';
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
import { Skeleton } from '@/components/ui/skeleton';
import { useAddCharge, useFolio, useRecordPayment, useRemoveCharge } from '@/lib/api';
import { balanceLabel, canCharge } from '@/lib/billing';
import { formatCzk, formatDate, paymentMethodLabels } from '@/lib/format';
import { cn } from '@/lib/utils';

const methods: { value: PaymentMethod; label: string }[] = [
  { value: 'card', label: paymentMethodLabels.card },
  { value: 'cash', label: paymentMethodLabels.cash },
  { value: 'bank_transfer', label: paymentMethodLabels.bank_transfer },
];

/** The booking's bill: stay, city tax and extras, payments, and what is still owed. */
export function BookingBill({ booking }: { booking: Booking }) {
  const folio = useFolio(booking.id);
  const remove = useRemoveCharge(booking.id);
  const [dialog, setDialog] = useState<'charge' | 'payment' | null>(null);
  const chargeable = canCharge(booking);

  return (
    <Section
      title="Bill"
      actions={
        <>
          {chargeable && (
            <Button variant="ghost" size="xs" onClick={() => setDialog('charge')}>
              <Plus /> Charge
            </Button>
          )}
          {booking.status !== 'cancelled' && (
            <Button variant="ghost" size="xs" onClick={() => setDialog('payment')}>
              <Plus /> Payment
            </Button>
          )}
        </>
      }
    >
      {folio.isError ? (
        <ErrorNotice message={folio.error.message} />
      ) : !folio.data ? (
        <Skeleton className="h-32" />
      ) : (
        <FolioTable
          folio={folio.data}
          onRemove={chargeable && !remove.isPending ? (id) => remove.mutate(id) : undefined}
        />
      )}
      {remove.error && (
        <ErrorNotice message={remove.error.message} onDismiss={() => remove.reset()} />
      )}
      <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="shadow-floating sm:max-w-sm">
          {dialog === 'charge' && (
            <ChargeForm bookingId={booking.id} onDone={() => setDialog(null)} />
          )}
          {dialog === 'payment' && folio.data && (
            <PaymentForm
              bookingId={booking.id}
              balance={folio.data.balance}
              onDone={() => setDialog(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </Section>
  );
}

function FolioTable({ folio, onRemove }: { folio: Folio; onRemove?: (id: string) => void }) {
  const owed = folio.balance > 0;
  return (
    <div className="flex flex-col overflow-hidden rounded-control bg-surface-sunken ring-1 ring-ink/6 ring-inset">
      {folio.lines.length === 0 && (
        <p className="border-b px-3 py-2 text-muted-foreground">Nothing charged.</p>
      )}
      {folio.lines.map((line, i) => (
        <div key={line.chargeId ?? i} className="group flex items-center gap-2 border-b px-3 py-2">
          <span className="min-w-0 flex-1 text-muted-foreground">
            {line.kind === 'extra' && line.quantity > 1
              ? `${line.label}, ${line.quantity} × ${formatCzk(line.unitPrice)}`
              : line.label}
          </span>
          <span className="shrink-0 tabular-nums">{formatCzk(line.amount)}</span>
          {line.chargeId && onRemove && (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`Remove ${line.label}`}
              onClick={() => onRemove(line.chargeId!)}
              className="-mr-1.5 text-muted-foreground opacity-60 group-hover:opacity-100 hover:text-destructive"
            >
              <X />
            </Button>
          )}
        </div>
      ))}
      <div className="flex justify-between gap-4 border-b px-3 py-2 font-medium">
        <span>Total</span>
        <span className="tabular-nums">{formatCzk(folio.charged)}</span>
      </div>
      {folio.payments.map((p) => (
        <div key={p.id} className="flex justify-between gap-4 border-b px-3 py-2">
          <span className="min-w-0 truncate text-muted-foreground">
            {p.kind === 'refund' ? 'Refund' : (p.note ?? 'Payment')},{' '}
            {paymentMethodLabels[p.method].toLowerCase()}, {formatDate(p.paidOn)}
          </span>
          <span className="shrink-0 tabular-nums">
            {formatCzk(p.kind === 'refund' ? p.amount : -p.amount)}
          </span>
        </div>
      ))}
      <div
        className={cn(
          'flex justify-between gap-4 rounded-b-lg px-3 py-2 font-medium',
          owed ? 'bg-warning/10' : 'bg-success/10',
        )}
      >
        <span>{balanceLabel(folio.balance)}</span>
        <span className="tabular-nums">{formatCzk(Math.abs(folio.balance))}</span>
      </div>
    </div>
  );
}

function ChargeForm({ bookingId, onDone }: { bookingId: string; onDone: () => void }) {
  const add = useAddCharge(bookingId);
  const [label, setLabel] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [unitPrice, setUnitPrice] = useState('');
  const price = Number(unitPrice);
  const valid = label.trim() !== '' && Number.isInteger(price) && price !== 0;

  function submit(e: FormEvent) {
    e.preventDefault();
    add.mutate({ label, quantity, unitPrice: price }, { onSuccess: onDone });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Add a charge</DialogTitle>
        <DialogDescription>Posted to the bill today. Negative for a discount.</DialogDescription>
      </DialogHeader>
      <FormField label="What" htmlFor="charge-label">
        <Input
          id="charge-label"
          required
          placeholder="e.g. Sauna"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
      </FormField>
      <div className="flex items-end gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Quantity</span>
          <Stepper label="Quantity" min={1} max={99} value={quantity} onChange={setQuantity} />
        </div>
        <FormField label="Price each, CZK" htmlFor="charge-price" className="flex-1">
          <Input
            id="charge-price"
            type="number"
            inputMode="numeric"
            step={1}
            required
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
            className="tabular-nums"
          />
        </FormField>
      </div>
      {valid && quantity > 1 && (
        <p className="text-sm text-muted-foreground">Total {formatCzk(quantity * price)}</p>
      )}
      {add.error && <ErrorNotice message={add.error.message} />}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={!valid || add.isPending}>
          Add charge
        </Button>
      </DialogFooter>
    </form>
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
