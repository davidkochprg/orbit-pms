import { type GuestMemoryItem, guestMemoryReadingSchema } from '@orbit/shared';
import { generateText, type LanguageModel, Output } from 'ai';
import { fromSdkUsage, tokenCostMicroUsd } from './cost';
import { guestMemoryPrompt, guestMemorySystemPrompt } from './prompts/guest-memory';
import { reasoningEffort, type ReasoningEffort } from './reasoning';
import type { UsageStore } from './usage';

/** At most this many items are kept, each at most this long. */
const MAX_ITEMS = 5;
const MAX_ITEM_LENGTH = 160;

/** Reads a guest's history into what to remember (one structured-output call). */
export async function readGuestMemory(
  model: LanguageModel,
  source: string,
  reasoning: ReasoningEffort = reasoningEffort.guestMemory,
) {
  const result = await generateText({
    model,
    system: guestMemorySystemPrompt,
    prompt: guestMemoryPrompt(source),
    output: Output.object({ schema: guestMemoryReadingSchema }),
    temperature: 0,
    reasoning,
    providerOptions: { meta: { strictJsonSchema: false } },
  });
  return { items: tidyMemory(result.output.items), tokens: fromSdkUsage(result.usage) };
}

/** Trims items, drops empty and repeated ones and keeps the first five. */
export function tidyMemory(items: GuestMemoryItem[]): GuestMemoryItem[] {
  const seen = new Set<string>();
  return items
    .map((i) => ({ ...i, text: i.text.trim().replace(/\s+/g, ' ') }))
    .filter((i) => {
      const key = i.text.toLowerCase();
      if (!i.text || i.text.length > MAX_ITEM_LENGTH || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_ITEMS);
}

/**
 * Reads guests' histories into short memories for the front desk. It changes nothing a guest
 * booked, only what staff see, so it needs no confirmation.
 */
export function createGuestMemoryReader({
  model,
  modelId,
  usage,
}: {
  model: LanguageModel;
  modelId: string;
  usage: UsageStore;
}) {
  return {
    async read(source: string): Promise<GuestMemoryItem[]> {
      const { items, tokens } = await readGuestMemory(model, source);
      await usage.record({
        feature: 'guest_memory',
        model: modelId,
        tokens,
        audioSeconds: 0,
        costMicroUsd: tokenCostMicroUsd(tokens),
      });
      return items;
    },
  };
}

export type GuestMemoryReader = ReturnType<typeof createGuestMemoryReader>;
