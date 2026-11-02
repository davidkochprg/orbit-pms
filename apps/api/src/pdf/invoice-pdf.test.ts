import type { Invoice } from '@orbit/shared';
import { describe, expect, it } from 'vitest';
import { renderInvoicePdf } from './invoice-pdf';
import { isPdf, pdfText } from './pdf-text';

const invoice: Invoice = {
  id: 'inv_1',
  number: 'INV-2026-0007',
  kind: 'invoice',
  status: 'issued',
  bookingId: 'bk_1',
  guestId: 'gst_1',
  issuedOn: '2026-11-02',
  dueOn: '2026-11-16',
  stay: { checkIn: '2026-10-30', checkOut: '2026-11-02', roomName: '204' },
  issuer: {
    name: 'Orbit Demo Lodge LLC',
    address: '100 Example Road\nMammoth Lakes, CA 93546',
    taxId: '12-3456789',
    bankAccount: 'Routing 000000000 · Account 0001234567',
    email: 'frontdesk@example.com',
    phone: null,
    website: null,
  },
  buyer: {
    name: 'Kateřina Čermáková',
    company: 'Example Corp',
    address: '2 Test Street\nSpringfield',
    taxId: 'CZ00000000',
    email: 'billing@example.com',
  },
  lines: [
    {
      label: 'Accommodation, King room, 3 nights',
      quantity: 3,
      unitPrice: 420,
      amount: 1260,
      vatBracket: 'reduced',
      vatRate: 12,
      isTax: false,
    },
    {
      label: 'Occupancy tax 12%',
      quantity: 1,
      unitPrice: 151,
      amount: 151,
      vatBracket: 'reduced',
      vatRate: 12,
      isTax: true,
    },
  ],
  vat: [{ bracket: 'reduced', label: 'Occupancy tax', rate: 12, gross: 1411, net: 1260, vat: 151 }],
  taxMode: 'exclusive',
  currency: 'USD',
  total: 1411,
  paid: 200,
  due: 1211,
  payments: [{ kind: 'payment', method: 'card', amount: 200, paidOn: '2026-10-30' }],
  paymentReference: '20260007',
  note: 'PO 4471',
  issuedBy: null,
  voidedOn: null,
  voidReason: null,
  replacedBy: null,
  createdAt: '2026-11-02T10:00:00.000Z',
};

describe('renderInvoicePdf', () => {
  it('prints the document with accented names, amounts and how to pay', async () => {
    const bytes = await renderInvoicePdf(invoice);
    expect(isPdf(bytes)).toBe(true);
    const text = await pdfText(bytes);
    for (const expected of [
      'INVOICE',
      'INV-2026-0007',
      'Kateřina Čermáková',
      'Example Corp',
      '$1,260',
      'Occupancy tax 12%',
      '$1,411',
      'Amount due',
      '$1,211',
      '20260007',
      'PO 4471',
    ]) {
      expect(text).toContain(expected);
    }
  });

  it('marks a void document and says a paid receipt is paid', async () => {
    const receipt: Invoice = {
      ...invoice,
      kind: 'receipt',
      status: 'void',
      number: 'RCT-2026-0001',
      dueOn: null,
      paymentReference: null,
      paid: 1411,
      due: 0,
    };
    const text = await pdfText(await renderInvoicePdf(receipt));
    expect(text).toContain('RECEIPT');
    expect(text).toContain('VOID');
    expect(text).toContain('Paid in full');
  });
});
