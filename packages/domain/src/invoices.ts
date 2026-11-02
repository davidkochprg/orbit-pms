import {
  type AuditActor,
  type BillingParty,
  type Booking,
  type EmailInvoiceBody,
  type Folio,
  type HotelProfile,
  type Invoice,
  type InvoiceFilter,
  type InvoiceIssuer,
  type InvoiceKind,
  invoiceKindLabels,
  type InvoiceView,
  type IsoDate,
  type IssueInvoiceBody,
  type PricingConfig,
  type VoidInvoiceBody,
} from '@orbit/shared';
import { buildFolio } from './billing';
import { addDays, hotelToday } from './dates';
import { DomainError } from './errors';
import type { InboxService } from './inbox-service';
import { currentPricing } from './rates';
import type { Repositories } from './repositories';
import { emptyHotelProfile } from './settings';

const prefixes: Record<InvoiceKind, string> = { invoice: 'INV', receipt: 'RCT' };

/** The start of a year's series, e.g. "INV-2026-". */
export function invoiceSeries(kind: InvoiceKind, year: string): string {
  return `${prefixes[kind]}-${year}-`;
}

/** "INV-2026-0007": a series per kind and year, numbered without gaps. */
export function invoiceNumber(kind: InvoiceKind, year: string, sequence: number): string {
  return `${invoiceSeries(kind, year)}${String(sequence).padStart(4, '0')}`;
}

/** What a bank transfer quotes to be matched to the invoice: its number's digits, "20260007". */
export function paymentReference(number: string): string {
  return number.replace(/\D/g, '');
}

/** The hotel as the seller, from the billing details in Settings. */
export function issuerFrom(profile: HotelProfile): InvoiceIssuer {
  return {
    name: profile.billing.legalName ?? profile.name,
    address: profile.billing.address ?? profile.location,
    taxId: profile.billing.taxId,
    bankAccount: profile.billing.bankAccount,
    email: profile.email,
    phone: profile.phone,
    website: profile.website,
  };
}

/**
 * Throws unless the bill can be documented: not a hold (not a sale yet), something charged, and
 * for a receipt something paid. One document of each kind per stay is current at a time; a
 * mistake is fixed by voiding it, which can issue the new one in the same step.
 */
export function assertCanIssue(
  booking: Booking,
  folio: Folio,
  kind: InvoiceKind,
  existing: Invoice[],
): void {
  if (booking.status === 'hold') {
    throw new DomainError('invalid_transition', 'Confirm the booking before billing it');
  }
  if (folio.charged <= 0) throw new DomainError('invalid_input', 'The bill has nothing on it');
  if (kind === 'receipt' && folio.paid <= 0) {
    throw new DomainError(
      'invalid_input',
      'Nothing has been paid yet. Take the payment first, then issue the receipt.',
    );
  }
  const current = existing.find((i) => i.kind === kind && i.status === 'issued');
  if (current) {
    throw new DomainError(
      'conflict',
      `${invoiceKindLabels[kind]} ${current.number} is already issued for this stay. Void it to issue a new one.`,
    );
  }
}

export interface InvoiceDraft {
  id: string;
  number: string;
  kind: InvoiceKind;
  booking: Booking;
  roomName: string;
  folio: Folio;
  issuer: InvoiceIssuer;
  buyer: BillingParty;
  issuedOn: IsoDate;
  paymentTermDays: number;
  note: string | null;
  issuedBy: string | null;
  createdAt: string;
}

/** The document for a bill as it stands: its lines, taxes and payments, frozen. */
export function buildInvoice(d: InvoiceDraft): Invoice {
  const { folio } = d;
  return {
    id: d.id,
    number: d.number,
    kind: d.kind,
    status: 'issued',
    bookingId: d.booking.id,
    guestId: d.booking.guestId,
    issuedOn: d.issuedOn,
    dueOn: d.kind === 'invoice' ? addDays(d.issuedOn, d.paymentTermDays) : null,
    stay: { checkIn: d.booking.checkIn, checkOut: d.booking.checkOut, roomName: d.roomName },
    issuer: d.issuer,
    buyer: d.buyer,
    lines: folio.lines.map((l) => ({
      label: l.label,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      amount: l.amount,
      vatBracket: l.vatBracket,
      vatRate: l.vatRate,
      isTax: l.kind === 'tax',
    })),
    vat: folio.vat,
    taxMode: folio.taxMode,
    currency: folio.currency,
    total: folio.charged,
    paid: folio.paid,
    due: folio.balance,
    payments: folio.payments.map((p) => ({
      kind: p.kind,
      method: p.method,
      amount: p.amount,
      paidOn: p.paidOn,
    })),
    paymentReference: d.kind === 'invoice' ? paymentReference(d.number) : null,
    note: d.note,
    issuedBy: d.issuedBy,
    voidedOn: null,
    voidReason: null,
    replacedBy: null,
    createdAt: d.createdAt,
  };
}

/** Whether the bill no longer matches the document: a line or a total changed since. */
export function isOutdated(invoice: Invoice, folio: Folio): boolean {
  const key = (lines: { label: string; quantity: number; amount: number }[]) =>
    JSON.stringify(lines.map((l) => [l.label, l.quantity, l.amount]));
  return invoice.total !== folio.charged || key(invoice.lines) !== key(folio.lines);
}

/** An issued document with how its bill stands today. */
export function viewInvoice(
  invoice: Invoice,
  folio: Folio,
  guestName: string,
  today: IsoDate,
): InvoiceView {
  const settled = folio.balance <= 0;
  return {
    ...invoice,
    guestName,
    settled,
    outdated: invoice.status === 'issued' && isOutdated(invoice, folio),
    overdue:
      invoice.status === 'issued' &&
      invoice.kind === 'invoice' &&
      !settled &&
      invoice.dueOn !== null &&
      invoice.dueOn < today,
  };
}

export interface InvoiceDeps {
  repos: Repositories;
  /** Used until a manager saves rates. */
  pricing: PricingConfig;
  inbox: Pick<InboxService, 'sendBookingEmail'>;
  /** The document as a PDF; rendering is the API's job, so the domain stays free of it. */
  renderPdf: (invoice: Invoice) => Promise<Uint8Array>;
  clock: () => Date;
  newId: (prefix: string) => string;
}

/**
 * Invoices and receipts for bookings' bills. Issuing copies the bill, the hotel's billing details
 * and the buyer onto a numbered document that never changes; voiding keeps it, marked void, and
 * can issue a new one in its place. Every change is audited on the booking.
 */
export function createInvoiceService({
  repos,
  pricing,
  inbox,
  renderPdf,
  clock,
  newId,
}: InvoiceDeps) {
  async function loadBooking(r: Repositories, id: string): Promise<Booking> {
    const booking = await r.bookings.getBooking(id);
    if (!booking) throw new DomainError('not_found', `Booking ${id} not found`);
    return booking;
  }

  async function load(r: Repositories, id: string): Promise<Invoice> {
    const invoice = await r.invoices.get(id);
    if (!invoice) throw new DomainError('not_found', `Invoice ${id} not found`);
    return invoice;
  }

  async function folioOf(r: Repositories, booking: Booking): Promise<Folio> {
    return buildFolio(
      booking,
      await r.billing.listCharges({ bookingId: booking.id }),
      await r.billing.listPayments({ bookingId: booking.id }),
      await currentPricing(r, pricing),
    );
  }

  /** The guest, with the address from their registration, when they have one. */
  async function defaultBuyer(r: Repositories, booking: Booking): Promise<BillingParty> {
    const guest = await r.guests.getGuest(booking.guestId);
    const registered = await r.stayGuests.listByBooking(booking.id);
    const address =
      registered.find((s) => s.guestId === booking.guestId && s.address)?.address ?? null;
    return {
      name: guest?.name ?? 'Guest',
      company: null,
      address,
      taxId: null,
      email: guest?.email ?? null,
    };
  }

  /**
   * The document `body` would issue. Outside a transaction the number is the next one free now;
   * issuing takes it under the series lock. `replacing` is a document about to be voided.
   */
  async function plan(
    r: Repositories,
    bookingId: string,
    body: IssueInvoiceBody,
    issuedBy: string | null,
    replacing: string | null = null,
  ): Promise<Invoice> {
    const booking = await loadBooking(r, bookingId);
    const folio = await folioOf(r, booking);
    const existing = (await r.invoices.list({ bookingId })).filter((i) => i.id !== replacing);
    assertCanIssue(booking, folio, body.kind, existing);
    const now = clock();
    const issuedOn = hotelToday(now);
    const year = issuedOn.slice(0, 4);
    const sequence = (await r.invoices.lastSequence(invoiceSeries(body.kind, year))) + 1;
    const profile = (await r.settings.getProfile()) ?? emptyHotelProfile;
    const room = await r.rooms.getRoom(booking.roomId);
    return buildInvoice({
      id: newId('inv'),
      number: invoiceNumber(body.kind, year, sequence),
      kind: body.kind,
      booking,
      roomName: room?.name ?? '',
      folio,
      issuer: issuerFrom(profile),
      buyer: body.buyer ?? (await defaultBuyer(r, booking)),
      issuedOn,
      paymentTermDays: profile.billing.paymentTermDays,
      note: body.note,
      issuedBy,
      createdAt: now.toISOString(),
    });
  }

  async function issueIn(
    tx: Repositories,
    bookingId: string,
    body: IssueInvoiceBody,
    actor: AuditActor,
    issuedBy: string | null,
  ): Promise<Invoice> {
    const invoice = await plan(tx, bookingId, body, issuedBy);
    await tx.invoices.create(invoice);
    await tx.audit.append({
      actor,
      action: 'invoice.issue',
      subjectId: bookingId,
      payload: {
        invoiceId: invoice.id,
        number: invoice.number,
        kind: invoice.kind,
        total: invoice.total,
      },
    });
    return invoice;
  }

  async function view(r: Repositories, invoice: Invoice): Promise<InvoiceView> {
    const booking = await loadBooking(r, invoice.bookingId);
    const guest = await r.guests.getGuest(invoice.guestId);
    return viewInvoice(
      invoice,
      await folioOf(r, booking),
      guest?.name ?? invoice.buyer.name,
      hotelToday(clock()),
    );
  }

  function assertIssued(invoice: Invoice): void {
    if (invoice.status === 'void') {
      throw new DomainError('invalid_transition', `${invoice.number} is void`);
    }
  }

  return {
    /** Newest first, each with how its bill stands today. */
    async list(filter: InvoiceFilter = {}): Promise<InvoiceView[]> {
      const invoices = await repos.invoices.list(filter);
      return Promise.all(invoices.map((i) => view(repos, i)));
    },

    async get(id: string): Promise<InvoiceView> {
      return view(repos, await load(repos, id));
    },

    /** The stored document, e.g. to render it. */
    getDocument: (id: string) => load(repos, id),

    /** Checks a document against current data without issuing it, e.g. for an agent proposal. */
    previewIssue: (bookingId: string, body: IssueInvoiceBody) => plan(repos, bookingId, body, null),

    async issue(
      bookingId: string,
      body: IssueInvoiceBody,
      actor: AuditActor,
      issuedBy: string | null = null,
    ): Promise<Invoice> {
      return repos.transaction((tx) => issueIn(tx, bookingId, body, actor, issuedBy));
    },

    /** Checks a void against current data without saving it, e.g. for an agent proposal. */
    async previewVoid(id: string, body: VoidInvoiceBody) {
      const invoice = await load(repos, id);
      assertIssued(invoice);
      if (!body.reissue) return { invoice, replacement: null };
      const replacement = await plan(
        repos,
        invoice.bookingId,
        { kind: invoice.kind, buyer: body.buyer ?? invoice.buyer, note: invoice.note },
        null,
        id,
      );
      return { invoice, replacement };
    },

    /**
     * Marks a document void, keeping its number in the series. With `reissue`, a new one is
     * issued from the bill as it stands, for the same buyer unless another is given.
     */
    async void(
      id: string,
      body: VoidInvoiceBody,
      actor: AuditActor,
      issuedBy: string | null = null,
    ): Promise<{ voided: Invoice; replacement: Invoice | null }> {
      return repos.transaction(async (tx) => {
        const invoice = await load(tx, id);
        assertIssued(invoice);
        let voided: Invoice = {
          ...invoice,
          status: 'void',
          voidedOn: hotelToday(clock()),
          voidReason: body.reason,
        };
        await tx.invoices.update(voided);
        await tx.audit.append({
          actor,
          action: 'invoice.void',
          subjectId: invoice.bookingId,
          payload: { invoiceId: id, number: invoice.number, reason: body.reason },
        });
        if (!body.reissue) return { voided, replacement: null };
        const replacement = await issueIn(
          tx,
          invoice.bookingId,
          { kind: invoice.kind, buyer: body.buyer ?? invoice.buyer, note: invoice.note },
          actor,
          issuedBy,
        );
        voided = { ...voided, replacedBy: replacement.id };
        await tx.invoices.update(voided);
        return { voided, replacement };
      });
    },

    /** The document as a PDF file. */
    async pdf(id: string): Promise<{ invoice: Invoice; bytes: Uint8Array }> {
      const invoice = await load(repos, id);
      return { invoice, bytes: await renderPdf(invoice) };
    },

    /** Who an email of the document goes to, and its subject when none is given. */
    async previewEmail(id: string, body: EmailInvoiceBody) {
      const invoice = await load(repos, id);
      assertIssued(invoice);
      const address = body.to ?? invoice.buyer.email;
      if (!address) {
        throw new DomainError('invalid_input', `${invoice.buyer.name} has no email address`);
      }
      return {
        invoice,
        to: { name: body.to ? null : invoice.buyer.name, address },
        subject:
          body.subject ??
          `${invoiceKindLabels[invoice.kind]} ${invoice.number} from ${invoice.issuer.name}`,
      };
    },

    /**
     * Emails the document as a PDF: a new conversation linked to the booking, to the buyer unless
     * another address is given.
     */
    async email(id: string, body: EmailInvoiceBody, author: string | null, actor: AuditActor) {
      const { invoice, to, subject } = await this.previewEmail(id, body);
      const bytes = await renderPdf(invoice);
      const attachment = {
        id: newId('att'),
        name: `${invoice.number}.pdf`,
        contentType: 'application/pdf',
        size: bytes.length,
      };
      await repos.mail.saveAttachment(attachment, bytes);
      const inquiry = await inbox.sendBookingEmail(
        invoice.bookingId,
        { to, subject, body: body.body, attachmentIds: [attachment.id] },
        author,
        actor,
      );
      await repos.audit.append({
        actor,
        action: 'invoice.email',
        subjectId: invoice.bookingId,
        payload: { invoiceId: id, number: invoice.number, to: to.address, inquiryId: inquiry.id },
      });
      return inquiry;
    },
  };
}

export type InvoiceService = ReturnType<typeof createInvoiceService>;
