import { applySeed, buildSeed, createDb, createRepositories, createUsageStore } from '@orbit/db';
import type {
  ApiError,
  Inquiry,
  Invoice,
  InvoiceScan,
  InvoiceScanPhoneView,
  InvoiceView,
  SupplierInvoice,
  SupplierInvoiceReading,
  SupplierInvoiceView,
} from '@orbit/shared';
import { MockLanguageModelV4 } from 'ai/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app';
import { pdfText } from './pdf/pdf-text';

// PGlite migrates and seeds in setup hooks; with every test file running in parallel that can
// take longer than Vitest's 10 s default.
const DB_SETUP_TIMEOUT = 60_000;

const today = '2026-10-27';
const now = new Date('2026-10-27T08:00:00Z');
const handle = createDb('memory://');
const seed = buildSeed(today, now, 'cz');
const repos = createRepositories(handle.db);

const reading: SupplierInvoiceReading = {
  readable: true,
  supplierName: 'Synthetic Linen Ltd',
  supplierTaxId: null,
  supplierEmail: null,
  number: 'SL-2026-118',
  issuedOn: '2026-10-20',
  dueOn: '2026-11-03',
  currency: 'CZK',
  total: 4840,
  tax: 840,
  lines: [{ description: 'Bath towels, 40 pcs', amount: 4840 }],
  bankAccount: null,
  paymentReference: null,
};

const prompts: string[] = [];
const model = new MockLanguageModelV4({
  doGenerate: (options) => {
    prompts.push(JSON.stringify(options.prompt));
    return Promise.resolve({
      content: [{ type: 'text', text: JSON.stringify(reading) }],
      finishReason: { unified: 'stop', raw: undefined },
      usage: {
        inputTokens: { total: 900, noCache: 900, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 120, text: 120, reasoning: undefined },
      },
      warnings: [],
    });
  },
});

const app = createApp({
  repos,
  ai: {
    agent: model,
    agentModelId: 'muse-spark-1.3',
    translate: model,
    translateModelId: 'muse-spark-1.3',
    draft: model,
    draftModelId: 'muse-spark-1.3',
    vision: model,
    visionModelId: 'muse-spark-1.3',
    transcription: null,
  },
  usage: createUsageStore(handle.db),
  clock: () => now,
});

beforeAll(() => handle.migrate(), DB_SETUP_TIMEOUT);
beforeEach(async () => {
  prompts.length = 0;
  await applySeed(handle.db, seed);
}, DB_SETUP_TIMEOUT);
afterAll(() => handle.close());

async function call<T>(method: string, path: string, body?: unknown) {
  const res = await app.request(path, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
  return { status: res.status, body: (await res.json()) as T };
}

async function upload<T>(path: string, field: string, file: Blob, name: string) {
  const form = new FormData();
  form.append(field, file, name);
  const res = await app.request(path, { method: 'POST', body: form });
  return { status: res.status, body: (await res.json()) as T };
}

/** A one-page PDF with text, as a supplier's system would send. */
async function billPdf(text: string): Promise<Blob> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  pdf.addPage().drawText(text, { x: 50, y: 700, size: 12, font });
  return new Blob([new Uint8Array(await pdf.save())], { type: 'application/pdf' });
}

const leaving = seed.bookings.find((b) => b.checkOut === today && b.status === 'checked_in')!;

describe('guest invoices', () => {
  it('issues an invoice, serves it as a PDF and lists it', async () => {
    const issued = await call<Invoice>('POST', `/api/bookings/${leaving.id}/invoices`, {
      kind: 'invoice',
    });
    expect(issued.status).toBe(201);
    expect(issued.body.number).toBe('INV-2026-0001');
    const res = await app.request(`/api/invoices/${issued.body.id}/pdf?download`);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-disposition')).toContain('INV-2026-0001.pdf');
    expect(await pdfText(new Uint8Array(await res.arrayBuffer()))).toContain('INV-2026-0001');
    const list = await call<InvoiceView[]>('GET', `/api/invoices?bookingId=${leaving.id}`);
    expect(list.body).toMatchObject([{ id: issued.body.id, settled: false, overdue: false }]);
  });

  it('refuses a second invoice, then voids and reissues it', async () => {
    const first = await call<Invoice>('POST', `/api/bookings/${leaving.id}/invoices`, {
      kind: 'invoice',
    });
    const second = await call<ApiError>('POST', `/api/bookings/${leaving.id}/invoices`, {
      kind: 'invoice',
    });
    expect(second.status).toBe(409);
    const voided = await call<{ voided: Invoice; replacement: Invoice }>(
      'POST',
      `/api/invoices/${first.body.id}/void`,
      { reason: 'Bill to the company', reissue: true },
    );
    expect(voided.body.voided.status).toBe('void');
    expect(voided.body.replacement.number).toBe('INV-2026-0002');
  });

  it('emails the PDF in a new conversation on the booking', async () => {
    const issued = await call<Invoice>('POST', `/api/bookings/${leaving.id}/invoices`, {
      kind: 'invoice',
      buyer: {
        name: 'Test Guest',
        company: null,
        address: null,
        taxId: null,
        email: 'guest@example.com',
      },
    });
    const sent = await call<Inquiry>('POST', `/api/invoices/${issued.body.id}/email`, {
      body: 'Your invoice is attached.',
    });
    expect(sent.status).toBe(201);
    expect(sent.body.bookingId).toBe(leaving.id);
    expect(sent.body.messages[0]?.attachments[0]?.name).toBe('INV-2026-0001.pdf');
  });
});

describe('supplier bills', () => {
  it('reads an uploaded PDF by its text into a bill to check, keeping the file', async () => {
    const { status, body } = await upload<SupplierInvoice>(
      '/api/supplier-invoices/upload',
      'file',
      await billPdf('INVOICE SL-2026-118 Synthetic Linen Ltd Total 4 840 CZK'),
      'linen.pdf',
    );
    expect(status).toBe(201);
    expect(body).toMatchObject({ status: 'to_review', total: 4840, source: 'upload' });
    expect(prompts[0]).toContain('SL-2026-118');
    const file = await app.request(`/api/supplier-invoices/${body.id}/file`);
    expect(file.headers.get('content-type')).toBe('application/pdf');
    const checked = await call<SupplierInvoice>('PATCH', `/api/supplier-invoices/${body.id}`, {
      checked: true,
    });
    expect(checked.body.status).toBe('unpaid');
    const paid = await call<SupplierInvoice>('POST', `/api/supplier-invoices/${body.id}/pay`, {
      method: 'bank_transfer',
    });
    expect(paid.body).toMatchObject({ status: 'paid', paidOn: today });
    expect(
      (await call<SupplierInvoiceView[]>('GET', '/api/supplier-invoices?status=paid')).body.map(
        (b) => b.id,
      ),
    ).toContain(body.id);
  });

  it("reads the bakery's emailed PDF from its text, as from the sender", async () => {
    const { status, body } = await call<SupplierInvoice>(
      'POST',
      '/api/supplier-invoices/from-attachment',
      { attachmentId: 'att_seed_bakery_bill', inquiryId: 'inq_seed_bakery_bill' },
    );
    expect(status).toBe(201);
    expect(prompts[0]).toContain('PU-2026-112');
    expect(body).toMatchObject({
      source: 'email',
      inquiryId: 'inq_seed_bakery_bill',
      file: { id: 'att_seed_bakery_bill' },
    });
  });

  it('refuses a file that is neither a PDF nor a photo', async () => {
    const { status } = await upload<ApiError>(
      '/api/supplier-invoices/upload',
      'file',
      new Blob(['hello'], { type: 'text/plain' }),
      'note.txt',
    );
    expect(status).toBe(400);
  });

  it('takes a photo from a phone link without the access code and reports only the status', async () => {
    const opened = await call<InvoiceScan>('POST', '/api/supplier-invoices/scans');
    expect(opened.status).toBe(201);
    const photo = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10])], {
      type: 'image/jpeg',
    });
    const phone = await upload<InvoiceScanPhoneView>(
      `/api/bill-scan/${opened.body.id}/photo`,
      'photo',
      photo,
      'bill.jpg',
    );
    expect(phone.body).toEqual({ status: 'done', error: null, expiresAt: opened.body.expiresAt });
    const desk = await call<InvoiceScan>('GET', `/api/supplier-invoices/scans/${opened.body.id}`);
    expect(desk.body.supplierInvoiceId).toMatch(/^sinv_/);
  });
});
