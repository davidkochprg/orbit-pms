import type { InvoiceView, SupplierInvoiceView } from '@orbit/shared';
import { describe, expect, it } from 'vitest';
import {
  inBillFolder,
  inIssuedFolder,
  isFiltered,
  matchesBill,
  matchesIssued,
  noFilter,
  partyCounts,
  periodRange,
} from './invoice-filters';

const today = '2026-11-04';

const invoice = (o: Partial<InvoiceView> = {}) =>
  ({
    number: 'INV-2026-0007',
    kind: 'invoice',
    status: 'issued',
    settled: false,
    overdue: false,
    issuedOn: '2026-10-20',
    total: 1180,
    guestName: 'Test Guest',
    buyer: { name: 'Test Guest', company: 'Example Consulting LLC' },
    stay: { roomName: '203' },
    ...o,
  }) as InvoiceView;

const bill = (o: Partial<SupplierInvoiceView> = {}) =>
  ({
    status: 'unpaid',
    overdue: false,
    supplierName: 'Example Plumbing',
    number: 'RP-4471',
    issuedOn: '2026-11-01',
    createdAt: '2026-11-01T09:00:00Z',
    total: 385,
    lines: [{ label: 'Replace bathroom tap cartridge', amount: 240 }],
    note: null,
    repairLabel: null,
    ...o,
  }) as SupplierInvoiceView;

describe('periodRange', () => {
  it('spans this month, last month, 90 days and the year up to today', () => {
    expect(periodRange('any', today)).toBeNull();
    expect(periodRange('this_month', today)).toEqual(['2026-11-01', today]);
    expect(periodRange('last_month', today)).toEqual(['2026-10-01', '2026-10-31']);
    expect(periodRange('last_month', '2026-01-15')).toEqual(['2025-12-01', '2025-12-31']);
    expect(periodRange('last_90', today)).toEqual(['2026-08-07', today]);
    expect(periodRange('this_year', today)).toEqual(['2026-01-01', today]);
  });
});

describe('folders', () => {
  it('counts overdue documents and bills as unpaid too', () => {
    const late = invoice({ overdue: true });
    expect(inIssuedFolder(late, 'unpaid')).toBe(true);
    expect(inIssuedFolder(late, 'overdue')).toBe(true);
    expect(inIssuedFolder(invoice({ settled: true }), 'paid')).toBe(true);
    expect(inIssuedFolder(invoice({ status: 'void', settled: true }), 'paid')).toBe(false);
    expect(inBillFolder(bill({ overdue: true }), 'unpaid')).toBe(true);
    expect(inBillFolder(bill({ status: 'to_review' }), 'unpaid')).toBe(false);
  });
});

describe('matching', () => {
  it('finds a document by number, buyer, guest or amount', () => {
    const match = (query: string) => matchesIssued(invoice(), 'all', { ...noFilter, query }, today);
    expect(match('0007')).toBe(true);
    expect(match('example consulting')).toBe(true);
    expect(match('test guest')).toBe(true);
    expect(match('$1,180')).toBe(true);
    expect(match('nobody')).toBe(false);
  });

  it('narrows by date, amount and party', () => {
    const f = { ...noFilter, period: 'this_month' as const };
    expect(matchesIssued(invoice(), 'all', f, today)).toBe(false);
    expect(matchesBill(bill(), 'all', f, today)).toBe(true);
    expect(matchesBill(bill(), 'all', { ...noFilter, min: 400 }, today)).toBe(false);
    expect(matchesBill(bill(), 'all', { ...noFilter, max: 400 }, today)).toBe(true);
    expect(matchesBill(bill(), 'all', { ...noFilter, party: 'Other Linen' }, today)).toBe(false);
    expect(matchesBill(bill(), 'all', { ...noFilter, query: 'cartridge' }, today)).toBe(true);
    // A bill with no printed date counts from the day it arrived.
    const undated = bill({ issuedOn: null, createdAt: '2026-09-02T10:00:00Z' });
    expect(matchesBill(undated, 'all', f, today)).toBe(false);
  });

  it('knows when anything besides the folder is set', () => {
    expect(isFiltered(noFilter)).toBe(false);
    expect(isFiltered({ ...noFilter, query: ' ' })).toBe(false);
    expect(isFiltered({ ...noFilter, min: 0 })).toBe(true);
  });
});

describe('partyCounts', () => {
  it('puts the parties with the most documents first', () => {
    expect(partyCounts(['B', 'A', 'B'])).toEqual([
      { name: 'B', count: 2 },
      { name: 'A', count: 1 },
    ]);
  });
});
