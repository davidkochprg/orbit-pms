import type { InvoiceView, SupplierInvoiceView } from '@orbit/shared';
import { describe, expect, it } from 'vitest';
import {
  billBody,
  billScanUrl,
  billState,
  emptyBillForm,
  invoiceEmailBody,
  invoiceState,
  parseAmount,
} from './invoices';

const view = (overrides: Partial<InvoiceView>) =>
  ({
    status: 'issued',
    kind: 'invoice',
    settled: false,
    overdue: false,
    dueOn: '2026-11-16',
    ...overrides,
  }) as InvoiceView;

describe('invoiceState', () => {
  it('says void, paid, overdue or when it is due', () => {
    expect(invoiceState(view({ status: 'void', settled: true }))).toEqual({
      label: 'Void',
      tone: 'muted',
    });
    expect(invoiceState(view({ settled: true })).label).toBe('Paid');
    expect(invoiceState(view({ overdue: true })).tone).toBe('destructive');
    expect(invoiceState(view({})).label).toMatch(/^Due /);
    expect(invoiceState(view({ kind: 'receipt', dueOn: null })).label).toBe('Part paid');
  });
});

describe('billState', () => {
  it('puts bills to check first in words', () => {
    const bill = (o: Partial<SupplierInvoiceView>) =>
      ({ status: 'unpaid', overdue: false, dueOn: null, ...o }) as SupplierInvoiceView;
    expect(billState(bill({ status: 'to_review' })).label).toBe('To check');
    expect(billState(bill({ overdue: true })).label).toBe('Overdue');
    expect(billState(bill({})).label).toBe('To pay');
    expect(billState(bill({ status: 'paid' })).tone).toBe('success');
  });
});

describe('billBody', () => {
  it('needs a supplier and a whole total, and takes thousands separators', () => {
    expect(parseAmount('1,284')).toBe(1284);
    expect(parseAmount('12 500')).toBe(12500);
    expect(parseAmount('12.5')).toBeNull();
    expect(billBody(emptyBillForm)).toBeNull();
    expect(billBody({ ...emptyBillForm, supplierName: 'X', total: '90', tax: 'abc' })).toBeNull();
    expect(
      billBody({
        ...emptyBillForm,
        supplierName: ' Test Supplies ',
        total: '1,200',
        dueOn: '2026-11-10',
      }),
    ).toMatchObject({
      supplierName: 'Test Supplies',
      total: 1200,
      tax: null,
      dueOn: '2026-11-10',
      number: null,
    });
  });
});

describe('links and emails', () => {
  it('builds the phone link and a plain email to edit', () => {
    expect(billScanUrl('http://192.168.1.20:5173', 'a b')).toBe(
      'http://192.168.1.20:5173/bill-scan/a%20b',
    );
    expect(
      invoiceEmailBody({
        kind: 'receipt',
        number: 'RCT-2026-0001',
        buyer: { name: 'Test Guest', company: null, address: null, taxId: null, email: null },
        issuer: {
          name: 'Test Lodge',
          address: null,
          taxId: null,
          bankAccount: null,
          email: null,
          phone: null,
          website: null,
        },
      }),
    ).toBe(
      'Hello Test Guest,\n\nplease find your receipt RCT-2026-0001 attached.\n\nBest regards,\nTest Lodge',
    );
  });
});
