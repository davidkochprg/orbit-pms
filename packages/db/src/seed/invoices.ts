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
import { type SeedFile, textPdf } from './mail';
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
  const bill = (
    id: string,
    contact: Contact | undefined,
    fields: Partial<SupplierInvoice> & Pick<SupplierInvoice, 'total' | 'status'>,
  ) => {
    if (!contact) return;
    supplierInvoices.push({
      id,
      contactId: contact.id,
      supplierName: contact.name,
      supplierTaxId: null,
      number: null,
      issuedOn: null,
      dueOn: null,
      currency: pricing.currency,
      tax: null,
      lines: [],
      bankAccount: null,
      paymentReference: null,
      taskId: null,
      note: null,
      file: null,
      source: 'manual',
      inquiryId: null,
      warnings: [],
      paidOn: null,
      paidMethod: null,
      createdAt: now.toISOString(),
      ...fields,
    });
  };

  if (plumber) {
    const lines = czech
      ? ['Vymena kartuse baterie', 'Vyjezd technika']
      : ['Replace bathroom tap cartridge', 'Call-out fee'];
    const prices = [amount(region, 240), amount(region, 145)];
    const total = prices[0]! + prices[1]!;
    const number = czech ? 'FV-2026-0318' : 'RP-4471';
    const pdf: SeedFile = {
      attachment: {
        id: 'att_seed_plumber_bill',
        name: `${number}.pdf`,
        contentType: 'application/pdf',
        size: 0,
      },
      bytes: textPdf([
        `${czech ? 'Faktura' : 'Invoice'} ${number}`,
        plumber.name,
        `${czech ? 'Odberatel' : 'Bill to'}: ${profile.name}`,
        `${lines[0]}: ${prices[0]}`,
        `${lines[1]}: ${prices[1]}`,
        `${czech ? 'Celkem' : 'Total'}: ${total} ${pricing.currency}`,
        `${czech ? 'Splatnost' : 'Due'}: ${addDays(today, 12)}`,
      ]),
    };
    pdf.attachment.size = pdf.bytes.length;
    files.push(pdf);
    bill('sinv_seed_plumber', plumber, {
      status: 'to_review',
      number,
      issuedOn: addDays(today, -1),
      dueOn: addDays(today, 12),
      total,
      lines: lines.map((label, i) => ({ label, amount: prices[i]! })),
      taskId: repair?.id ?? null,
      file: pdf.attachment,
      source: 'upload',
      createdAt: new Date(now.getTime() - 3 * 3600_000).toISOString(),
    });
  }
  bill('sinv_seed_linen', linen, {
    status: 'unpaid',
    number: czech ? '2026/1047' : 'SLS-2026-10',
    issuedOn: addDays(today, -9),
    dueOn: addDays(today, 4),
    total: amount(region, 1180),
    tax: amount(region, 97),
    lines: [
      {
        label: czech ? 'Praní prádla, říjen' : 'Linen service, October',
        amount: amount(region, 1180),
      },
    ],
    createdAt: new Date(now.getTime() - 9 * 86_400_000).toISOString(),
  });
  bill('sinv_seed_heating', heating, {
    status: 'unpaid',
    number: czech ? 'FA-77812' : 'SHA-77812',
    issuedOn: addDays(today, -24),
    dueOn: addDays(today, -3),
    total: amount(region, 460),
    lines: [{ label: czech ? 'Servis kotle' : 'Boiler service', amount: amount(region, 460) }],
    createdAt: new Date(now.getTime() - 24 * 86_400_000).toISOString(),
  });
  bill('sinv_seed_electric', electric, {
    status: 'paid',
    number: czech ? '260211' : 'AE-260211',
    issuedOn: addDays(today, -30),
    dueOn: addDays(today, -16),
    total: amount(region, 320),
    lines: [
      {
        label: czech ? 'Výměna jističe' : 'Replace breaker, room 108',
        amount: amount(region, 320),
      },
    ],
    paidOn: addDays(today, -18),
    paidMethod: 'bank_transfer',
    createdAt: new Date(now.getTime() - 30 * 86_400_000).toISOString(),
  });

  // The bakery's monthly bill came by email this morning; nobody has read it into the bills yet.
  const bakery = by('supplies');
  const inquiries: Inquiry[] = [];
  if (bakery?.email) {
    const number = czech ? 'PU-2026-112' : 'FB-2026-112';
    const total = amount(region, 742);
    const pdf: SeedFile = {
      attachment: {
        id: 'att_seed_bakery_bill',
        name: `${number}.pdf`,
        contentType: 'application/pdf',
        size: 0,
      },
      bytes: textPdf([
        `${czech ? 'Faktura' : 'Invoice'} ${number}`,
        bakery.name,
        `${czech ? 'Odberatel' : 'Bill to'}: ${profile.name}`,
        `${czech ? 'Datum vystaveni' : 'Issued'}: ${today}`,
        czech
          ? 'Pecivo na snidane, rijen: ' + amount(region, 690)
          : `Breakfast bread and pastries, October: ${amount(region, 690)}`,
        czech ? 'Doprava: ' + amount(region, 52) : `Delivery: ${amount(region, 52)}`,
        `${czech ? 'Celkem k uhrade' : 'Total due'}: ${total} ${pricing.currency}`,
        `${czech ? 'Splatnost' : 'Due by'}: ${addDays(today, 14)}`,
      ]),
    };
    pdf.attachment.size = pdf.bytes.length;
    files.push(pdf);
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
