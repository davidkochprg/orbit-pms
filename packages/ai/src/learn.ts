import {
  type HotelInfoDraft,
  hotelInfoCategorySchema,
  type HotelInfoEntry,
  isoDateSchema,
} from '@orbit/shared';
import { generateText, type LanguageModel, Output } from 'ai';
import { z } from 'zod';
import { fromSdkUsage, tokenCostMicroUsd } from './cost';
import { learnPrompt, learnSystemPrompt } from './prompts/learn';
import { reasoningEffort } from './reasoning';
import type { UsageStore } from './usage';

/** What the model returns: whether the reply holds a new fact, and the fact. */
export const learnedFactSchema = z.object({
  save: z.boolean(),
  category: hotelInfoCategorySchema,
  title: z.string(),
  details: z.string(),
  until: isoDateSchema.nullable(),
});
export type LearnedFact = z.infer<typeof learnedFactSchema>;

export interface ReplyToLearnFrom {
  guestMessage: string;
  reply: string;
  entries: Pick<HotelInfoEntry, 'title' | 'details'>[];
  today: string;
}

/** The fact to save, or null when there is none or it doesn't fit an entry. */
export function toDraft(fact: LearnedFact, today: string): HotelInfoDraft | null {
  const title = fact.title.trim();
  const details = fact.details.trim();
  if (!fact.save || !title || !details || title.length > 80 || details.length > 600) return null;
  return {
    category: fact.category,
    title,
    details,
    until: fact.until && fact.until >= today ? fact.until : null,
  };
}

/** Reads one sent reply for a fact worth keeping (one model call). */
export async function learnFromReply(model: LanguageModel, input: ReplyToLearnFrom) {
  const result = await generateText({
    model,
    system: learnSystemPrompt,
    prompt: learnPrompt(input),
    output: Output.object({ schema: learnedFactSchema }),
    temperature: 0,
    reasoning: reasoningEffort.learn,
    providerOptions: { meta: { strictJsonSchema: false } },
  });
  return { draft: toDraft(result.output, input.today), tokens: fromSdkUsage(result.usage) };
}

export interface ReplyLearnerDeps {
  model: LanguageModel;
  modelId: string;
  usage: UsageStore;
}

/**
 * Notices when staff tell a guest something the hotel information lacks, so it can be saved for
 * the next guest who asks. Only suggests: saving is a pending action staff confirm.
 */
export function createReplyLearner({ model, modelId, usage }: ReplyLearnerDeps) {
  return {
    async learn(input: ReplyToLearnFrom): Promise<HotelInfoDraft | null> {
      const { draft, tokens } = await learnFromReply(model, input);
      await usage.record({
        feature: 'learn',
        model: modelId,
        tokens,
        audioSeconds: 0,
        costMicroUsd: tokenCostMicroUsd(tokens),
      });
      return draft;
    },
  };
}

export type ReplyLearner = ReturnType<typeof createReplyLearner>;
