import type {
  BillingParty,
  Guest,
  InvoiceView,
  SupplierInvoice,
  SupplierInvoiceBody,
  SupplierInvoiceView,
} from '@orbit/shared';
import { Ban, Download, FileText, Mail } from 'lucide-react';
import type { MenuAction } from '@/components/action-menu';
import { invoicePdfUrl } from '@/lib/api';
import { formatDate } from '@/lib/format';

export type Tone = 'muted' | 'success' | 'warning' | 'destructive';

export const toneText: Record<Tone, string> = {
  muted: 'text-muted-foreground',
  success: 'text-success',
  warning: 'text-warning',
  destructive: 'text-destructive',
};

/** Opens the document's PDF in a new tab. */
export function openInvoicePdf(id: string) {
  window.open(invoicePdfUrl(id), '_blank', 'noopener');
}

/** What can be done with an issued document: open, download, email, void. */
export function invoiceActions(
  invoice: InvoiceView,
  on: { email: (i: InvoiceView) => void; void: (i: InvoiceView) => void },
): MenuAction[] {
  const issued = invoice.status === 'issued';
  return [
    { label: 'Open PDF', icon: FileText, onSelect: () => openInvoicePdf(invoice.id) },
    { label: 'Download', icon: Download, href: invoicePdfUrl(invoice.id, true) },
    ...(issued
      ? [
          { label: 'Email…', icon: Mail, onSelect: () => on.email(invoice), group: true },
          {
            label: 'Void…',
            icon: Ban,
            onSelect: () => on.void(invoice),
            destructive: true,
          },
        ]
      : []),
  ];
}

/** Where an issued document stands, in a word or two, and how loudly to say it. */
export function invoiceState(i: InvoiceView): { label: string; tone: Tone } {
  if (i.status === 'void') return { label: 'Void', tone: 'muted' };
  if (i.settled) return { label: 'Paid', tone: 'success' };
  if (i.overdue) return { label: 'Overdue', tone: 'destructive' };
  if (i.kind === 'invoice' && i.dueOn)
    return { label: `Due ${formatDate(i.dueOn)}`, tone: 'warning' };
  return { label: 'Part paid', tone: 'warning' };
}

/** Where a supplier's bill stands. */
export function billState(b: SupplierInvoiceView): { label: string; tone: Tone } {
  if (b.status === 'paid') return { label: 'Paid', tone: 'success' };
  if (b.status === 'to_review') return { label: 'To check', tone: 'warning' };
  if (b.overdue) return { label: 'Overdue', tone: 'destructive' };
  return { label: b.dueOn ? `Due ${formatDate(b.dueOn)}` : 'To pay', tone: 'muted' };
}

/** The guest as the buyer, before staff add a company. */
export function buyerFromGuest(guest: Pick<Guest, 'name' | 'email'>): BillingParty {
  return { name: guest.name, company: null, address: null, taxId: null, email: guest.email };
}

/** The bill's fields as the review form holds them: amounts and dates as typed. */
export interface BillForm {
  contactId: string | null;
  supplierName: string;
  supplierTaxId: string;
  number: string;
  issuedOn: string;
  dueOn: string;
  total: string;
  tax: string;
  bankAccount: string;
  paymentReference: string;
  taskId: string | null;
  note: string;
}

export const emptyBillForm: BillForm = {
  contactId: null,
  supplierName: '',
  supplierTaxId: '',
  number: '',
  issuedOn: '',
  dueOn: '',
  total: '',
  tax: '',
  bankAccount: '',
  paymentReference: '',
  taskId: null,
  note: '',
};

export function billFormFrom(b: SupplierInvoice): BillForm {
  return {
    contactId: b.contactId,
    supplierName: b.supplierName,
    supplierTaxId: b.supplierTaxId ?? '',
    number: b.number ?? '',
    issuedOn: b.issuedOn ?? '',
    dueOn: b.dueOn ?? '',
    total: String(b.total),
    tax: b.tax === null ? '' : String(b.tax),
    bankAccount: b.bankAccount ?? '',
    paymentReference: b.paymentReference ?? '',
    taskId: b.taskId,
    note: b.note ?? '',
  };
}

/** A whole amount typed in, or null when it isn't one. Thousands separators are allowed. */
export function parseAmount(value: string): number | null {
  const cleaned = value.replace(/[\s,]/g, '');
  if (!/^\d+$/.test(cleaned)) return null;
  return Number(cleaned);
}

/** The form as the API takes it, or null while the supplier or total is missing. */
export function billBody(f: BillForm): SupplierInvoiceBody | null {
  const total = parseAmount(f.total);
  const tax = f.tax.trim() ? parseAmount(f.tax) : null;
  if (!f.supplierName.trim() || total === null || (f.tax.trim() && tax === null)) return null;
  const text = (s: string) => s.trim() || null;
  return {
    contactId: f.contactId,
    supplierName: f.supplierName.trim(),
    supplierTaxId: text(f.supplierTaxId),
    number: text(f.number),
    issuedOn: f.issuedOn || null,
    dueOn: f.dueOn || null,
    total,
    tax,
    bankAccount: text(f.bankAccount),
    paymentReference: text(f.paymentReference),
    taskId: f.taskId,
    note: text(f.note),
  };
}

/** The link a phone opens to photograph a bill. */
export function billScanUrl(origin: string, scanId: string): string {
  return `${origin}/bill-scan/${encodeURIComponent(scanId)}`;
}

/** The email that goes with a document, for staff to edit before sending. */
export function invoiceEmailBody(i: Pick<InvoiceView, 'kind' | 'number' | 'buyer' | 'issuer'>) {
  const what = i.kind === 'invoice' ? 'invoice' : 'receipt';
  return `Hello ${i.buyer.name},\n\nplease find your ${what} ${i.number} attached.\n\nBest regards,\n${i.issuer.name}`;
}
