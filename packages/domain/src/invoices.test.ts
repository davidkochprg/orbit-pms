import type { Booking, Guest, Payment, Quote } from '@orbit/shared';
import { describe, expect, it } from 'vitest';
import { createInboxService } from './inbox-service';
import {
  createInvoiceService,
  invoiceNumber,
  issuerFrom,
  paymentReference,
  viewInvoice,
} from './invoices';
import { pricingConfig } from './pricing';
import { emptyHotelProfile } from './settings';
import { booking, double, room } from './test-fixtures';
import { createMemoryRepositories } from './testing';
import type { HotelService } from './service';

const now = new Date('2026-05-12T08:00:00Z');
const pricing = { ...pricingConfig, cityTax: { ...pricingConfig.cityTax, perPersonPerNight: 0 } };

const snapshot: Quote = {
  roomTypeId: double.id,
  checkIn: '2026-05-10',
  checkOut: '2026-05-13',
  nights: 3,
  adults: 2,
  childAges: [],
  lines: [
    { kind: 'accommodation', label: 'Accommodation', quantity: 3, unitPrice: 2000, amount: 6000 },
  ],
  total: 6000,
  currency: 'CZK',
};

const stay: Booking = booking({
  id: 'bk_1',
  roomId: 'rm_1',
  guestId: 'gst_1',
  status: 'checked_in',
  priceSnapshot: snapshot,
});

const guest: Guest = {
  id: 'gst_1',
  name: 'Test Guest',
  email: 'guest@example.com',
  phone: null,
  language: 'en',
  notes: null,
};

function payment(amount: number, overrides: Partial<Payment> = {}): Payment {
  return {
    id: `pay_${amount}`,
    bookingId: 'bk_1',
    kind: 'payment',
    method: 'card',
    amount,
    note: null,
    paidOn: '2026-05-12',
    createdAt: now.toISOString(),
    ...overrides,
  };
}

function setup(payments: Payment[] = [], overrides: Partial<Booking> = {}) {
  const repos = createMemoryRepositories(
    {
      roomTypes: [double],
      rooms: [room('rm_1', { name: '101' })],
      guests: [guest],
      bookings: [{ ...stay, ...overrides }],
      payments,
      profile: {
        ...emptyHotelProfile,
        name: 'Test Lodge',
        billing: {
          legalName: 'Test Lodge LLC',
          address: '1 Test Road',
          taxId: '12-3456789',
          bankAccount: 'Account 0001',
          paymentTermDays: 14,
        },
      },
    },
    () => now,
  );
  let n = 0;
  const newId = (prefix: string) => `${prefix}_${++n}`;
  const clock = () => now;
  const inbox = createInboxService({ repos, hotel: {} as HotelService, clock, newId });
  const invoices = createInvoiceService({
    repos,
    pricing,
    inbox,
    renderPdf: (invoice) =>
      Promise.resolve(Uint8Array.from(invoice.number, (c) => c.charCodeAt(0))),
    clock,
    newId,
  });
  return { repos, invoices };
}

describe('invoice numbers', () => {
  it('numbers each kind per year and gives transfers its digits to quote', () => {
    expect(invoiceNumber('invoice', '2026', 7)).toBe('INV-2026-0007');
    expect(invoiceNumber('receipt', '2026', 12)).toBe('RCT-2026-0012');
    expect(paymentReference('INV-2026-0007')).toBe('20260007');
  });
});

describe('issuerFrom', () => {
  it('falls back to the hotel name and location', () => {
    expect(issuerFrom({ ...emptyHotelProfile, name: 'Lodge', location: 'Valley' })).toMatchObject({
      name: 'Lodge',
      address: 'Valley',
      taxId: null,
    });
  });
});

describe('issuing', () => {
  it('copies the bill, the hotel and the guest onto a numbered invoice due in the payment term', async () => {
    const { invoices, repos } = setup([payment(2000)]);
    const invoice = await invoices.issue(
      'bk_1',
      { kind: 'invoice', buyer: null, note: null },
      'user',
    );
    expect(invoice).toMatchObject({
      number: 'INV-2026-0001',
      issuedOn: '2026-05-12',
      dueOn: '2026-05-26',
      total: 6000,
      paid: 2000,
      due: 4000,
      paymentReference: '20260001',
      stay: { checkIn: '2026-05-10', checkOut: '2026-05-13', roomName: '101' },
      issuer: { name: 'Test Lodge LLC', taxId: '12-3456789', bankAccount: 'Account 0001' },
      buyer: { name: 'Test Guest', email: 'guest@example.com', company: null },
    });
    expect(invoice.lines.map((l) => l.label)).toEqual(['Accommodation']);
    expect(repos.state.audit.at(-1)).toMatchObject({ action: 'invoice.issue', subjectId: 'bk_1' });
  });

  it('continues the series and keeps receipts in their own', async () => {
    const { invoices } = setup([payment(6000)]);
    await invoices.issue('bk_1', { kind: 'invoice', buyer: null, note: null }, 'user');
    const receipt = await invoices.issue(
      'bk_1',
      { kind: 'receipt', buyer: null, note: null },
      'user',
    );
    expect(receipt).toMatchObject({ number: 'RCT-2026-0001', dueOn: null, paymentReference: null });
  });

  it('refuses a hold, a receipt with nothing paid, and a second current document', async () => {
    await expect(
      setup([], { status: 'hold' }).invoices.issue(
        'bk_1',
        { kind: 'invoice', buyer: null, note: null },
        'user',
      ),
    ).rejects.toMatchObject({ code: 'invalid_transition' });
    const { invoices } = setup();
    await expect(
      invoices.issue('bk_1', { kind: 'receipt', buyer: null, note: null }, 'user'),
    ).rejects.toThrow('Nothing has been paid yet');
    await invoices.issue('bk_1', { kind: 'invoice', buyer: null, note: null }, 'user');
    await expect(
      invoices.issue('bk_1', { kind: 'invoice', buyer: null, note: null }, 'user'),
    ).rejects.toMatchObject({ code: 'conflict' });
  });

  it('makes it out to a company when asked', async () => {
    const { invoices } = setup();
    const buyer = {
      name: 'Test Guest',
      company: 'Example Corp',
      address: '2 Test Street',
      taxId: 'CZ00000000',
      email: 'billing@example.com',
    };
    const invoice = await invoices.issue('bk_1', { kind: 'invoice', buyer, note: 'PO 42' }, 'user');
    expect(invoice).toMatchObject({ buyer, note: 'PO 42' });
  });
});

describe('voiding', () => {
  it('keeps the number, marks it void and can issue a new one in its place', async () => {
    const { invoices } = setup();
    const first = await invoices.issue(
      'bk_1',
      { kind: 'invoice', buyer: null, note: null },
      'user',
    );
    const { voided, replacement } = await invoices.void(
      first.id,
      { reason: 'Wrong company', reissue: true, buyer: null },
      'user',
    );
    expect(voided).toMatchObject({
      status: 'void',
      voidReason: 'Wrong company',
      replacedBy: replacement?.id,
    });
    expect(replacement?.number).toBe('INV-2026-0002');
    await expect(
      invoices.void(first.id, { reason: 'Again', reissue: false, buyer: null }, 'user'),
    ).rejects.toThrow('is void');
  });

  it('previews a reissue without tripping over the document it replaces', async () => {
    const { invoices } = setup();
    const first = await invoices.issue(
      'bk_1',
      { kind: 'invoice', buyer: null, note: null },
      'user',
    );
    const { replacement } = await invoices.previewVoid(first.id, {
      reason: 'Typo',
      reissue: true,
      buyer: null,
    });
    expect(replacement?.number).toBe('INV-2026-0002');
  });
});

describe('viewInvoice', () => {
  it('is settled once the bill is paid, outdated when the bill changed, overdue after the due date', async () => {
    const { invoices, repos } = setup();
    const invoice = await invoices.issue(
      'bk_1',
      { kind: 'invoice', buyer: null, note: null },
      'user',
    );
    const folio = { lines: [], charged: 6000, balance: 6000 };
    const base = { ...folio, lines: invoice.lines.map((l) => ({ ...l, kind: 'stay' as const })) };
    expect(viewInvoice(invoice, base as never, 'Test Guest', '2026-05-12')).toMatchObject({
      settled: false,
      outdated: false,
      overdue: false,
    });
    expect(
      viewInvoice(invoice, { ...base, balance: 0 } as never, 'Test Guest', '2026-06-30'),
    ).toMatchObject({ settled: true, overdue: false });
    expect(viewInvoice(invoice, base as never, 'Test Guest', '2026-06-30').overdue).toBe(true);
    expect(
      viewInvoice(invoice, { ...base, charged: 6300 } as never, 'Test Guest', '2026-05-12')
        .outdated,
    ).toBe(true);
    expect((await invoices.list({ bookingId: 'bk_1' }))[0]?.guestName).toBe('Test Guest');
    expect(repos.state.invoices).toHaveLength(1);
  });
});

describe('emailing', () => {
  it('attaches the PDF to a new email linked to the booking', async () => {
    const { invoices, repos } = setup();
    const invoice = await invoices.issue(
      'bk_1',
      { kind: 'invoice', buyer: null, note: null },
      'user',
    );
    const inquiry = await invoices.email(
      invoice.id,
      { to: null, subject: null, body: 'Your invoice is attached.' },
      'Jordan',
      'user',
    );
    expect(inquiry).toMatchObject({
      bookingId: 'bk_1',
      subject: 'Invoice INV-2026-0001 from Test Lodge LLC',
    });
    expect(inquiry.messages[0]?.attachments).toMatchObject([
      { name: 'INV-2026-0001.pdf', contentType: 'application/pdf' },
    ]);
    expect(repos.state.audit.at(-1)).toMatchObject({ action: 'invoice.email' });
  });

  it('needs an address when the buyer has none', async () => {
    const { invoices, repos } = setup();
    repos.state.guests = [{ ...guest, email: null }];
    const invoice = await invoices.issue(
      'bk_1',
      { kind: 'invoice', buyer: null, note: null },
      'user',
    );
    await expect(
      invoices.email(invoice.id, { to: null, subject: null, body: 'Hi' }, null, 'user'),
    ).rejects.toThrow('has no email address');
  });
});
