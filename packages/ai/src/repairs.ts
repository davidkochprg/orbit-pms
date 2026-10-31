import { accessDays } from '@orbit/domain';
import type { Contact, Inquiry, Language, Repair } from '@orbit/shared';
import { type Trade, tradeSchema, type WorkOrder } from '@orbit/shared';
import { generateText, type LanguageModel, Output } from 'ai';
import { z } from 'zod';
import { fromSdkUsage, tokenCostMicroUsd, type TokenUsage } from './cost';
import {
  type RepairReplyFacts,
  repairReplyPrompt,
  repairReplySystemPrompt,
  tradePrompt,
  tradeSystemPrompt,
  type WorkOrderFacts,
  workOrderPrompt,
  workOrderSystemPrompt,
} from './prompts/repairs';
import { reasoningEffort, type ReasoningEffort } from './reasoning';
import type { UsageStore } from './usage';

export type { RepairReplyFacts, WorkOrderFacts } from './prompts/repairs';

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

/** Drafts the hotel's answer to a contractor who wrote back about a repair (one model call). */
export async function draftRepairReply(model: LanguageModel, facts: RepairReplyFacts) {
  const result = await generateText({
    model,
    system: repairReplySystemPrompt,
    prompt: repairReplyPrompt(facts),
    temperature: 0.3,
    reasoning: reasoningEffort.draft,
  });
  return {
    // A subject line the model added anyway is dropped: the reply keeps the conversation's.
    text: result.text.trim().replace(/^(subject|předmět|betreff|temat)\s*:.*\n+/i, ''),
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

    async reply(facts: RepairReplyFacts): Promise<string> {
      const { text, tokens, modelId: servedBy } = await draftRepairReply(draftModel, facts);
      await record(tokens, servedBy);
      return text;
    },
  };
}

export type RepairDesk = ReturnType<typeof createRepairDesk>;

export interface WorkOrderDrafterDeps {
  desk: Pick<RepairDesk, 'workOrder'>;
  repair: (taskId: string) => Promise<Repair>;
  contact: (contactId: string) => Promise<Contact>;
  hotel: () => Promise<WorkOrderFacts['hotel']>;
  today: () => string;
}

/**
 * Writes the email asking a contractor to fix a repair, from the repair as it stands: the issue,
 * the room and when someone can get in. Shared by the repair card and the agent.
 */
export function createWorkOrderDrafter({
  desk,
  repair,
  contact,
  hotel,
  today,
}: WorkOrderDrafterDeps) {
  return async (taskId: string, contactId: string, signer: string | null): Promise<WorkOrder> => {
    const [r, c, profile] = await Promise.all([repair(taskId), contact(contactId), hotel()]);
    const draft = await desk.workOrder({
      hotel: profile,
      signer,
      contact: c,
      roomName: r.roomName,
      issue: r.task.notes ?? 'Repair',
      access: r.access,
      today: today(),
    });
    return { to: c.email, ...draft };
  };
}

export type WorkOrderDrafter = ReturnType<typeof createWorkOrderDrafter>;

export interface RepairReplierDeps extends Omit<WorkOrderDrafterDeps, 'desk'> {
  desk: Pick<RepairDesk, 'reply'>;
  /** The hotel's calendar day of a moment. */
  dayOf: (at: Date) => string;
}

/**
 * Writes the reply to a contractor's answer in a conversation about a repair, in their language,
 * with when the room is free day by day (`accessDays`) so a proposed time is checked against the
 * bookings. Returns the text and the language it is in.
 */
export function createRepairReplier({
  desk,
  repair,
  contact,
  hotel,
  today,
  dayOf,
}: RepairReplierDeps) {
  return async (
    inquiry: Inquiry,
    signer: string | null = null,
  ): Promise<{ text: string; language: Language }> => {
    if (!inquiry.taskId) throw new Error('This conversation is not about a repair');
    const r = await repair(inquiry.taskId);
    const asked = r.contact ?? (r.task.contactId ? await contact(r.task.contactId) : null);
    const to = asked ?? {
      name: inquiry.senderName ?? 'the contractor',
      person: null,
      language: 'en' as const,
    };
    const profile = await hotel();
    const now = today();
    const text = await desk.reply({
      hotel: profile,
      signer,
      contact: to,
      roomName: r.roomName,
      issue: r.task.notes ?? 'Repair',
      access: r.access,
      today: now,
      days: accessDays(r.access, now),
      messages: inquiry.messages.map((m) => ({
        from: m.direction === 'out' ? 'hotel' : 'contractor',
        date: dayOf(new Date(m.sentAt)),
        body: m.body,
      })),
    });
    return { text, language: to.language };
  };
}

export type RepairReplier = ReturnType<typeof createRepairReplier>;
