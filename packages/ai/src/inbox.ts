import { type HotelService, type InboxService, summarizeBlock } from '@orbit/domain';
import {
  type Inquiry,
  type InquiryExtraction,
  inquiryExtractionSchema,
  type IsoDate,
  type Language,
  type RoomBlock,
  type StayOption,
  type Translation,
} from '@orbit/shared';
import { generateText, type LanguageModel, Output } from 'ai';
import { fromSdkUsage, tokenCostMicroUsd, type TokenUsage } from './cost';
import { amountsInText, checkDraftPrices } from './price-guard';
import { type HotelContext, hotelFacts } from './prompts/hotel';
import { reasoningEffort, type ReasoningEffort } from './reasoning';
import {
  draftPrompt,
  draftSystemPrompt,
  extractionPrompt,
  extractionSystemPrompt,
  holdExpiry,
} from './prompts/inbox';
import type { Translator } from './translate';
import type { AiFeature, UsageStore } from './usage';

/** A room held for the guest from this message, and when the hold ends (ISO). */
interface HeldRoom {
  option: StayOption;
  until: string | null;
}

/** A block of rooms held for the guest, and when the first of its holds ends (ISO). */
interface HeldBlock {
  block: RoomBlock;
  until: string | null;
}

export interface InboxPipelineDeps {
  /** Extracts the request; needs structured output. */
  model: LanguageModel;
  /** Writes the reply; the extraction model when unset. */
  draftModel?: LanguageModel;
  modelId: string;
  hotel: HotelService;
  inbox: InboxService;
  /** Read for every draft, so edits in Settings apply to the next reply. */
  hotelContext: () => Promise<HotelContext>;
  usage: UsageStore;
  /** False once the monthly AI budget is spent. */
  canSpend: () => Promise<boolean>;
  today: () => IsoDate;
  /** Puts the draft into the staff member's language, to read side by side. */
  translator: Translator;
}

export async function extractMessage(
  model: LanguageModel,
  inquiry: Inquiry,
  today: IsoDate,
  reasoning: ReasoningEffort = reasoningEffort.extraction,
) {
  const result = await generateText({
    model,
    system: extractionSystemPrompt,
    prompt: extractionPrompt(inquiry, today),
    output: Output.object({ schema: inquiryExtractionSchema }),
    temperature: 0,
    reasoning,
    // Meta constrains output to the schema either way; strict mode only adds a server-side check
    // against a JSON Schema subset that may reject keywords zod emits (format, minimum, $schema).
    providerOptions: { meta: { strictJsonSchema: false } },
  });
  return { analysis: result.output, tokens: fromSdkUsage(result.usage) };
}

export async function draftReply(
  model: LanguageModel,
  hotel: HotelContext,
  params: Parameters<typeof draftPrompt>[0],
) {
  const result = await generateText({
    model,
    system: draftSystemPrompt(hotel),
    prompt: draftPrompt(params),
    temperature: 0.3,
    reasoning: reasoningEffort.draft,
  });
  return {
    draft: result.text.trim(),
    tokens: fromSdkUsage(result.usage),
    modelId: result.response.modelId,
  };
}

/**
 * Prepares a conversation for staff when they ask for it, in two steps. `read` extracts the
 * request (one model call) and finds rooms and prices in the domain (no model), so staff can
 * choose before anything is written. `draft` writes the reply from that reading and whatever room
 * staff hold (one model call, plus one retry if the draft's prices don't match the quotes), and
 * translates it into the staff member's language when it differs from the guest's (one cheap
 * call). `process` runs both. Results are stored, so a conversation is read once until the guest
 * writes again.
 */
/**
 * Whether the conversation's reading answers its latest message: a guest writing again clears
 * `processedAt`, and the old reading no longer counts.
 */
export function hasReading(
  inquiry: Inquiry,
): inquiry is Inquiry & { parsed: InquiryExtraction; processedAt: string } {
  return inquiry.parsed !== null && inquiry.processedAt !== null && !inquiry.processingError;
}

export function createInboxPipeline(deps: InboxPipelineDeps) {
  const { model, modelId, hotel, inbox, hotelContext, usage, canSpend, today, translator } = deps;
  const draftModel = deps.draftModel ?? model;

  /** `servedBy` is the model that answered, which differs from `modelId` after a fallback. */
  async function record(feature: AiFeature, tokens: TokenUsage, servedBy = modelId) {
    await usage.record({
      feature,
      model: servedBy,
      tokens,
      audioSeconds: 0,
      costMicroUsd: tokenCostMicroUsd(tokens),
    });
  }

  /** A booking while it is a hold, as an option priced at its quote. */
  async function asHeld(bookingId: string): Promise<HeldRoom | null> {
    const { booking, room, roomType } = await hotel.getBookingDetail(bookingId);
    if (booking.status !== 'hold' || !booking.priceSnapshot) return null;
    return {
      option: {
        roomId: room.id,
        roomName: room.name,
        roomTypeName: roomType.name,
        kind: room.kind,
        quote: booking.priceSnapshot,
      },
      until: booking.holdExpiresAt,
    };
  }

  /** The message's hold, while it is one. */
  async function heldRoom(inquiry: Inquiry): Promise<HeldRoom | null> {
    if (!inquiry.bookingId || inquiry.blockBookingIds.length > 1) return null;
    return asHeld(inquiry.bookingId);
  }

  /** The message's block of holds, while every one of them is still a hold. */
  async function heldBlock(inquiry: Inquiry): Promise<HeldBlock | null> {
    if (inquiry.blockBookingIds.length < 2) return null;
    const holds = await Promise.all(inquiry.blockBookingIds.map(asHeld));
    if (holds.some((h) => !h)) return null;
    const rooms = holds.filter((h): h is HeldRoom => h !== null);
    const ends = rooms.map((h) => h.until).filter((u): u is string => u !== null);
    return {
      block: summarizeBlock(rooms.map((h) => h.option)),
      until: ends.sort()[0] ?? null,
    };
  }

  /**
   * The rooms for a reading, as of now: a room staff already hold is no longer free, so it is
   * added back and leads the options, and a block staff hold replaces the block on offer.
   */
  async function roomsFor(inquiry: Inquiry, analysis: InquiryExtraction) {
    const { options: free, block: freeBlock, note } = await hotel.inboxOptions(analysis);
    const held = await heldRoom(inquiry);
    const options = held
      ? [held.option, ...free.filter((o) => o.roomId !== held.option.roomId)]
      : free;
    const heldRooms = await heldBlock(inquiry);
    const block = heldRooms?.block ?? freeBlock;
    return { options, block, note: heldRooms ? null : note, held, heldRooms };
  }

  async function draftWithGuard(
    inquiry: Inquiry,
    analysis: InquiryExtraction,
    offer: { options: StayOption[]; block: RoomBlock | null },
    note: string | null,
    held: { until: string | null } | null,
  ): Promise<{ draft: string | null; note: string | null }> {
    const { options, block } = offer;
    const context = await hotelContext();
    const until = held?.until ? holdExpiry(held.until, context.profile.country) : null;
    // Fees the profile states may be repeated; every other amount must come from a quote.
    const stated = amountsInText(hotelFacts(context));
    let feedback: string | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      const {
        draft,
        tokens,
        modelId: servedBy,
      } = await draftReply(draftModel, context, {
        inquiry,
        analysis,
        options,
        block,
        note,
        held: held && { until },
        ...(feedback && { feedback }),
      });
      await record('inbox_draft', tokens, servedBy);
      const check = checkDraftPrices(draft, options, stated, block);
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

  const failed = (id: string, err: unknown) =>
    inbox.saveProcessing(id, {
      ok: false,
      error: err instanceof Error ? err.message : 'Processing failed',
    });
  const budgetSpent = (id: string) =>
    inbox.saveProcessing(id, { ok: false, error: 'The AI budget for this month is used up.' });

  /** Extracts the request and finds its rooms; a draft from an earlier reading is dropped. */
  async function read(id: string, { force = false }: { force?: boolean } = {}): Promise<Inquiry> {
    const inquiry = await inbox.get(id);
    if (hasReading(inquiry) && !force) return inquiry;
    if (!(await canSpend())) return budgetSpent(id);
    try {
      const { analysis, tokens } = await extractMessage(model, inquiry, today());
      await record('inbox_extract', tokens);
      const { options, block, note } = await roomsFor(inquiry, analysis);
      return await inbox.saveProcessing(id, {
        ok: true,
        parsed: analysis,
        suggestion: {
          options,
          block,
          note,
          draft: null,
          draftLanguage: null,
          draftTranslation: null,
        },
      });
    } catch (err) {
      return failed(id, err);
    }
  }

  /**
   * Writes the reply from the stored reading and the room staff hold now, reading the request
   * first if nobody has. Rooms are looked up again, so the draft offers what is free now.
   */
  async function draft(
    id: string,
    { language = null }: { language?: Language | null } = {},
  ): Promise<Inquiry> {
    let inquiry = await inbox.get(id);
    if (!hasReading(inquiry)) {
      inquiry = await read(id, { force: true });
      if (!hasReading(inquiry)) return inquiry;
    }
    const analysis = inquiry.parsed;
    if (!(await canSpend())) return budgetSpent(id);
    try {
      const { options, block, note, held, heldRooms } = await roomsFor(inquiry, analysis);
      // A held room or block is the only offer.
      const offer = heldRooms
        ? { options: [], block: heldRooms.block }
        : { options: held ? [held.option] : options, block: held ? null : block };
      const { draft: text, note: finalNote } =
        analysis.kind === 'other'
          ? { draft: null, note }
          : await draftWithGuard(inquiry, analysis, offer, note, held ?? heldRooms);
      let draftTranslation: Translation | null = null;
      if (text && language && language !== analysis.language) {
        // The draft is the result; without its translation staff still have it to send.
        draftTranslation = await translator
          .translate(text, language)
          .then((t) => ({ language, text: t }))
          .catch(() => null);
      }
      return await inbox.saveProcessing(id, {
        ok: true,
        parsed: analysis,
        suggestion: {
          options,
          block,
          note: finalNote,
          draft: text,
          draftLanguage: text ? analysis.language : null,
          draftTranslation,
        },
      });
    } catch (err) {
      return failed(id, err);
    }
  }

  return {
    read,
    draft,
    /**
     * Reads and drafts a conversation unless it already has a result; `force` re-runs both.
     * `language` is the staff member's, for the draft side by side.
     */
    async process(
      id: string,
      { force = false, language = null }: { force?: boolean; language?: Language | null } = {},
    ): Promise<Inquiry> {
      const inquiry = await inbox.get(id);
      if (inquiry.processedAt && !inquiry.processingError && !force) return inquiry;
      const reading = await read(id, { force: true });
      if (!hasReading(reading)) return reading;
      return draft(id, { language });
    },
  };
}

export type InboxPipeline = ReturnType<typeof createInboxPipeline>;
