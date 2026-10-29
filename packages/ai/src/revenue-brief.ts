import type { RevenueOutlook } from '@orbit/shared';
import { generateText, type LanguageModel } from 'ai';
import { fromSdkUsage, tokenCostMicroUsd } from './cost';
import { compactOutlook, outlookPercents, unknownPercents } from './outlook';
import { revenueBriefPrompt, revenueBriefSystemPrompt } from './prompts/revenue';
import { reasoningEffort } from './reasoning';
import type { UsageStore } from './usage';

/** The model wrote a percent the outlook doesn't have, twice. */
export class RevenueBriefError extends Error {}

/** Only nights that need a word: a suggested change, an event, or likely no-shows. */
function notable(outlook: RevenueOutlook): RevenueOutlook {
  return {
    ...outlook,
    nights: outlook.nights.filter(
      (n) =>
        n.suggestedPercent !== n.currentPercent ||
        n.events.length > 0 ||
        n.factors.some((f) => f.kind === 'demand') ||
        n.expectedNoShows >= 0.5,
    ),
  };
}

export interface RevenueBriefDeps {
  model: LanguageModel;
  modelId: string;
  usage: UsageStore;
}

/**
 * A few sentences on the rate outlook, from the outlook alone (one model call). Every percent in
 * the text must be one the outlook states; otherwise it is written again once, then refused.
 */
export function createRevenueBriefWriter({ model, modelId, usage }: RevenueBriefDeps) {
  return {
    async write(outlook: RevenueOutlook): Promise<string> {
      const data = notable(outlook);
      const known = outlookPercents(data);
      for (let attempt = 0; attempt < 2; attempt++) {
        const result = await generateText({
          model,
          system: revenueBriefSystemPrompt,
          prompt: revenueBriefPrompt(compactOutlook(data)),
          temperature: 0,
          reasoning: reasoningEffort.revenueBrief,
        });
        const tokens = fromSdkUsage(result.usage);
        await usage.record({
          feature: 'rate_brief',
          model: modelId,
          tokens,
          audioSeconds: 0,
          costMicroUsd: tokenCostMicroUsd(tokens),
        });
        const text = result.text.trim();
        if (text && unknownPercents(text, known).length === 0) return text;
      }
      throw new RevenueBriefError('The summary stated rates that are not in the outlook');
    },
  };
}

export type RevenueBriefWriter = ReturnType<typeof createRevenueBriefWriter>;
