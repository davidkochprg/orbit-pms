import { normalizeTags } from '@orbit/domain';
import {
  type FiledNote,
  hotelInfoCategorySchema,
  type HotelInfoEntry,
  isoDateSchema,
  keepLinks,
  sameNoteTitle,
} from '@orbit/shared';
import { generateText, type LanguageModel, Output } from 'ai';
import { z } from 'zod';
import { fromSdkUsage, tokenCostMicroUsd } from './cost';
import { fileNotePrompt, fileNoteSystemPrompt } from './prompts/knowledge';
import { reasoningEffort, type ReasoningEffort } from './reasoning';
import type { UsageStore } from './usage';

/** What the model returns for a note staff described: where it goes and what it says. */
export const noteFilingSchema = z.object({
  /** The exact title of the existing note to fold it into, or null for a new note. */
  update: z.string().nullable(),
  folder: hotelInfoCategorySchema,
  title: z.string(),
  details: z.string(),
  tags: z.array(z.string()),
  until: isoDateSchema.nullable(),
});
export type NoteFiling = z.infer<typeof noteFilingSchema>;

export interface NoteToFile {
  text: string;
  notes: HotelInfoEntry[];
  today: string;
}

/**
 * The note to show staff, or null when the model's doesn't fit one. It updates the note the model
 * named, or the one with its title; links stay only where they name another existing note.
 */
export function toFiledNote(filing: NoteFiling, notes: HotelInfoEntry[], today: string) {
  const title = filing.title.trim();
  const details = filing.details.trim();
  if (!title || !details || title.length > 80 || details.length > 1000) return null;
  const until = filing.until && filing.until >= today ? filing.until : null;
  const named = (t: string | null) =>
    t ? notes.find((n) => sameNoteTitle(n.title, t)) : undefined;
  const found = named(filing.update) ?? named(title);
  // A notice is its own note: a lasting note should not end with it.
  const target = found && !(until && !found.until) ? found : undefined;
  // Titles stay unique, so only the note it updates may already have this one.
  if (notes.some((n) => n !== target && sameNoteTitle(n.title, title))) return null;
  const linkable = (t: string) =>
    !sameNoteTitle(t, title) && notes.some((n) => n !== target && sameNoteTitle(n.title, t));
  const filed: FiledNote = {
    id: target?.id ?? null,
    draft: {
      category: filing.folder,
      title,
      details: keepLinks(details, linkable),
      tags: normalizeTags(filing.tags).filter((t) => t.length <= 24),
      until,
    },
  };
  return filed;
}

/** Files one note staff described (one model call). */
export async function fileNote(
  model: LanguageModel,
  { reasoning = reasoningEffort.knowledge, ...input }: NoteToFile & { reasoning?: ReasoningEffort },
) {
  const result = await generateText({
    model,
    system: fileNoteSystemPrompt,
    prompt: fileNotePrompt(input),
    output: Output.object({ schema: noteFilingSchema }),
    temperature: 0,
    reasoning,
    providerOptions: { meta: { strictJsonSchema: false } },
  });
  return {
    filed: toFiledNote(result.output, input.notes, input.today),
    tokens: fromSdkUsage(result.usage),
  };
}

export interface NoteFilerDeps {
  model: LanguageModel;
  modelId: string;
  usage: UsageStore;
}

/**
 * Knowledge's librarian: staff describe a rule or a service in their own words, and it comes back
 * titled, filed in a folder, tagged and linked, or folded into the note that covers it. Only
 * suggests: staff see the note and save it themselves.
 */
export function createNoteFiler({ model, modelId, usage }: NoteFilerDeps) {
  return {
    async file(input: NoteToFile): Promise<FiledNote | null> {
      const { filed, tokens } = await fileNote(model, input);
      await usage.record({
        feature: 'knowledge',
        model: modelId,
        tokens,
        audioSeconds: 0,
        costMicroUsd: tokenCostMicroUsd(tokens),
      });
      return filed;
    },
  };
}

export type NoteFiler = ReturnType<typeof createNoteFiler>;
