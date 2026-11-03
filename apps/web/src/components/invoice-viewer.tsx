import { invoiceKindLabels, type InvoiceView } from '@orbit/shared';
import { AlertTriangle, Ban, BedDouble, Download, Mail } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { DocumentDialog, DocumentFacts } from '@/components/document-dialog';
import { DocumentPages } from '@/components/document-pages';
import { Button } from '@/components/ui/button';
import { DialogTitle } from '@/components/ui/dialog';
import { useInvoiceDialogs } from '@/hooks/use-invoice-dialogs';
import { useInvoiceViewer } from '@/hooks/use-invoice-viewer';
import { invoicePdfUrl, useInvoices } from '@/lib/api';
import { formatDate, formatMoney, formatRange } from '@/lib/format';
import { invoiceState, toneText } from '@/lib/invoices';
import { cn } from '@/lib/utils';

/** The issued document in `?invoice=`, over whatever page is open. */
export function InvoiceViewer() {
  const { invoiceId, close } = useInvoiceViewer();
  return invoiceId ? <OpenInvoice id={invoiceId} onClose={close} /> : null;
}

function OpenInvoice({ id, onClose }: { id: string; onClose: () => void }) {
  const invoice = useInvoices().data?.find((i) => i.id === id) ?? null;
  const { on, dialogs } = useInvoiceDialogs();
  return (
    <>
      <DocumentDialog
        open={invoice !== null}
        onClose={onClose}
        pages={
          invoice && (
            <DocumentPages
              url={invoicePdfUrl(invoice.id)}
              downloadUrl={invoicePdfUrl(invoice.id, true)}
              contentType="application/pdf"
              name={`${invoice.number}.pdf`}
              className="flex-1"
            />
          )
        }
      >
        {invoice && <InvoiceDetails invoice={invoice} on={on} />}
      </DocumentDialog>
      {dialogs}
    </>
  );
}

function InvoiceDetails({
  invoice: i,
  on,
}: {
  invoice: InvoiceView;
  on: { email: (i: InvoiceView) => void; void: (i: InvoiceView) => void };
}) {
  const [, setParams] = useSearchParams();
  const state = invoiceState(i);
  const issued = i.status === 'issued';
  return (
    <>
      <div className="flex flex-col gap-1 pr-8">
        <DialogTitle
          className={cn('font-mono text-base', !issued && 'text-muted-foreground line-through')}
        >
          {i.number}
        </DialogTitle>
        <p className="text-sm text-muted-foreground">
          {invoiceKindLabels[i.kind]} · <span className={toneText[state.tone]}>{state.label}</span>
        </p>
      </div>

      {i.outdated && issued && (
        <p className="flex gap-2 rounded-control bg-warning/10 px-3 py-2 text-sm">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />
          The bill changed since this was issued. Void it and issue a new one to match.
        </p>
      )}
      {i.status === 'void' && (
        <p className="rounded-control bg-ink/4 px-3 py-2 text-sm text-muted-foreground">
          Voided {i.voidedOn && formatDate(i.voidedOn)}
          {i.voidReason && `: ${i.voidReason}`}
        </p>
      )}

      <DocumentFacts
        facts={[
          { label: 'Made out to', value: i.buyer.company ?? i.buyer.name },
          i.buyer.company !== null && { label: 'Guest', value: i.guestName },
          i.buyer.taxId !== null && { label: 'Tax ID', value: i.buyer.taxId, mono: true },
          {
            label: 'Stay',
            value: `${formatRange(i.stay.checkIn, i.stay.checkOut)} · Room ${i.stay.roomName}`,
          },
          { label: 'Issued', value: formatDate(i.issuedOn) },
          i.dueOn !== null && { label: 'Due', value: formatDate(i.dueOn) },
          i.paymentReference !== null && {
            label: 'Reference',
            value: i.paymentReference,
            mono: true,
          },
        ]}
      />

      <DocumentFacts
        className="border-t pt-3"
        facts={[
          { label: 'Total', value: formatMoney(i.total, i.currency), mono: true },
          { label: 'Paid', value: formatMoney(i.paid, i.currency), mono: true },
          i.due > 0 && {
            label: 'To pay',
            value: <span className="text-warning">{formatMoney(i.due, i.currency)}</span>,
            mono: true,
          },
        ]}
      />

      <div className="mt-auto flex flex-wrap gap-2 pt-2">
        <Button variant="outline" size="sm" asChild>
          <a href={invoicePdfUrl(i.id, true)}>
            <Download /> Download
          </a>
        </Button>
        {issued && (
          <Button variant="outline" size="sm" onClick={() => on.email(i)}>
            <Mail /> Email…
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            setParams((p) => {
              p.delete('invoice');
              p.set('booking', i.bookingId);
              return p;
            })
          }
        >
          <BedDouble /> Open booking
        </Button>
        {issued && (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => on.void(i)}
          >
            <Ban /> Void…
          </Button>
        )}
      </div>
    </>
  );
}
