import type { SupplierInvoiceReading } from '@orbit/shared';
import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { createSupplierInvoiceReader } from './supplier-invoice';
import type { UsageRecord } from './usage';

const reading: SupplierInvoiceReading = {
  readable: true,
  supplierName: 'Test Plumbing Inc.',
  supplierTaxId: null,
  supplierEmail: 'billing@example.com',
  number: 'TP-1042',
  issuedOn: '2026-10-28',
  dueOn: '2026-11-11',
  currency: 'USD',
  total: 412.5,
  tax: null,
  lines: [{ description: 'Replace tap cartridge', amount: 412.5 }],
  bankAccount: null,
  paymentReference: null,
};

function mockModel(prompts: string[]) {
  return new MockLanguageModelV4({
    doGenerate: (options) => {
      prompts.push(JSON.stringify(options.prompt));
      return Promise.resolve({
        content: [{ type: 'text', text: JSON.stringify(reading) }],
        finishReason: { unified: 'stop', raw: undefined },
        usage: {
          inputTokens: { total: 900, noCache: 900, cacheRead: 0, cacheWrite: undefined },
          outputTokens: { total: 120, text: 120, reasoning: undefined },
        },
        warnings: [],
      });
    },
  });
}

function setup(withVision: boolean) {
  const textPrompts: string[] = [];
  const visionPrompts: string[] = [];
  const records: UsageRecord[] = [];
  const reader = createSupplierInvoiceReader({
    model: mockModel(textPrompts),
    modelId: 'muse-spark-1.3',
    vision: withVision ? mockModel(visionPrompts) : null,
    visionModelId: withVision ? 'muse-spark-vision' : null,
    usage: {
      record: (r) => {
        records.push(r);
        return Promise.resolve();
      },
      monthToDateMicroUsd: () => Promise.resolve(0),
    },
  });
  return { reader, textPrompts, visionPrompts, records };
}

describe('createSupplierInvoiceReader', () => {
  it('reads PDF text with the main model, fenced, and records the cost', async () => {
    const { reader, textPrompts, records } = setup(false);
    expect(await reader.read({ kind: 'text', text: 'INVOICE TP-1042 Total $412.50' })).toEqual(
      reading,
    );
    expect(textPrompts[0]).toMatch(/suppliers and contractors/);
    expect(textPrompts[0]).toMatch(/<bill>/);
    expect(records).toEqual([
      expect.objectContaining({ feature: 'invoice_read', model: 'muse-spark-1.3' }),
    ]);
  });

  it('sends photos to the vision model, and refuses them without one', async () => {
    const { reader, visionPrompts, records } = setup(true);
    expect(reader.photos).toBe(true);
    await reader.read({
      kind: 'photo',
      bytes: new Uint8Array([0xff, 0xd8]),
      mediaType: 'image/jpeg',
    });
    expect(visionPrompts[0]).toMatch(/image\/jpeg/);
    expect(records[0]).toMatchObject({ model: 'muse-spark-vision' });
    const textOnly = setup(false).reader;
    expect(textOnly.photos).toBe(false);
    await expect(
      textOnly.read({ kind: 'photo', bytes: new Uint8Array([1]), mediaType: 'image/png' }),
    ).rejects.toThrow('vision model');
  });
});
