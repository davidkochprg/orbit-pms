import { addDays, buildFolio, buildInvoice, invoiceNumber, issuerFrom } from '@orbit/domain';
import type {
  Booking,
  Charge,
  Contact,
  Guest,
  HotelProfile,
  HousekeepingTask,
  Inquiry,
  Invoice,
  IsoDate,
  Payment,
  PricingConfig,
  Room,
  SupplierInvoice,
} from '@orbit/shared';
import { thread } from './conversations';
import { type BillPdf, billPdf } from './bill-pdf';
import type { SeedFile } from './mail';
import type { SeedRegion } from './regions';

export interface SeedInvoices {
  invoices: Invoice[];
  supplierInvoices: SupplierInvoice[];
  /** The supplier's email with a bill attached, still to read. */
  inquiries: Inquiry[];
  files: SeedFile[];
}

/** Amounts in the region's currency: dollars, or crowns at roughly 22 to the dollar. */
const amount = (region: SeedRegion, usd: number) => (region === 'cz' ? usd * 22 : usd);

/**
 * Invoices and receipts for stays that ended, and bills from suppliers: one Orbit read and nobody
 * checked yet, one due this week, one overdue and one paid, plus a bill emailed as a PDF that
 * nobody has read yet. Everything is synthetic.
 */
export function buildInvoices(input: {
  region: SeedRegion;
  bookings: Booking[];
  guests: Guest[];
  rooms: Room[];
  charges: Charge[];
  payments: Payment[];
  pricing: PricingConfig;
  profile: HotelProfile;
  contacts: Contact[];
  tasks: HousekeepingTask[];
  today: IsoDate;
  now: Date;
}): SeedInvoices {
  const { region, bookings, pricing, profile, contacts, today, now } = input;
  const czech = region === 'cz';
  const issuer = issuerFrom(profile);
  const folio = (b: Booking) =>
    buildFolio(
      b,
      input.charges.filter((c) => c.bookingId === b.id),
      input.payments.filter((p) => p.bookingId === b.id),
      pricing,
    );
  const ended = bookings
    .filter((b) => b.status === 'checked_out' && b.priceSnapshot && b.checkOut < today)
    .sort((a, b) => a.checkOut.localeCompare(b.checkOut));

  // Receipts for the latest stays paid in full, and an invoice for one still owing.
  const paid = ended.filter((b) => folio(b).balance <= 0).slice(-3);
  const owing = ended.filter((b) => folio(b).balance > 0 && b.checkOut <= addDays(today, -15));
  const documents = [
    ...paid.map((b) => ({ booking: b, kind: 'receipt' as const })),
    ...owing.slice(-1).map((b) => ({ booking: b, kind: 'invoice' as const })),
  ].sort((a, b) => a.booking.checkOut.localeCompare(b.booking.checkOut));
  const sequence = { invoice: 0, receipt: 0 };
  const invoices = documents.map(({ booking, kind }, i) => {
    sequence[kind] += 1;
    const guest = input.guests.find((g) => g.id === booking.guestId);
    // The invoice is made out to the guest's employer, as business stays often are.
    const company = kind === 'invoice';
    return buildInvoice({
      id: `inv_seed_${i + 1}`,
      number: invoiceNumber(kind, booking.checkOut.slice(0, 4), sequence[kind]),
      kind,
      booking,
      roomName: input.rooms.find((r) => r.id === booking.roomId)?.name ?? '',
      folio: folio(booking),
      issuer,
      buyer: {
        name: guest?.name ?? 'Guest',
        company: company ? (czech ? 'Příklad Consulting s.r.o.' : 'Example Consulting LLC') : null,
        address: company
          ? czech
            ? 'Vzorová 12\n110 00 Praha 1'
            : '200 Sample Street\nSacramento, CA 95814'
          : null,
        taxId: company ? (czech ? 'CZ87654321' : '98-7654321') : null,
        email: guest?.email ?? null,
      },
      issuedOn: booking.checkOut,
      paymentTermDays: profile.billing.paymentTermDays,
      note: company ? 'PO 4471' : null,
      issuedBy: null,
      createdAt: new Date(`${booking.checkOut}T11:00:00Z`).toISOString(),
    });
  });

  const by = (trade: Contact['trades'][number]) => contacts.find((c) => c.trades.includes(trade));
  const plumber = by('plumbing');
  const heating = by('heating') ?? plumber;
  const electric = by('electrical');
  const linen = by('cleaning');
  const repair =
    plumber && input.tasks.find((t) => t.type === 'maintenance' && t.trade === 'plumbing');
  const files: SeedFile[] = [];
  const supplierInvoices: SupplierInvoice[] = [];
  const words: BillPdf['words'] = czech
    ? {
        billTo: 'ODBERATEL',
        number: 'Cislo faktury',
        issued: 'Datum vystaveni',
        due: 'Splatnost',
        description: 'POPIS',
        amount: 'CASTKA',
        subtotal: 'Zaklad',
        total: 'Celkem k uhrade',
        payTo: 'BANKOVNI UCET',
        reference: 'VARIABILNI SYMBOL',
        taxId: 'DIC',
        thanks: 'Dekujeme za spolupraci.',
      }
    : {
        billTo: 'BILL TO',
        number: 'Invoice no.',
        issued: 'Issued',
        due: 'Due',
        description: 'DESCRIPTION',
        amount: 'AMOUNT',
        subtotal: 'Subtotal',
        total: 'Total due',
        payTo: 'PAY TO',
        reference: 'REFERENCE',
        taxId: 'Tax ID',
        thanks: 'Thank you for your business.',
      };
  const billTo = { name: issuer.name, address: (issuer.address ?? '').split('\n').filter(Boolean) };
  /** A supplier's letterhead, with a synthetic address and tax ID for each. */
  const letterhead = (contact: Contact, i: number) => ({
    name: contact.name,
    address: czech
      ? [`Prikladova ${12 + i * 7}`, '460 01 Liberec']
      : [`${120 + i * 45} Example Avenue`, 'Bishop, CA 93514'],
    taxId: czech ? `CZ${40211870 + i * 1103}` : `94-${3381020 + i * 517}`,
    email: contact.email,
  });
  const payTo = (i: number) =>
    czech ? `${2400118 + i * 31}/2010` : `Routing 121000358, account ${48201 + i * 7}`;
  /** The bill as the supplier sent it, as a PDF. */
  const printed = (
    id: string,
    contact: Contact,
    i: number,
    bill: Pick<BillPdf, 'number' | 'issuedOn' | 'dueOn' | 'lines' | 'tax'>,
  ): SeedFile => {
    const bytes = billPdf({
      ...bill,
      supplier: letterhead(contact, i),
      billTo,
      title: czech ? 'Faktura' : 'Invoice',
      currency: pricing.currency,
      payTo: payTo(i),
      reference: bill.number.replace(/\D/g, ''),
      words,
    });
    const file: SeedFile = {
      attachment: {
        id,
        name: `${bill.number}.pdf`,
        contentType: 'application/pdf',
        size: bytes.length,
      },
      bytes,
    };
    files.push(file);
    return file;
  };
  /** A bill with the PDF it was read from; its lines are the ones printed. */
  const bill = (
    id: string,
    contact: Contact | undefined,
    i: number,
    fields: Omit<Partial<SupplierInvoice>, 'lines'> & {
      status: SupplierInvoice['status'];
      number: string;
      issuedOn: IsoDate;
      dueOn: IsoDate;
      lines: { label: string; amount: number }[];
    },
  ) => {
    if (!contact) return;
    const tax = fields.tax ?? null;
    const pdf = printed(`att_seed_${id.replace(/^sinv_seed_/, '')}_bill`, contact, i, {
      number: fields.number,
      issuedOn: fields.issuedOn,
      dueOn: fields.dueOn,
      lines: fields.lines,
      tax: tax === null ? null : { label: czech ? 'DPH 21 %' : 'Sales tax', amount: tax },
    });
    supplierInvoices.push({
      id,
      contactId: contact.id,
      supplierName: contact.name,
      supplierTaxId: letterhead(contact, i).taxId,
      currency: pricing.currency,
      total: fields.lines.reduce((s, l) => s + l.amount, 0) + (tax ?? 0),
      tax,
      bankAccount: payTo(i),
      paymentReference: fields.number.replace(/\D/g, ''),
      taskId: null,
      note: null,
      file: pdf.attachment,
      source: 'upload',
      inquiryId: null,
      warnings: [],
      paidOn: null,
      paidMethod: null,
      createdAt: now.toISOString(),
      ...fields,
    });
  };

  if (plumber) {
    bill('sinv_seed_plumber', plumber, 0, {
      status: 'to_review',
      number: czech ? 'FV-2026-0318' : 'RP-4471',
      issuedOn: addDays(today, -1),
      dueOn: addDays(today, 12),
      lines: [
        {
          label: czech ? 'Vymena kartuse baterie' : 'Replace bathroom tap cartridge',
          amount: amount(region, 240),
        },
        { label: czech ? 'Vyjezd technika' : 'Call-out fee', amount: amount(region, 145) },
      ],
      taskId: repair?.id ?? null,
      createdAt: new Date(now.getTime() - 3 * 3600_000).toISOString(),
    });
  }
  bill('sinv_seed_linen', linen, 1, {
    status: 'unpaid',
    number: czech ? '2026/1047' : 'SLS-2026-10',
    issuedOn: addDays(today, -9),
    dueOn: addDays(today, 4),
    tax: amount(region, 97),
    lines: [
      {
        label: czech ? 'Prani pradla, rijen' : 'Linen service, October',
        amount: amount(region, 1083),
      },
    ],
    source: 'email',
    createdAt: new Date(now.getTime() - 9 * 86_400_000).toISOString(),
  });
  bill('sinv_seed_heating', heating, 2, {
    status: 'unpaid',
    number: czech ? 'FA-77812' : 'SHA-77812',
    issuedOn: addDays(today, -24),
    dueOn: addDays(today, -3),
    lines: [
      { label: czech ? 'Servis kotle' : 'Boiler service', amount: amount(region, 380) },
      { label: czech ? 'Tesneni a filtr' : 'Gasket and filter', amount: amount(region, 80) },
    ],
    createdAt: new Date(now.getTime() - 24 * 86_400_000).toISOString(),
  });
  bill('sinv_seed_electric', electric, 3, {
    status: 'paid',
    number: czech ? '260211' : 'AE-260211',
    issuedOn: addDays(today, -30),
    dueOn: addDays(today, -16),
    lines: [
      {
        label: czech ? 'Vymena jistice, pokoj 108' : 'Replace breaker, room 108',
        amount: amount(region, 320),
      },
    ],
    paidOn: addDays(today, -18),
    paidMethod: 'bank_transfer',
    source: 'phone',
    createdAt: new Date(now.getTime() - 30 * 86_400_000).toISOString(),
  });

  // The bakery's monthly bill came by email this morning; nobody has read it into the bills yet.
  const bakery = by('supplies');
  const inquiries: Inquiry[] = [];
  if (bakery?.email) {
    const number = czech ? 'PU-2026-112' : 'FB-2026-112';
    const pdf = printed('att_seed_bakery_bill', bakery, 4, {
      number,
      issuedOn: today,
      dueOn: addDays(today, 14),
      lines: [
        {
          label: czech ? 'Pecivo na snidane, rijen' : 'Breakfast bread and pastries, October',
          amount: amount(region, 690),
        },
        { label: czech ? 'Doprava' : 'Delivery', amount: amount(region, 52) },
      ],
      tax: null,
    });
    inquiries.push(
      thread(
        'inq_seed_bakery_bill',
        now,
        [
          {
            direction: 'in',
            hoursAgo: 2,
            attachments: [pdf.attachment],
            body: czech
              ? `Dobrý den,\n\nv příloze posíláme fakturu za pečivo za říjen.\n\nS pozdravem\n${bakery.name}`
              : `Hello,\n\nplease find attached our invoice for October's breakfast bread and pastries.\n\nKind regards,\n${bakery.name}`,
          },
        ],
        {
          channel: 'email',
          partner: null,
          subject: czech ? `Faktura ${number}` : `Invoice ${number}`,
          senderName: bakery.name,
          senderAddress: bakery.email,
          status: 'new',
          unread: true,
          labelIds: ['lbl_suppliers'],
        },
      ),
    );
  }

  return { invoices, supplierInvoices, inquiries, files };
}
