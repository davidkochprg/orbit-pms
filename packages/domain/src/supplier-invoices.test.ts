import type { HousekeepingTask, SupplierInvoiceReading } from '@orbit/shared';
import { describe, expect, it } from 'vitest';
import { pricingConfig } from './pricing';
import {
  checkSupplierReading,
  createSupplierInvoiceService,
  matchContact,
  repairFor,
  settleInvoiceScan,
} from './supplier-invoices';
import { plumber, room } from './test-fixtures';
import { createMemoryRepositories } from './testing';

const now = new Date('2026-05-12T08:00:00Z');

const reading: SupplierInvoiceReading = {
  readable: true,
  supplierName: 'Test Plumbing Inc.',
  supplierTaxId: '98-7654321',
  supplierEmail: null,
  number: 'TP-1042',
  issuedOn: '2026-05-10',
  dueOn: '2026-05-24',
  currency: 'USD',
  total: 412.5,
  tax: 32,
  lines: [
    { description: 'Replace tap cartridge', amount: 280 },
    { description: '  Call-out  fee ', amount: 100.5 },
  ],
  bankAccount: 'Account 0099',
  paymentReference: null,
};

function task(id: string, overrides: Partial<HousekeepingTask> = {}): HousekeepingTask {
  return {
    id,
    roomId: 'rm_203',
    type: 'maintenance',
    status: 'open',
    notes: 'Bathroom tap is dripping',
    trade: 'plumbing',
    contactId: plumber.id,
    createdAt: '2026-05-09T10:00:00Z',
    ...overrides,
  };
}

const ctx = {
  today: '2026-05-12',
  currency: 'USD' as const,
  contacts: [plumber],
  tasks: [task('tsk_1')],
  existing: [],
  senderAddress: null,
};

describe('matchContact', () => {
  it('matches by the sender or printed email first, then by a clear name', () => {
    expect(
      matchContact({ supplierName: null, supplierEmail: null }, [plumber], 'PLUMBING@example.com'),
    ).toBe(plumber);
    expect(
      matchContact({ supplierName: 'Test Plumbing Inc.', supplierEmail: null }, [plumber]),
    ).toBe(plumber);
    expect(
      matchContact({ supplierName: 'Other Supplies', supplierEmail: null }, [plumber]),
    ).toBeNull();
  });

  it('leaves a name that fits two contacts unmatched', () => {
    const twin = { ...plumber, id: 'ct_twin', name: 'Test Plumbing North', email: null };
    expect(
      matchContact({ supplierName: 'Test Plumbing North', supplierEmail: null }, [plumber, twin]),
    ).toBeNull();
  });
});

describe('repairFor', () => {
  it("picks the contact's open repair before one already done", () => {
    const tasks = [
      task('tsk_old', { status: 'done', createdAt: '2026-05-11T10:00:00Z' }),
      task('tsk_open'),
    ];
    expect(repairFor(plumber.id, tasks)?.id).toBe('tsk_open');
  });
});

describe('checkSupplierReading', () => {
  it('rounds to whole units, tidies lines and links the contact and their repair', () => {
    const checked = checkSupplierReading(reading, ctx);
    expect(checked).toMatchObject({
      status: 'to_review',
      contactId: plumber.id,
      supplierName: 'Test Plumbing Inc.',
      total: 413,
      tax: 32,
      taskId: 'tsk_1',
      lines: [
        { label: 'Replace tap cartridge', amount: 280 },
        { label: 'Call-out fee', amount: 101 },
      ],
    });
    expect(checked.warnings).toEqual(['The total 412.5 is rounded to $413.']);
  });

  it('warns about another currency, a missing total, a duplicate and an impossible due date', () => {
    const checked = checkSupplierReading(
      { ...reading, currency: 'EUR', total: null, dueOn: '2026-05-01' },
      {
        ...ctx,
        existing: [
          {
            ...checkSupplierReading(reading, ctx),
            id: 'sinv_1',
            file: null,
            source: 'upload',
            inquiryId: null,
            createdAt: now.toISOString(),
          },
        ],
      },
    );
    expect(checked.total).toBe(0);
    expect(checked.dueOn).toBeNull();
    expect(checked.warnings).toEqual([
      "No total was found. Enter what's to pay.",
      'The amounts are in EUR, not USD.',
      'The due date was before the issue date, so it was left out.',
      'Bill TP-1042 from this supplier is already in the list.',
    ]);
  });
});

function setup() {
  const repos = createMemoryRepositories(
    {
      rooms: [room('rm_203', { name: '203' })],
      contacts: [plumber],
      tasks: [task('tsk_1')],
      pricing: { ...pricingConfig, currency: 'USD' },
    },
    () => now,
  );
  let n = 0;
  const service = createSupplierInvoiceService({
    repos,
    pricing: pricingConfig,
    scanMinutes: 15,
    clock: () => now,
    newId: (prefix) => `${prefix}_${++n}`,
    newToken: () => `token_${++n}`,
  });
  return { repos, service };
}

const file = { name: 'bill.pdf', contentType: 'application/pdf', bytes: new Uint8Array([1, 2, 3]) };

describe('reading a bill', () => {
  it('keeps the file and lists the bill to check with its contact and repair', async () => {
    const { repos, service } = setup();
    const bill = await service.fromReading(
      reading,
      { source: 'upload', file, inquiryId: null, senderAddress: null },
      'user',
    );
    expect(bill.file).toMatchObject({ name: 'bill.pdf', size: 3 });
    expect(repos.state.files).toHaveLength(1);
    const [view] = await service.list();
    expect(view).toMatchObject({
      status: 'to_review',
      contactName: 'Test Plumbing',
      repairLabel: 'Bathroom tap is dripping · Room 203',
    });
    expect((await service.file(bill.id)).bytes).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('refuses a file with no bill in it', async () => {
    const { service } = setup();
    await expect(
      service.fromReading(
        { ...reading, readable: false },
        { source: 'upload', file, inquiryId: null, senderAddress: null },
        'user',
      ),
    ).rejects.toThrow("Couldn't read a bill");
  });
});

describe('checking and paying', () => {
  it('moves a checked bill to the bills to pay, then to paid, and shows when it is late', async () => {
    const { service } = setup();
    const bill = await service.fromReading(
      reading,
      { source: 'upload', file: null, inquiryId: null, senderAddress: null },
      'user',
    );
    const checked = await service.update(bill.id, { total: 412, checked: true }, 'user');
    expect(checked).toMatchObject({ status: 'unpaid', total: 412, warnings: [] });
    const late = await service.update(bill.id, { dueOn: '2026-05-11' }, 'user');
    expect((await service.get(late.id)).overdue).toBe(true);
    expect((await service.due()).overdue).toHaveLength(1);
    const paid = await service.pay(bill.id, { method: 'bank_transfer', paidOn: null }, 'user');
    expect(paid).toMatchObject({
      status: 'paid',
      paidOn: '2026-05-12',
      paidMethod: 'bank_transfer',
    });
    await expect(
      service.pay(bill.id, { method: 'cash', paidOn: null }, 'user'),
    ).rejects.toMatchObject({ code: 'invalid_transition' });
  });

  it('takes a bill typed in as checked, and refuses unknown links', async () => {
    const { service } = setup();
    const body = {
      contactId: plumber.id,
      supplierName: 'Test Plumbing',
      supplierTaxId: null,
      number: 'TP-1',
      issuedOn: '2026-05-10',
      dueOn: '2026-05-20',
      total: 90,
      tax: null,
      bankAccount: null,
      paymentReference: null,
      taskId: 'tsk_1',
      note: null,
    };
    expect(await service.create(body, 'user')).toMatchObject({ status: 'unpaid', currency: 'USD' });
    await expect(service.create({ ...body, taskId: 'tsk_none' }, 'user')).rejects.toMatchObject({
      code: 'not_found',
    });
  });
});

describe('phone scans', () => {
  it('opens a link, reads one photo at a time and records the bill it became', async () => {
    const { service } = setup();
    const scan = await service.startScan();
    expect(await service.getScanForPhone(scan.id)).toMatchObject({ status: 'waiting' });
    await service.beginScan(scan.id);
    await expect(service.beginScan(scan.id)).rejects.toMatchObject({ code: 'conflict' });
    await service.completeScan(scan.id, 'sinv_9');
    expect(await service.getScan(scan.id)).toMatchObject({
      status: 'done',
      supplierInvoiceId: 'sinv_9',
    });
  });

  it('fails a read that ran too long', () => {
    const scan = {
      id: 's',
      status: 'reading' as const,
      supplierInvoiceId: null,
      error: null,
      readingSince: '2026-05-12T07:00:00Z',
      createdAt: '2026-05-12T07:00:00Z',
      expiresAt: '2026-05-12T09:00:00Z',
    };
    expect(settleInvoiceScan(scan, now).status).toBe('failed');
  });
});
