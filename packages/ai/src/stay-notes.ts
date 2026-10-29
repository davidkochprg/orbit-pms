import type { HousekeepingService, StayToRead } from '@orbit/domain';
import { type StayReadings, stayReadingsSchema } from '@orbit/shared';
import { generateText, type LanguageModel, Output } from 'ai';
import { fromSdkUsage, tokenCostMicroUsd } from './cost';
import { stayNotesPrompt, stayNotesSystemPrompt } from './prompts/stay-notes';
import { reasoningEffort, type ReasoningEffort } from './reasoning';
import type { UsageStore } from './usage';

/** Stays read in one model call; the rest wait for the next call. */
export const STAYS_PER_CALL = 12;

/** Reads stays' notes and messages for what housekeeping should know (one model call). */
export async function readStayNotes(
  model: LanguageModel,
  stays: StayToRead[],
  reasoning: ReasoningEffort = reasoningEffort.stayNotes,
) {
  const result = await generateText({
    model,
    system: stayNotesSystemPrompt,
    prompt: stayNotesPrompt(stays),
    output: Output.object({ schema: stayReadingsSchema }),
    temperature: 0,
    reasoning,
    providerOptions: { meta: { strictJsonSchema: false } },
  });
  return {
    reading: result.output satisfies StayReadings,
    tokens: fromSdkUsage(result.usage),
  };
}

export interface StayNotesReaderDeps {
  model: LanguageModel;
  modelId: string;
  housekeeping: Pick<HousekeepingService, 'staysToRead' | 'saveStayReadings'>;
  usage: UsageStore;
}

/**
 * Reads the notes of the board's stays that changed since they were last read, up to
 * `STAYS_PER_CALL` at a time, and keeps the readings. Read-only for the hotel: it changes no
 * booking or room, only what the board shows. Returns how many stays are still unread.
 */
export function createStayNotesReader({
  model,
  modelId,
  housekeeping,
  usage,
}: StayNotesReaderDeps) {
  return {
    async read(): Promise<number> {
      const unread = await housekeeping.staysToRead();
      const stays = unread.slice(0, STAYS_PER_CALL);
      if (stays.length === 0) return 0;
      const { reading, tokens } = await readStayNotes(model, stays);
      await usage.record({
        feature: 'stay_notes',
        model: modelId,
        tokens,
        audioSeconds: 0,
        costMicroUsd: tokenCostMicroUsd(tokens),
      });
      await housekeeping.saveStayReadings(stays, reading.stays);
      return unread.length - stays.length;
    },
  };
}

export type StayNotesReader = ReturnType<typeof createStayNotesReader>;
