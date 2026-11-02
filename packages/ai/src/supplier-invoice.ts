import { type SupplierInvoiceReading, supplierInvoiceReadingSchema } from '@orbit/shared';
import { generateText, type LanguageModel, Output, type UserModelMessage } from 'ai';
import { fromSdkUsage, tokenCostMicroUsd } from './cost';
import {
  supplierInvoicePhotoPrompt,
  supplierInvoiceSystemPrompt,
  supplierInvoiceTextPrompt,
} from './prompts/supplier-invoice';
import { reasoningEffort, type ReasoningEffort } from './reasoning';
import type { UsageStore } from './usage';

/** A bill to read: a photo for the vision model, or the text of a PDF. */
export type BillSource =
  { kind: 'photo'; bytes: Uint8Array; mediaType: string } | { kind: 'text'; text: string };

/** The longest PDF text read; a bill is a page or two. */
export const MAX_BILL_TEXT = 20_000;

/** Reads a supplier's bill with one call. Nothing is kept. */
export async function readSupplierInvoice(
  model: LanguageModel,
  source: BillSource,
  reasoning: ReasoningEffort = reasoningEffort.supplierInvoice,
) {
  const message: UserModelMessage =
    source.kind === 'photo'
      ? {
          role: 'user',
          content: [
            { type: 'text', text: supplierInvoicePhotoPrompt },
            { type: 'file', data: source.bytes, mediaType: source.mediaType },
          ],
        }
      : {
          role: 'user',
          content: supplierInvoiceTextPrompt(source.text.slice(0, MAX_BILL_TEXT)),
        };
  const result = await generateText({
    model,
    system: supplierInvoiceSystemPrompt,
    messages: [message],
    output: Output.object({ schema: supplierInvoiceReadingSchema }),
    temperature: 0,
    reasoning,
    providerOptions: { meta: { strictJsonSchema: false } },
  });
  return {
    reading: result.output satisfies SupplierInvoiceReading,
    tokens: fromSdkUsage(result.usage),
  };
}

export interface SupplierInvoiceReaderDeps {
  /** Reads the text of PDFs. */
  model: LanguageModel;
  modelId: string;
  /** Reads photos; null when no vision model is configured. */
  vision: LanguageModel | null;
  visionModelId: string | null;
  usage: UsageStore;
}

/**
 * Reads bills from photos (vision model) or PDF text (Muse Spark) and records what each call cost
 * under `invoice_read`. `photos` is false without a vision model, and a photo is then refused.
 */
export function createSupplierInvoiceReader({
  model,
  modelId,
  vision,
  visionModelId,
  usage,
}: SupplierInvoiceReaderDeps) {
  return {
    photos: vision !== null,
    async read(source: BillSource): Promise<SupplierInvoiceReading> {
      const photo = source.kind === 'photo';
      if (photo && !vision) throw new Error('Reading photos needs a vision model');
      const { reading, tokens } = await readSupplierInvoice(photo ? vision! : model, source);
      await usage.record({
        feature: 'invoice_read',
        model: photo ? (visionModelId ?? modelId) : modelId,
        tokens,
        audioSeconds: 0,
        costMicroUsd: tokenCostMicroUsd(tokens),
      });
      return reading;
    },
  };
}

export type SupplierInvoiceReader = ReturnType<typeof createSupplierInvoiceReader>;
