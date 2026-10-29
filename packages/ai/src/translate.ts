import type { Language } from '@orbit/shared';
import { generateText, type LanguageModel } from 'ai';
import { fromSdkUsage, tokenCostMicroUsd, type TokenUsage } from './cost';
import { amountsInText } from './price-guard';
import { languageNames } from './prompts/inbox';
import { reasoningEffort } from './reasoning';
import type { UsageStore } from './usage';

export function translateSystemPrompt(to: Language): string {
  return `You translate messages between a small hotel and its guests into ${languageNames[to]}.
- Keep the meaning, the tone and the line breaks.
- Keep names, email addresses, dates, room numbers and every amount with its currency exactly as written: "$1,250" stays "$1,250" and "12 500 CZK" stays "12 500 CZK".
- If the text is already in ${languageNames[to]}, return it unchanged.
- Output only the translation, nothing before or after it.`;
}

/** Whether the translation states the same amounts as the source, however often each. */
export function sameAmounts(source: string, translation: string): boolean {
  const sorted = (text: string) =>
    amountsInText(text)
      .sort((a, b) => a - b)
      .join(',');
  return sorted(source) === sorted(translation);
}

export class TranslationError extends Error {}

export interface TranslatorDeps {
  model: LanguageModel;
  modelId: string;
  usage: UsageStore;
  /** False once the monthly AI budget is spent. */
  canSpend: () => Promise<boolean>;
}

/**
 * Translates guest messages and reply drafts. It runs only when staff ask for it, at minimal
 * reasoning, and a translation that changes an amount is redone once and otherwise refused.
 */
export function createTranslator({ model, modelId, usage, canSpend }: TranslatorDeps) {
  /** `servedBy` is the model that answered, which differs from `modelId` after a fallback. */
  async function record(tokens: TokenUsage, servedBy = modelId) {
    await usage.record({
      feature: 'translate',
      model: servedBy,
      tokens,
      audioSeconds: 0,
      costMicroUsd: tokenCostMicroUsd(tokens),
    });
  }

  return {
    async translate(text: string, to: Language): Promise<string> {
      if (!(await canSpend()))
        throw new TranslationError('The AI budget for this month is used up.');
      let prompt = text;
      for (let attempt = 0; attempt < 2; attempt++) {
        const result = await generateText({
          model,
          system: translateSystemPrompt(to),
          prompt,
          temperature: 0,
          reasoning: reasoningEffort.translate,
        });
        await record(fromSdkUsage(result.usage), result.response.modelId);
        const translation = result.text.trim();
        if (sameAmounts(text, translation)) return translation;
        prompt = `${text}\n\n(Your previous translation changed an amount. Copy every amount and currency exactly.)`;
      }
      throw new TranslationError(
        'The translation changed an amount, so it was not used. Try again.',
      );
    },
  };
}

export type Translator = ReturnType<typeof createTranslator>;
