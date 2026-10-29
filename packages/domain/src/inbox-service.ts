import type {
  AuditActor,
  Booking,
  ComposeBody,
  CreateHoldInput,
  InboxMessage,
  Inquiry,
  InquiryChannel,
  InquiryExtraction,
  InquiryStatus,
  InquirySuggestion,
  Translation,
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
  body: string;
  channel: InquiryChannel;
  partner?: string | null;
  subject?: string | null;
  senderName?: string | null;
  senderAddress?: string | null;
}

export type ProcessingResult =
  | { ok: true; parsed: InquiryExtraction; suggestion: InquirySuggestion }
  | { ok: false; error: string };

/** Statuses a conversation keeps whatever is written: it led to a booking, or it was turned down. */
const SETTLED: InquiryStatus[] = ['converted', 'declined'];

/** The guest's messages, oldest first: what the agent reads to prepare a reply. */
export function guestMessages(inquiry: Inquiry): InboxMessage[] {
  return inquiry.messages.filter((m) => m.direction === 'in');
}

/**
 * Guest conversations from every channel, by email or an OTA's messaging, and what staff do
 * with them. Sending records the message; delivering it is a transport's job outside Orbit.
 */
export function createInboxService({ repos, hotel, clock, newId }: InboxDeps) {
  async function load(r: Repositories, id: string): Promise<Inquiry> {
    const inquiry = await r.inquiries.getInquiry(id);
    if (!inquiry) throw new DomainError('not_found', `Conversation ${id} not found`);
    return inquiry;
  }

  function message(
    inquiryId: string,
    direction: InboxMessage['direction'],
    body: string,
    author: string | null,
  ): InboxMessage {
    const text = body.trim();
    if (!text) throw new DomainError('invalid_input', 'The message is empty');
    return {
      id: newId('msg'),
      inquiryId,
      direction,
      body: text,
      sentAt: clock().toISOString(),
      author,
      translation: null,
    };
  }

  /** Adds a message to a conversation and saves the conversation as `next` says. */
  async function append(
    r: Repositories,
    inquiry: Inquiry,
    msg: InboxMessage,
    next: Partial<Inquiry>,
  ) {
    await r.inquiries.addMessage(msg);
    const updated: Inquiry = {
      ...inquiry,
      ...next,
      messages: [...inquiry.messages, msg],
      lastMessageAt: msg.sentAt,
    };
    await r.inquiries.updateInquiry(updated);
    return updated;
  }

  return {
    /** Newest conversation first. */
    list: () => repos.inquiries.listInquiries(),
    get: (id: string) => load(repos, id),

    /** A guest's first message, e.g. pasted from an email or relayed by an OTA. */
    async create(input: NewMessage): Promise<Inquiry> {
      const id = newId('inq');
      const first = message(id, 'in', input.body, null);
      const inquiry: Inquiry = {
        id,
        channel: input.channel,
        partner: input.partner ?? null,
        subject: input.subject ?? null,
        senderName: input.senderName ?? null,
        senderAddress: input.senderAddress ?? null,
        receivedAt: first.sentAt,
        lastMessageAt: first.sentAt,
        messages: [first],
        unread: true,
        archivedAt: null,
        parsed: null,
        suggestion: null,
        status: 'new',
        bookingId: null,
        processedAt: null,
        processingError: null,
      };
      await repos.inquiries.createInquiry(inquiry);
      return inquiry;
    },

    /**
     * The guest wrote again. The conversation is unread and back in the inbox, needs a reply
     * unless it is settled, and what the agent prepared no longer answers it.
     */
    async receive(id: string, body: string): Promise<Inquiry> {
      return repos.transaction(async (tx) => {
        const inquiry = await load(tx, id);
        return append(tx, inquiry, message(id, 'in', body, null), {
          unread: true,
          archivedAt: null,
          status: SETTLED.includes(inquiry.status) ? inquiry.status : 'new',
          suggestion: null,
          processedAt: null,
          processingError: null,
        });
      });
    },

    /** A new email from the hotel to a guest, starting a conversation. */
    async compose(input: ComposeBody, author: string | null, actor: AuditActor): Promise<Inquiry> {
      return repos.transaction(async (tx) => {
        const id = newId('inq');
        const first = message(id, 'out', input.body, author);
        const inquiry: Inquiry = {
          id,
          channel: 'email',
          partner: null,
          subject: input.subject,
          senderName: input.toName,
          senderAddress: input.toAddress,
          receivedAt: first.sentAt,
          lastMessageAt: first.sentAt,
          messages: [first],
          unread: false,
          archivedAt: null,
          parsed: null,
          suggestion: null,
          status: 'replied',
          bookingId: null,
          processedAt: null,
          processingError: null,
        };
        await tx.inquiries.createInquiry(inquiry);
        await tx.audit.append({
          actor,
          action: 'inquiry.compose',
          subjectId: id,
          payload: { messageId: first.id },
        });
        return inquiry;
      });
    },

    /**
     * Sends the hotel's reply through the conversation's channel. The prepared draft is used up;
     * the room options stay for holding one later.
     */
    async send(id: string, body: string, author: string | null, actor: AuditActor) {
      return repos.transaction(async (tx) => {
        const inquiry = await load(tx, id);
        const msg = message(id, 'out', body, author);
        const updated = await append(tx, inquiry, msg, {
          unread: false,
          status: SETTLED.includes(inquiry.status) ? inquiry.status : 'replied',
          suggestion: inquiry.suggestion && {
            ...inquiry.suggestion,
            draft: null,
            draftLanguage: null,
            draftTranslation: null,
          },
        });
        await tx.audit.append({
          actor,
          action: 'inquiry.replied',
          subjectId: id,
          payload: { messageId: msg.id, bookingId: inquiry.bookingId },
        });
        return updated;
      });
    },

    async setUnread(id: string, unread: boolean): Promise<Inquiry> {
      const inquiry = await load(repos, id);
      if (inquiry.unread === unread) return inquiry;
      const updated = { ...inquiry, unread };
      await repos.inquiries.updateInquiry(updated);
      return updated;
    },

    async setArchived(id: string, archived: boolean): Promise<Inquiry> {
      const inquiry = await load(repos, id);
      if ((inquiry.archivedAt !== null) === archived) return inquiry;
      const updated = { ...inquiry, archivedAt: archived ? clock().toISOString() : null };
      await repos.inquiries.updateInquiry(updated);
      return updated;
    },

    /** Keeps a message's translation, so reading it again costs nothing. */
    async saveTranslation(id: string, messageId: string, translation: Translation) {
      const inquiry = await load(repos, id);
      const msg = inquiry.messages.find((m) => m.id === messageId);
      if (!msg) throw new DomainError('not_found', `Message ${messageId} not found`);
      const translated = { ...msg, translation };
      await repos.inquiries.updateMessage(translated);
      return {
        ...inquiry,
        messages: inquiry.messages.map((m) => (m.id === messageId ? translated : m)),
      };
    },

    /** Stores what the agent prepared. A message with offerable rooms becomes `quoted`. */
    async saveProcessing(id: string, result: ProcessingResult): Promise<Inquiry> {
      const inquiry = await load(repos, id);
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
     * same email address, otherwise creates one from the sender. If the message already has a
     * hold, it moves to the chosen room and is quoted there (`switchHold`).
     */
    async createHold(id: string, roomId: string, actor: AuditActor): Promise<Booking> {
      const inquiry = await load(repos, id);
      const analysis = inquiry.parsed;
      const stay = analysis && stayRequest(analysis);
      if (!analysis || !stay) {
        throw new DomainError('invalid_transition', 'This message has no complete stay request');
      }
      // Holding another offered room moves the message's hold there, while it is still a hold.
      if (inquiry.bookingId) {
        const held = await repos.bookings.getBooking(inquiry.bookingId);
        if (held?.status !== 'hold') {
          throw new DomainError(
            'conflict',
            `This message already led to a booking (${inquiry.bookingId})`,
          );
        }
        return hotel.switchHold(
          held.id,
          { roomId, ...stay, addons: addonsForWishes(analysis.wishes) },
          actor,
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

    /** Marks a message as not leading to a booking, e.g. spam or a request that can't be met. */
    async decline(id: string, actor: AuditActor): Promise<Inquiry> {
      return repos.transaction(async (tx) => {
        const inquiry = await load(tx, id);
        if (inquiry.status === 'converted' || inquiry.bookingId) {
          throw new DomainError('invalid_transition', 'This message already led to a booking');
        }
        const updated: Inquiry = { ...inquiry, status: 'declined' };
        await tx.inquiries.updateInquiry(updated);
        await tx.audit.append({
          actor,
          action: 'inquiry.decline',
          subjectId: id,
          payload: { from: inquiry.status },
        });
        return updated;
      });
    },
  };
}

export type InboxService = ReturnType<typeof createInboxService>;
