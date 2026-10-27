import type { HousekeepingService } from '@orbit/domain';
import {
  type HousekeepingNoteReading,
  housekeepingNoteReadingSchema,
  type HousekeepingNoteResult,
  type Room,
} from '@orbit/shared';
import { generateText, type LanguageModel, Output } from 'ai';
import { audioCostMicroUsd, fromSdkUsage, tokenCostMicroUsd } from './cost';
import { housekeepingNotePrompt, housekeepingNoteSystemPrompt } from './prompts/housekeeping';
import { reasoningEffort, type ReasoningEffort } from './reasoning';
import { type TranscriptionConfig, transcribeWav } from './transcribe';
import type { UsageStore } from './usage';

/** Reads a housekeeping note into room updates (one model call). */
export async function readHousekeepingNote(
  model: LanguageModel,
  note: string,
  roomNames: string[],
  reasoning: ReasoningEffort = reasoningEffort.housekeeping,
) {
  const result = await generateText({
    model,
    system: housekeepingNoteSystemPrompt,
    prompt: housekeepingNotePrompt(note, roomNames),
    output: Output.object({ schema: housekeepingNoteReadingSchema }),
    temperature: 0,
    reasoning,
    providerOptions: { meta: { strictJsonSchema: false } },
  });
  return {
    reading: result.output satisfies HousekeepingNoteReading,
    tokens: fromSdkUsage(result.usage),
  };
}

export interface HousekeepingNotePipelineDeps {
  model: LanguageModel;
  modelId: string;
  /** Null when no voice model is configured: typed notes still work. */
  transcription: TranscriptionConfig | null;
  housekeeping: Pick<HousekeepingService, 'applyNote'>;
  listRooms: () => Promise<Room[]>;
  usage: UsageStore;
}

/**
 * A housekeeper's note, recorded or typed: transcribe (Meta speech-to-text), read it into room
 * updates (one model call), then apply them right away as the agent. ADR 0006 allows this
 * because room status and maintenance tasks are low-risk and reversible.
 */
export function createHousekeepingNotePipeline(deps: HousekeepingNotePipelineDeps) {
  const { model, modelId, transcription, housekeeping, listRooms, usage } = deps;

  async function apply(note: string): Promise<HousekeepingNoteResult> {
    const rooms = await listRooms();
    const { reading, tokens } = await readHousekeepingNote(
      model,
      note,
      rooms.map((r) => r.name),
    );
    await usage.record({
      feature: 'voice',
      model: modelId,
      tokens,
      audioSeconds: 0,
      costMicroUsd: tokenCostMicroUsd(tokens),
    });
    return housekeeping.applyNote(reading, note, 'agent');
  }

  return {
    canTranscribe: transcription !== null,

    fromText: (text: string) => apply(text.trim()),

    async fromAudio(wav: Uint8Array<ArrayBuffer>): Promise<HousekeepingNoteResult> {
      if (!transcription) throw new Error('No voice model is configured');
      const rooms = await listRooms();
      const { transcript, audioSeconds } = await transcribeWav(transcription, wav, {
        keywords: rooms.map((r) => r.name),
      });
      await usage.record({
        feature: 'voice',
        model: transcription.model,
        tokens: { input: 0, cachedInput: 0, output: 0 },
        audioSeconds,
        costMicroUsd: audioCostMicroUsd(audioSeconds),
      });
      if (!transcript)
        return { transcript, changes: [], skipped: [], unclear: 'Nothing was heard.' };
      return apply(transcript);
    },
  };
}

export type HousekeepingNotePipeline = ReturnType<typeof createHousekeepingNotePipeline>;
