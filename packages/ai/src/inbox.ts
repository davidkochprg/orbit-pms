import type { HotelService, InboxService } from '@orbit/domain';
import {
  type Inquiry,
  type InquiryExtraction,
  inquiryExtractionSchema,
  type IsoDate,
  type StayOption,
} from '@orbit/shared';
import { generateText, type LanguageModel, Output } from 'ai';
import { fromSdkUsage, tokenCostMicroUsd, type TokenUsage } from './cost';
import type { HotelProfile } from './hotel';
import { checkDraftPrices } from './price-guard';
import {
  draftPrompt,
  draftSystemPrompt,
  extractionPrompt,
  extractionSystemPrompt,
} from './prompts/inbox';
import type { AiFeature, UsageStore } from './usage';

export interface InboxPipelineDeps {
  model: LanguageModel;
  modelId: string;
  hotel: HotelService;
  inbox: InboxService;
  profile: HotelProfile;
  usage: UsageStore;
  /** False once the monthly AI budget is spent. */
  canSpend: () => Promise<boolean>;
  today: () => IsoDate;
}

export async function extractMessage(model: LanguageModel, inquiry: Inquiry, today: IsoDate) {
  const result = await generateText({
    model,
    system: extractionSystemPrompt,
    prompt: extractionPrompt(inquiry, today),
    output: Output.object({ schema: inquiryExtractionSchema }),
    temperature: 0,
    // Meta constrains output to the schema either way; strict mode only adds a server-side check
    // against a JSON Schema subset that may reject keywords zod emits (format, minimum, $schema).
    providerOptions: { meta: { strictJsonSchema: false } },
  });
  return { analysis: result.output, tokens: fromSdkUsage(result.usage) };
}

export async function draftReply(
  model: LanguageModel,
  profile: HotelProfile,
  params: Parameters<typeof draftPrompt>[0],
) {
  const result = await generateText({
    model,
    system: draftSystemPrompt(profile),
    prompt: draftPrompt(params),
    temperature: 0.3,
  });
  return { draft: result.text.trim(), tokens: fromSdkUsage(result.usage) };
}

/**
 * Prepares a message for staff: extract the request (one model call), find rooms and prices in
 * the domain (no model), then draft a reply (one model call, plus one retry if the draft's
 * prices don't match the quotes). Results are stored, so each message is processed once.
 */
export function createInboxPipeline(deps: InboxPipelineDeps) {
  const { model, modelId, hotel, inbox, profile, usage, canSpend, today } = deps;

  async function record(feature: AiFeature, tokens: TokenUsage) {
    await usage.record({
      feature,
      model: modelId,
      tokens,
      audioSeconds: 0,
      costMicroUsd: tokenCostMicroUsd(tokens),
    });
  }

  async function draftWithGuard(
    inquiry: Inquiry,
    analysis: InquiryExtraction,
    options: StayOption[],
    note: string | null,
  ): Promise<{ draft: string | null; note: string | null }> {
    let feedback: string | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      const { draft, tokens } = await draftReply(model, profile, {
        inquiry,
        analysis,
        options,
        note,
        ...(feedback && { feedback }),
      });
      await record('inbox_draft', tokens);
      const check = checkDraftPrices(draft, options);
      if (check.ok) return { draft, note };
      feedback = [
        check.unexpected.length
          ? `it stated amounts that are not in the options (${check.unexpected.join(', ')})`
          : '',
        check.missing.length ? `it left out totals (${check.missing.join(', ')})` : '',
      ]
        .filter(Boolean)
        .join(' and ');
    }
    return {
      draft: null,
      note: [note, 'No draft: the generated reply quoted prices that did not match.']
        .filter(Boolean)
        .join(' '),
    };
  }

  return {
    /** Processes a message unless it already has a result. `force` re-runs it. */
    async process(id: string, { force = false } = {}): Promise<Inquiry> {
      const inquiry = await inbox.get(id);
      if (inquiry.processedAt && !inquiry.processingError && !force) return inquiry;
      if (!(await canSpend())) {
        return inbox.saveProcessing(id, {
          ok: false,
          error: 'The AI budget for this month is used up.',
        });
      }
      try {
        const { analysis, tokens } = await extractMessage(model, inquiry, today());
        await record('inbox_extract', tokens);
        const { options, note } = await hotel.inboxOptions(analysis);
        const { draft, note: finalNote } =
          analysis.kind === 'other'
            ? { draft: null, note }
            : await draftWithGuard(inquiry, analysis, options, note);
        return await inbox.saveProcessing(id, {
          ok: true,
          parsed: analysis,
          suggestion: {
            options,
            note: finalNote,
            draft,
            draftLanguage: draft ? analysis.language : null,
          },
        });
      } catch (err) {
        return inbox.saveProcessing(id, {
          ok: false,
          error: err instanceof Error ? err.message : 'Processing failed',
        });
      }
    },
  };
}

export type InboxPipeline = ReturnType<typeof createInboxPipeline>;
