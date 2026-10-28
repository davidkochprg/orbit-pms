import { type IdDocumentReading, idDocumentReadingSchema } from '@orbit/shared';
import { generateText, type LanguageModel, Output } from 'ai';
import { fromSdkUsage, tokenCostMicroUsd } from './cost';
import { idScanPrompt, idScanSystemPrompt } from './prompts/id-scan';
import { reasoningEffort, type ReasoningEffort } from './reasoning';
import type { UsageStore } from './usage';

export interface IdPhoto {
  bytes: Uint8Array;
  /** e.g. `image/jpeg`. */
  mediaType: string;
}

/** Reads an ID document photo with the vision model (one call). The photo is not kept. */
export async function readIdDocument(
  model: LanguageModel,
  photo: IdPhoto,
  reasoning: ReasoningEffort = reasoningEffort.idScan,
) {
  const result = await generateText({
    model,
    system: idScanSystemPrompt,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: idScanPrompt },
          { type: 'file', data: photo.bytes, mediaType: photo.mediaType },
        ],
      },
    ],
    output: Output.object({ schema: idDocumentReadingSchema }),
    temperature: 0,
    reasoning,
    providerOptions: { meta: { strictJsonSchema: false } },
  });
  return {
    reading: result.output satisfies IdDocumentReading,
    tokens: fromSdkUsage(result.usage),
  };
}

export interface IdScanReaderDeps {
  model: LanguageModel;
  modelId: string;
  usage: UsageStore;
}

/** Reads an ID photo and records what the call cost under `id_scan`. */
export function createIdScanReader({ model, modelId, usage }: IdScanReaderDeps) {
  return async (photo: IdPhoto): Promise<IdDocumentReading> => {
    const { reading, tokens } = await readIdDocument(model, photo);
    await usage.record({
      feature: 'id_scan',
      model: modelId,
      tokens,
      audioSeconds: 0,
      costMicroUsd: tokenCostMicroUsd(tokens),
    });
    return reading;
  };
}

export type IdScanReader = ReturnType<typeof createIdScanReader>;
