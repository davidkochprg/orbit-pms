import { type Trade, tradeSchema, type WorkOrder } from '@orbit/shared';
import { generateText, type LanguageModel, Output } from 'ai';
import { z } from 'zod';
import { fromSdkUsage, tokenCostMicroUsd, type TokenUsage } from './cost';
import {
  tradePrompt,
  tradeSystemPrompt,
  type WorkOrderFacts,
  workOrderPrompt,
  workOrderSystemPrompt,
} from './prompts/repairs';
import { reasoningEffort, type ReasoningEffort } from './reasoning';
import type { UsageStore } from './usage';

export type { WorkOrderFacts } from './prompts/repairs';

const tradeReadingSchema = z.object({ trade: tradeSchema.nullable() });

/** Who fixes what a repair note describes (one model call). */
export async function readTrade(
  model: LanguageModel,
  issue: string,
  reasoning: ReasoningEffort = reasoningEffort.repairs,
) {
  const result = await generateText({
    model,
    system: tradeSystemPrompt,
    prompt: tradePrompt(issue),
    output: Output.object({ schema: tradeReadingSchema }),
    temperature: 0,
    reasoning,
    providerOptions: { meta: { strictJsonSchema: false } },
  });
  return { trade: result.output.trade, tokens: fromSdkUsage(result.usage) };
}

/**
 * The subject and body of a drafted email. Models sometimes wrap the subject line in markdown;
 * without a subject line the first line of the text is used.
 */
export function parseWorkOrder(text: string): Pick<WorkOrder, 'subject' | 'body'> {
  const lines = text.trim().split('\n');
  const first = (lines[0] ?? '').replace(/^[*#\s]+|\*+$/g, '');
  const match = /^(subject|předmět|betreff|temat)\s*:\s*(.+)$/i.exec(first);
  return {
    subject: (match ? match[2]! : first).trim(),
    body: lines.slice(1).join('\n').trim(),
  };
}

/** Drafts the email asking a contractor to come (one model call). */
export async function draftWorkOrder(model: LanguageModel, facts: WorkOrderFacts) {
  const result = await generateText({
    model,
    system: workOrderSystemPrompt,
    prompt: workOrderPrompt(facts),
    temperature: 0.3,
    reasoning: reasoningEffort.draft,
  });
  return {
    ...parseWorkOrder(result.text),
    tokens: fromSdkUsage(result.usage),
    modelId: result.response.modelId,
  };
}

export interface RepairDeskDeps {
  model: LanguageModel;
  modelId: string;
  /** Writes the emails: Muse Spark Open when configured, otherwise the agent model. */
  draftModel: LanguageModel;
  usage: UsageStore;
}

/** Sorts repairs by trade and drafts the emails that ask a contractor to come. */
export function createRepairDesk({ model, modelId, draftModel, usage }: RepairDeskDeps) {
  const record = (tokens: TokenUsage, model: string) =>
    usage.record({
      feature: 'repairs',
      model,
      tokens,
      audioSeconds: 0,
      costMicroUsd: tokenCostMicroUsd(tokens),
    });

  return {
    async trade(issue: string): Promise<Trade | null> {
      const { trade, tokens } = await readTrade(model, issue);
      await record(tokens, modelId);
      return trade;
    },

    async workOrder(facts: WorkOrderFacts): Promise<Pick<WorkOrder, 'subject' | 'body'>> {
      const { subject, body, tokens, modelId: servedBy } = await draftWorkOrder(draftModel, facts);
      await record(tokens, servedBy);
      return { subject, body };
    },
  };
}

export type RepairDesk = ReturnType<typeof createRepairDesk>;
