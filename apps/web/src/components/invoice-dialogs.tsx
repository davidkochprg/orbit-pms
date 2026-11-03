import {
  type BillingParty,
  type InvoiceKind,
  invoiceKindLabels,
  type InvoiceView,
} from '@orbit/shared';
import { type FormEvent, useState } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import { useInvoiceViewer } from '@/hooks/use-invoice-viewer';
import { useToast } from '@/hooks/use-toast';
import { useEmailInvoice, useIssueInvoice, useVoidInvoice } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { invoiceEmailBody } from '@/lib/invoices';

/** Who a document is made out to: the guest, or a company with its address and tax ID. */
function BuyerFields({
  buyer,
  onChange,
}: {
  buyer: BillingParty;
  onChange: (buyer: BillingParty) => void;
}) {
  const [company, setCompany] = useState(buyer.company !== null);
  const set = (patch: Partial<BillingParty>) => onChange({ ...buyer, ...patch });
  return (
    <div className="flex flex-col gap-4">
      <Segmented
        label="Made out to"
        value={company ? 'company' : 'guest'}
        options={[
          { value: 'guest', label: 'The guest' },
          { value: 'company', label: 'A company' },
        ]}
        onChange={(v) => {
          setCompany(v === 'company');
          if (v === 'guest') set({ company: null, taxId: null });
          else set({ company: buyer.company ?? '' });
        }}
        className="self-start"
      />
      {company && (
        <div className="grid grid-cols-[minmax(0,1fr)_10rem] gap-3">
          <FormField label="Company" htmlFor="buyer-company">
            <Input
              id="buyer-company"
              required
              value={buyer.company ?? ''}
              onChange={(e) => set({ company: e.target.value })}
            />
          </FormField>
          <FormField label="Tax ID" htmlFor="buyer-tax">
            <Input
              id="buyer-tax"
              value={buyer.taxId ?? ''}
              onChange={(e) => set({ taxId: e.target.value || null })}
              className="font-mono"
            />
          </FormField>
        </div>
      )}
      <FormField label={company ? 'Attention of' : 'Name'} htmlFor="buyer-name">
        <Input
          id="buyer-name"
          required
          value={buyer.name}
          onChange={(e) => set({ name: e.target.value })}
        />
      </FormField>
      <FormField label="Address" htmlFor="buyer-address">
        <Textarea
          id="buyer-address"
          rows={2}
          value={buyer.address ?? ''}
          onChange={(e) => set({ address: e.target.value || null })}
          className="min-h-16"
        />
      </FormField>
      <FormField label="Email" htmlFor="buyer-email">
        <Input
          id="buyer-email"
          type="email"
          value={buyer.email ?? ''}
          onChange={(e) => set({ email: e.target.value || null })}
        />
      </FormField>
    </div>
  );
}

/**
 * Issues an invoice (to pay by bank transfer) or a receipt (for what was paid here) from the bill
 * as it stands, made out to the guest or their company.
 */
export function IssueInvoiceDialog({
  bookingId,
  kind,
  buyer: initial,
  onClose,
}: {
  bookingId: string;
  kind: InvoiceKind | null;
  buyer: BillingParty;
  onClose: () => void;
}) {
  return (
    <Dialog open={kind !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="shadow-floating sm:max-w-md">
        {kind && (
          <IssueForm bookingId={bookingId} kind={kind} initial={initial} onClose={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function IssueForm({
  bookingId,
  kind,
  initial,
  onClose,
}: {
  bookingId: string;
  kind: InvoiceKind;
  initial: BillingParty;
  onClose: () => void;
}) {
  const issue = useIssueInvoice(bookingId);
  const { toast } = useToast();
  const { open: view } = useInvoiceViewer();
  const [buyer, setBuyer] = useState(initial);
  const [note, setNote] = useState('');

  function submit(e: FormEvent) {
    e.preventDefault();
    issue.mutate(
      {
        kind,
        buyer: { ...buyer, company: buyer.company?.trim() || null },
        note: note.trim() || null,
      },
      {
        onSuccess: (invoice) => {
          onClose();
          toast({
            title: `${invoiceKindLabels[kind]} ${invoice.number} issued`,
            action: { label: 'Open', run: () => view(invoice.id) },
          });
        },
      },
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{kind === 'invoice' ? 'Issue an invoice' : 'Issue a receipt'}</DialogTitle>
        <DialogDescription>
          {kind === 'invoice' ? 'To pay by bank transfer.' : 'For what was paid at the property.'}
        </DialogDescription>
      </DialogHeader>
      <BuyerFields buyer={buyer} onChange={setBuyer} />
      <FormField label="Note on the document" htmlFor="invoice-note">
        <Input
          id="invoice-note"
          placeholder="Optional, e.g. a purchase order number"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </FormField>
      {issue.error && <ErrorNotice message={issue.error.message} />}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={!buyer.name.trim() || issue.isPending}>
          Issue {invoiceKindLabels[kind].toLowerCase()}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Voids a document, keeping its number, and can issue a new one from the bill as it stands. */
export function VoidInvoiceDialog({
  invoice,
  onClose,
}: {
  invoice: InvoiceView | null;
  onClose: () => void;
}) {
  const voiding = useVoidInvoice();
  const { toast } = useToast();
  const { open: view } = useInvoiceViewer();
  const [reason, setReason] = useState('');

  function run(reissue: boolean) {
    if (!invoice) return;
    voiding.mutate(
      { id: invoice.id, body: { reason: reason.trim(), reissue, buyer: null } },
      {
        onSuccess: ({ replacement }) => {
          setReason('');
          onClose();
          toast(
            replacement
              ? {
                  title: `${invoice.number} void, ${replacement.number} issued`,
                  action: { label: 'Open', run: () => view(replacement.id) },
                }
              : { title: `${invoice.number} void` },
          );
        },
      },
    );
  }

  return (
    <Dialog open={invoice !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="shadow-floating sm:max-w-md">
        {invoice && (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              run(true);
            }}
          >
            <DialogHeader>
              <DialogTitle>Void {invoice.number}</DialogTitle>
              <DialogDescription>
                It stays in the records marked void. A new one is issued from the bill as it is now,{' '}
                {formatMoney(invoice.total)} when this was issued.
              </DialogDescription>
            </DialogHeader>
            <FormField label="Reason" htmlFor="void-reason">
              <Input
                id="void-reason"
                required
                placeholder="e.g. Made out to the wrong company"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </FormField>
            {voiding.error && <ErrorNotice message={voiding.error.message} />}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!reason.trim() || voiding.isPending}
                onClick={() => run(false)}
              >
                Only void
              </Button>
              <Button type="submit" disabled={!reason.trim() || voiding.isPending}>
                Void and reissue
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Emails a document as a PDF, to the buyer unless another address is given. */
export function EmailInvoiceDialog({
  invoice,
  onClose,
}: {
  invoice: InvoiceView | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={invoice !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="shadow-floating sm:max-w-lg">
        {invoice && <EmailForm invoice={invoice} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function EmailForm({ invoice, onClose }: { invoice: InvoiceView; onClose: () => void }) {
  const send = useEmailInvoice();
  const { toast } = useToast();
  const [to, setTo] = useState(invoice.buyer.email ?? '');
  const [subject, setSubject] = useState(
    `${invoiceKindLabels[invoice.kind]} ${invoice.number} from ${invoice.issuer.name}`,
  );
  const [body, setBody] = useState(invoiceEmailBody(invoice));

  function submit(e: FormEvent) {
    e.preventDefault();
    send.mutate(
      {
        id: invoice.id,
        body: {
          to: to.trim() === invoice.buyer.email ? null : to.trim(),
          subject: subject.trim(),
          body: body.trim(),
        },
      },
      {
        onSuccess: () => {
          onClose();
          toast({ title: `${invoice.number} sent to ${to.trim()}` });
        },
      },
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Email {invoice.number}</DialogTitle>
        <DialogDescription>The PDF is attached.</DialogDescription>
      </DialogHeader>
      <FormField label="To" htmlFor="invoice-to">
        <Input
          id="invoice-to"
          type="email"
          required
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
      </FormField>
      <FormField label="Subject" htmlFor="invoice-subject">
        <Input
          id="invoice-subject"
          required
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />
      </FormField>
      <FormField label="Message" htmlFor="invoice-body">
        <Textarea
          id="invoice-body"
          required
          rows={6}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </FormField>
      {send.error && <ErrorNotice message={send.error.message} />}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={!to.trim() || !body.trim() || send.isPending}>
          Send
        </Button>
      </DialogFooter>
    </form>
  );
}
