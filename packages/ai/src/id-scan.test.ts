import type { IdDocumentReading } from '@orbit/shared';
import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { createIdScanReader } from './id-scan';
import type { UsageRecord } from './usage';

const reading: IdDocumentReading = {
  readable: true,
  documentType: 'id_card',
  fullName: 'Demo Person',
  nationality: 'CZ',
  dateOfBirth: '1980-01-01',
  documentNumber: 'DEMO123',
  address: null,
  expiresOn: '2030-01-01',
};

describe('createIdScanReader', () => {
  it('sends the photo to the vision model and records the cost as an ID scan', async () => {
    const prompts: string[] = [];
    const model = new MockLanguageModelV4({
      doGenerate: (options) => {
        prompts.push(JSON.stringify(options.prompt));
        return Promise.resolve({
          content: [{ type: 'text', text: JSON.stringify(reading) }],
          finishReason: { unified: 'stop', raw: undefined },
          usage: {
            inputTokens: { total: 1500, noCache: 1500, cacheRead: 0, cacheWrite: undefined },
            outputTokens: { total: 80, text: 80, reasoning: undefined },
          },
          warnings: [],
        });
      },
    });
    const records: UsageRecord[] = [];
    const read = createIdScanReader({
      model,
      modelId: 'muse-spark-1.3',
      usage: {
        record: (r) => {
          records.push(r);
          return Promise.resolve();
        },
        monthToDateMicroUsd: () => Promise.resolve(0),
      },
    });

    const result = await read({
      bytes: new Uint8Array([0xff, 0xd8, 0xff]),
      mediaType: 'image/jpeg',
    });

    expect(result).toEqual(reading);
    expect(prompts[0]).toMatch(/identity documents/);
    expect(prompts[0]).toMatch(/image\/jpeg/);
    expect(records).toEqual([
      expect.objectContaining({ feature: 'id_scan', model: 'muse-spark-1.3', audioSeconds: 0 }),
    ]);
    expect(records[0]!.costMicroUsd).toBeGreaterThan(0);
  });
});
