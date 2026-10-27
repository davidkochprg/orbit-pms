import type {
  AuditActor,
  Booking,
  CreateHoldInput,
  Inquiry,
  InquiryChannel,
  InquiryExtraction,
  InquirySuggestion,
} from '@orbit/shared';
import { DomainError } from './errors';
import { addonsForWishes, bookingSourceFor, stayRequest } from './inbox';
import type { Repositories } from './repositories';
import type { HotelService } from './service';
import { normalizeText } from './text';

export interface InboxDeps {
  repos: Repositories;
  hotel: HotelService;
  clock: () => Date;
  newId: (prefix: string) => string;
}

export interface NewMessage {
  rawText: string;
  channel: InquiryChannel;
  partner?: string | null;
  subject?: string | null;
  senderName?: string | null;
  senderAddress?: string | null;
}

export type ProcessingResult =
  | { ok: true; parsed: InquiryExtraction; suggestion: InquirySuggestion }
  | { ok: false; error: string };

/** Guest messages from every channel in one stream, and what staff do with them. */
export function createInboxService({ repos, hotel, clock, newId }: InboxDeps) {
  async function load(id: string): Promise<Inquiry> {
    const inquiry = await repos.inquiries.getInquiry(id);
    if (!inquiry) throw new DomainError('not_found', `Message ${id} not found`);
    return inquiry;
  }

  return {
    list: () => repos.inquiries.listInquiries(),
    get: load,

    async create(message: NewMessage): Promise<Inquiry> {
      if (!message.rawText.trim()) throw new DomainError('invalid_input', 'The message is empty');
      const inquiry: Inquiry = {
        id: newId('inq'),
        rawText: message.rawText.trim(),
        channel: message.channel,
        partner: message.partner ?? null,
        subject: message.subject ?? null,
        senderName: message.senderName ?? null,
        senderAddress: message.senderAddress ?? null,
        receivedAt: clock().toISOString(),
        parsed: null,
        suggestion: null,
        reply: null,
        status: 'new',
        bookingId: null,
        processedAt: null,
        processingError: null,
      };
      await repos.inquiries.createInquiry(inquiry);
      return inquiry;
    },

    /** Stores what the agent prepared. A message with offerable rooms becomes `quoted`. */
    async saveProcessing(id: string, result: ProcessingResult): Promise<Inquiry> {
      const inquiry = await load(id);
      const updated: Inquiry = result.ok
        ? {
            ...inquiry,
            parsed: result.parsed,
            suggestion: result.suggestion,
            processedAt: clock().toISOString(),
            processingError: null,
            status:
              inquiry.status === 'new' && result.suggestion.options.length > 0
                ? 'quoted'
                : inquiry.status,
          }
        : { ...inquiry, processedAt: clock().toISOString(), processingError: result.error };
      await repos.inquiries.updateInquiry(updated);
      return updated;
    },

    /**
     * Turns a processed booking request into a hold in the chosen room. Reuses a guest with the
     * same email address, otherwise creates one from the sender.
     */
    async createHold(id: string, roomId: string, actor: AuditActor): Promise<Booking> {
      const inquiry = await load(id);
      const analysis = inquiry.parsed;
      const stay = analysis && stayRequest(analysis);
      if (!analysis || !stay) {
        throw new DomainError('invalid_transition', 'This message has no complete stay request');
      }
      if (inquiry.bookingId) {
        throw new DomainError(
          'conflict',
          `A hold already exists for this message (${inquiry.bookingId})`,
        );
      }
      const email = inquiry.senderAddress && normalizeText(inquiry.senderAddress);
      const existing = email
        ? (await repos.guests.listGuests()).find((g) => g.email && normalizeText(g.email) === email)
        : undefined;
      const input: CreateHoldInput = {
        guest: existing
          ? { guestId: existing.id }
          : {
              name: inquiry.senderName ?? analysis.guestName ?? 'Guest',
              email: inquiry.senderAddress,
              phone: null,
              language: analysis.language,
            },
        roomId,
        ...stay,
        addons: addonsForWishes(analysis.wishes),
        source: bookingSourceFor(inquiry),
        notes: analysis.question,
        inquiryId: inquiry.id,
      };
      return hotel.createHold(input, actor);
    },

    /** Records the reply as sent (sending itself happens outside Orbit). */
    async markReplied(id: string, reply: string, actor: AuditActor): Promise<Inquiry> {
      if (!reply.trim()) throw new DomainError('invalid_input', 'The reply is empty');
      return repos.transaction(async (tx) => {
        const inquiry = await tx.inquiries.getInquiry(id);
        if (!inquiry) throw new DomainError('not_found', `Message ${id} not found`);
        const updated: Inquiry = { ...inquiry, reply: reply.trim(), status: 'replied' };
        await tx.inquiries.updateInquiry(updated);
        await tx.audit.append({
          actor,
          action: 'inquiry.replied',
          subjectId: id,
          payload: { bookingId: inquiry.bookingId },
        });
        return updated;
      });
    },
  };
}

export type InboxService = ReturnType<typeof createInboxService>;
