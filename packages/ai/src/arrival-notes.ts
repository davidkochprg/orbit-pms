import type { ArrivalNote } from '@orbit/shared';
import { generateText, type LanguageModel } from 'ai';
import { fromSdkUsage, tokenCostMicroUsd } from './cost';
import { amountsInText } from './price-guard';
import {
  type ArrivalNoteFacts,
  arrivalNotePrompt,
  arrivalNoteSystemPrompt,
} from './prompts/arrival-notes';
import { type HotelContext, hotelFacts } from './prompts/hotel';
import { reasoningEffort } from './reasoning';
import { parseWorkOrder } from './repairs';
import type { UsageStore } from './usage';

export type { ArrivalNoteFacts } from './prompts/arrival-notes';

export class ArrivalNoteError extends Error {}

/** Amounts in the note that the hotel facts don't state, or whatever makes it unusable. */
export function arrivalNoteProblems(note: ArrivalNote, stated: number[]): string[] {
  const problems: string[] = [];
  if (!note.subject) problems.push('it has no subject line');
  if (!note.body) problems.push('it is empty');
  if (/\*\*|^#{1,6} /m.test(note.body)) problems.push('it uses Markdown');
  const unknown = amountsInText(`${note.subject}\n${note.body}`).filter((a) => !stated.includes(a));
  if (unknown.length > 0) {
    problems.push(`it states amounts the facts don't (${[...new Set(unknown)].join(', ')})`);
  }
  return problems;
}

/** Drafts the email before a stay (one model call). */
export async function draftArrivalNote(
  model: LanguageModel,
  hotel: HotelContext,
  facts: ArrivalNoteFacts,
  feedback?: string,
) {
  const result = await generateText({
    model,
    system: arrivalNoteSystemPrompt(hotel),
    prompt: arrivalNotePrompt(facts, hotel, feedback),
    temperature: 0.4,
    reasoning: reasoningEffort.draft,
  });
  return {
    ...parseWorkOrder(result.text),
    tokens: fromSdkUsage(result.usage),
    modelId: result.response.modelId,
  };
}

/**
 * Writes notes before a stay on the draft model (Muse Spark Open when configured). A note that
 * states an amount the hotel facts don't, or isn't a plain email, is written once more with the
 * reason, then refused. Staff read and send it; nothing is sent here.
 */
export function createArrivalNoteWriter({
  model,
  usage,
  hotelContext,
}: {
  model: LanguageModel;
  usage: UsageStore;
  hotelContext: () => Promise<HotelContext>;
}) {
  return {
    async write(facts: ArrivalNoteFacts): Promise<ArrivalNote> {
      const hotel = await hotelContext();
      const stated = amountsInText(hotelFacts(hotel));
      let feedback: string | undefined;
      for (let attempt = 0; attempt < 2; attempt++) {
        const { subject, body, tokens, modelId } = await draftArrivalNote(
          model,
          hotel,
          facts,
          feedback,
        );
        await usage.record({
          feature: 'arrival_note',
          model: modelId,
          tokens,
          audioSeconds: 0,
          costMicroUsd: tokenCostMicroUsd(tokens),
        });
        const problems = arrivalNoteProblems({ subject, body }, stated);
        if (problems.length === 0) return { subject, body };
        feedback = `${problems.join('; ')}.`;
      }
      throw new ArrivalNoteError('The note could not be written without mistakes. Try again.');
    },
  };
}

export type ArrivalNoteWriter = ReturnType<typeof createArrivalNoteWriter>;
