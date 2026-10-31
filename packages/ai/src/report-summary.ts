import type { Currency, Report } from '@orbit/shared';
import { generateText, type LanguageModel } from 'ai';
import { fromSdkUsage, tokenCostMicroUsd } from './cost';
import {
  reportFacts,
  reportSummaryPrompt,
  reportSummarySystemPrompt,
} from './prompts/report-summary';
import { reasoningEffort } from './reasoning';
import type { UsageStore } from './usage';

/** The model wrote numbers the report doesn't have, twice. */
export class ReportSummaryError extends Error {}

/** Every number in a text, without thousands separators: "$131,271" is 131271, "3.5" stays. */
export function numbersIn(text: string): string[] {
  return [...text.matchAll(/\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g)].map((m) =>
    m[0].replace(/,/g, ''),
  );
}

/** Numbers in the summary that the facts don't state. */
export function unknownNumbers(summary: string, facts: string): string[] {
  const known = new Set(numbersIn(facts));
  return [...new Set(numbersIn(summary).filter((n) => !known.has(n)))];
}

/**
 * A few sentences on a period's report against the period before (one model call at minimal
 * reasoning). Every figure is worked out in `reportFacts`; a summary with a number the facts
 * don't state is written once more with the reason, then refused.
 */
export function createReportSummaryWriter({
  model,
  modelId,
  usage,
}: {
  model: LanguageModel;
  modelId: string;
  usage: UsageStore;
}) {
  return {
    async write(
      report: Report,
      previous: Report | null,
      currency: Currency,
      today: string,
    ): Promise<string> {
      const facts = reportFacts(report, previous, currency, today);
      let feedback: string | undefined;
      for (let attempt = 0; attempt < 2; attempt++) {
        const result = await generateText({
          model,
          system: reportSummarySystemPrompt,
          prompt: reportSummaryPrompt(facts, feedback),
          temperature: 0,
          reasoning: reasoningEffort.reportSummary,
        });
        const tokens = fromSdkUsage(result.usage);
        await usage.record({
          feature: 'report_summary',
          model: modelId,
          tokens,
          audioSeconds: 0,
          costMicroUsd: tokenCostMicroUsd(tokens),
        });
        const text = result.text.trim();
        const unknown = unknownNumbers(text, facts);
        if (text && unknown.length === 0) return text;
        feedback = text
          ? `it states numbers that are not in the facts (${unknown.join(', ')}).`
          : 'it was empty.';
      }
      throw new ReportSummaryError('The summary could not be checked against the report.');
    },
  };
}

export type ReportSummaryWriter = ReturnType<typeof createReportSummaryWriter>;
