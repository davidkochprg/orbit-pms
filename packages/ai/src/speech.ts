import { audioCostMicroUsd } from './cost';
import { type TranscriptionConfig, transcribeWav } from './transcribe';
import type { UsageStore } from './usage';

/** Meta's speech-to-text takes a short list of words to listen for; more is not better. */
export const MAX_KEYWORDS = 100;

/**
 * Words a spoken question to the agent is likely to contain that a speech model would get wrong:
 * the names of guests staying around now first, then room names that aren't plain numbers.
 * Unique, at most `MAX_KEYWORDS`.
 */
export function speechKeywords(guestNames: string[], roomNames: string[]): string[] {
  const words = [...guestNames, ...roomNames.filter((r) => !/^\d+$/.test(r))]
    .map((w) => w.trim())
    .filter(Boolean);
  return [...new Set(words)].slice(0, MAX_KEYWORDS);
}

/** Turns a spoken question into text for the agent, recorded as `agent_voice` usage. */
export function createSpeechInput({
  transcription,
  usage,
}: {
  transcription: TranscriptionConfig;
  usage: UsageStore;
}) {
  return {
    async transcribe(wav: Uint8Array<ArrayBuffer>, keywords: string[]): Promise<string> {
      const { transcript, audioSeconds } = await transcribeWav(transcription, wav, { keywords });
      await usage.record({
        feature: 'agent_voice',
        model: transcription.model,
        tokens: { input: 0, cachedInput: 0, output: 0 },
        audioSeconds,
        costMicroUsd: audioCostMicroUsd(audioSeconds),
      });
      // The model sometimes ends on stray punctuation, e.g. "…is clean.,".
      return transcript.replace(/[\s,;]+$/, '').replace(/\.{2,}$/, '.');
    },
  };
}

export type SpeechInput = ReturnType<typeof createSpeechInput>;
