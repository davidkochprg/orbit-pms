import type {
  Attachment,
  AuditActor,
  Booking,
  BulkBody,
  ComposeBody,
  BookingPatch,
  CreateHoldInput,
  InboxMessage,
  Inquiry,
  InquiryChannel,
  InquiryExtraction,
  InquiryStatus,
  InquirySuggestion,
  Recipient,
  ReplyBody,
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

/** The hotel's reply: its text, and whoever it goes to besides the guest, with files. */
export type SendInput = Pick<ReplyBody, 'body'> & Partial<Omit<ReplyBody, 'body'>>;

/** Who else a message goes to, and its files. */
interface Envelope {
  to?: Recipient[];
  cc?: Recipient[];
  bcc?: Recipient[];
  attachments?: Attachment[];
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
    envelope: Envelope = {},
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
      to: envelope.to ?? [],
      cc: envelope.cc ?? [],
      bcc: envelope.bcc ?? [],
      attachments: envelope.attachments ?? [],
    };
  }

  /** The files with these IDs, refusing any that don't exist. */
  async function attachmentsFor(r: Repositories, ids: string[]): Promise<Attachment[]> {
    const unique = [...new Set(ids)];
    const found = await r.mail.getAttachments(unique);
    if (found.length !== unique.length) {
      throw new DomainError('not_found', 'An attached file is no longer there');
    }
    return found;
  }

  /** Moves a conversation in or out of the trash, without auditing (see `setTrashed`). */
  async function trash(r: Repositories, inquiry: Inquiry, trashed: boolean): Promise<Inquiry> {
    if ((inquiry.trashedAt !== null) === trashed) return inquiry;
    const updated = { ...inquiry, trashedAt: trashed ? clock().toISOString() : null };
    await r.inquiries.updateInquiry(updated);
    return updated;
  }

  async function update(r: Repositories, inquiry: Inquiry, patch: Partial<Inquiry>) {
    const updated = { ...inquiry, ...patch };
    await r.inquiries.updateInquiry(updated);
    return updated;
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

  /**
   * How a processed booking request becomes a hold in the chosen room. Reuses a guest with the
   * same email address, otherwise creates one from the sender. If the message already has a hold,
   * it moves to the chosen room and is quoted there (`switchHold`).
   */
  async function holdPlan(
    id: string,
    roomId: string,
  ): Promise<{ switch: string; patch: BookingPatch } | { input: CreateHoldInput }> {
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
      return {
        switch: held.id,
        patch: { roomId, ...stay, addons: addonsForWishes(analysis.wishes) },
      };
    }
    const email = inquiry.senderAddress && normalizeText(inquiry.senderAddress);
    const existing = email
      ? (await repos.guests.listGuests()).find((g) => g.email && normalizeText(g.email) === email)
      : undefined;
    return {
      input: {
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
      },
    };
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
        starred: false,
        trashedAt: null,
        labelIds: [],
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
          trashedAt: null,
          status: SETTLED.includes(inquiry.status) ? inquiry.status : 'new',
          suggestion: null,
          processedAt: null,
          processingError: null,
        });
      });
    },

    /**
     * A new email from the hotel, starting a conversation with its first recipient, e.g. a forward
     * of another conversation (`forwardOf`) with its files. The draft it was written in goes.
     */
    async compose(input: ComposeBody, author: string | null, actor: AuditActor): Promise<Inquiry> {
      return repos.transaction(async (tx) => {
        const [first] = input.to;
        if (!first) throw new DomainError('invalid_input', 'Add someone to send it to');
        if (input.forwardOf) await load(tx, input.forwardOf);
        const id = newId('inq');
        const msg = message(id, 'out', input.body, author, {
          to: input.to,
          cc: input.cc,
          bcc: input.bcc,
          attachments: await attachmentsFor(tx, input.attachmentIds),
        });
        const inquiry: Inquiry = {
          id,
          channel: 'email',
          partner: null,
          subject: input.subject,
          senderName: first.name,
          senderAddress: first.address,
          receivedAt: msg.sentAt,
          lastMessageAt: msg.sentAt,
          messages: [msg],
          unread: false,
          archivedAt: null,
          starred: false,
          trashedAt: null,
          labelIds: [],
          parsed: null,
          suggestion: null,
          status: 'replied',
          bookingId: null,
          processedAt: null,
          processingError: null,
        };
        await tx.inquiries.createInquiry(inquiry);
        if (input.draftId) await tx.mail.deleteDraft(input.draftId);
        await tx.audit.append({
          actor,
          action: 'inquiry.compose',
          subjectId: id,
          payload: { messageId: msg.id, forwardOf: input.forwardOf },
        });
        return inquiry;
      });
    },

    /**
     * Sends the hotel's reply through the conversation's channel, to the guest unless `to` names
     * others, with copies and files by email. The prepared draft is used up, as is the saved
     * draft it was written in; the room options stay for holding one later.
     */
    async send(id: string, reply: SendInput, author: string | null, actor: AuditActor) {
      return repos.transaction(async (tx) => {
        const inquiry = await load(tx, id);
        const extra = [...(reply.to ?? []), ...(reply.cc ?? []), ...(reply.bcc ?? [])];
        if (inquiry.channel !== 'email' && extra.length > 0) {
          throw new DomainError('invalid_input', 'Only an email can go to more people');
        }
        const msg = message(id, 'out', reply.body, author, {
          to: reply.to ?? [],
          cc: reply.cc ?? [],
          bcc: reply.bcc ?? [],
          attachments: await attachmentsFor(tx, reply.attachmentIds ?? []),
        });
        const updated = await append(tx, inquiry, msg, {
          unread: false,
          trashedAt: null,
          status: SETTLED.includes(inquiry.status) ? inquiry.status : 'replied',
          suggestion: inquiry.suggestion && {
            ...inquiry.suggestion,
            draft: null,
            draftLanguage: null,
            draftTranslation: null,
          },
        });
        if (reply.draftId) await tx.mail.deleteDraft(reply.draftId);
        await tx.audit.append({
          actor,
          action: 'inquiry.replied',
          subjectId: id,
          payload: { messageId: msg.id, bookingId: inquiry.bookingId },
        });
        return updated;
      });
    },

    /**
     * Looks for rooms again for a request that had none when it was read, e.g. after a
     * cancellation. The old draft said nothing was free, so it goes; a new one is prepared on
     * request. A request still waiting for a reply is `quoted` once rooms are found.
     */
    async refreshOptions(id: string): Promise<Inquiry> {
      const inquiry = await load(repos, id);
      if (!inquiry.parsed || !inquiry.suggestion) {
        throw new DomainError('invalid_transition', 'This message has not been read yet');
      }
      const { options, note } = await hotel.inboxOptions(inquiry.parsed);
      const updated: Inquiry = {
        ...inquiry,
        suggestion: {
          ...inquiry.suggestion,
          options,
          note,
          draft: null,
          draftLanguage: null,
          draftTranslation: null,
        },
        status: inquiry.status === 'new' && options.length > 0 ? 'quoted' : inquiry.status,
      };
      await repos.inquiries.updateInquiry(updated);
      return updated;
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

    async setStarred(id: string, starred: boolean): Promise<Inquiry> {
      const inquiry = await load(repos, id);
      return inquiry.starred === starred ? inquiry : update(repos, inquiry, { starred });
    },

    /** Moves a conversation to the trash, out of every other folder, or back. */
    async setTrashed(id: string, trashed: boolean, actor: AuditActor): Promise<Inquiry> {
      return repos.transaction(async (tx) => {
        const inquiry = await load(tx, id);
        const updated = await trash(tx, inquiry, trashed);
        if (updated !== inquiry) {
          await tx.audit.append({
            actor,
            action: trashed ? 'inquiry.trash' : 'inquiry.restore',
            subjectId: id,
            payload: null,
          });
        }
        return updated;
      });
    },

    /** Deletes a conversation in the trash for good, with its drafts. */
    async deleteForever(id: string, actor: AuditActor): Promise<void> {
      return repos.transaction(async (tx) => {
        const inquiry = await load(tx, id);
        if (!inquiry.trashedAt) {
          throw new DomainError('invalid_transition', 'Move the conversation to the trash first');
        }
        for (const d of await tx.mail.listDrafts()) {
          if (d.inquiryId === id) await tx.mail.deleteDraft(d.id);
        }
        await tx.inquiries.deleteInquiry(id);
        await tx.audit.append({
          actor,
          action: 'inquiry.delete',
          subjectId: id,
          payload: {
            subject: inquiry.subject,
            with: inquiry.senderName ?? inquiry.senderAddress,
            bookingId: inquiry.bookingId,
          },
        });
      });
    },

    /** Replaces a conversation's labels with these, which must exist. */
    async setLabels(id: string, labelIds: string[]): Promise<Inquiry> {
      const inquiry = await load(repos, id);
      const known = new Set((await repos.mail.listLabels()).map((l) => l.id));
      const unknown = labelIds.find((l) => !known.has(l));
      if (unknown) throw new DomainError('not_found', `Label ${unknown} not found`);
      return update(repos, inquiry, { labelIds: [...new Set(labelIds)] });
    },

    /** One change to many conversations at once, all or none. */
    async bulk({ ids, action, labelId }: BulkBody, actor: AuditActor): Promise<Inquiry[]> {
      return repos.transaction(async (tx) => {
        if (labelId && !(await tx.mail.listLabels()).some((l) => l.id === labelId)) {
          throw new DomainError('not_found', `Label ${labelId} not found`);
        }
        const done: Inquiry[] = [];
        for (const id of new Set(ids)) {
          const m = await load(tx, id);
          const at = clock().toISOString();
          switch (action) {
            case 'archive':
              done.push(m.archivedAt ? m : await update(tx, m, { archivedAt: at }));
              break;
            case 'unarchive':
              done.push(await update(tx, m, { archivedAt: null }));
              break;
            case 'trash':
            case 'restore':
              done.push(await trash(tx, m, action === 'trash'));
              break;
            case 'read':
            case 'unread':
              done.push(await update(tx, m, { unread: action === 'unread' }));
              break;
            case 'star':
            case 'unstar':
              done.push(await update(tx, m, { starred: action === 'star' }));
              break;
            case 'label':
              done.push(await update(tx, m, { labelIds: [...new Set([...m.labelIds, labelId!])] }));
              break;
            case 'unlabel':
              done.push(await update(tx, m, { labelIds: m.labelIds.filter((l) => l !== labelId) }));
              break;
          }
        }
        if (action === 'trash' || action === 'restore') {
          await tx.audit.append({
            actor,
            action: action === 'trash' ? 'inquiry.trash' : 'inquiry.restore',
            subjectId: null,
            payload: { ids: done.map((m) => m.id) },
          });
        }
        return done;
      });
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

    /** Turns a processed booking request into a hold in the chosen room (`holdPlan`). */
    async createHold(id: string, roomId: string, actor: AuditActor): Promise<Booking> {
      const plan = await holdPlan(id, roomId);
      return 'switch' in plan
        ? hotel.switchHold(plan.switch, plan.patch, actor)
        : hotel.createHold(plan.input, actor);
    },

    /** The hold `createHold` would make or move, with its room and the guest it is for. */
    async previewHold(id: string, roomId: string) {
      const plan = await holdPlan(id, roomId);
      const { booking, room, newGuest } =
        'switch' in plan
          ? await hotel.previewSwitchHold(plan.switch, plan.patch)
          : await hotel.previewHold(plan.input);
      const guestName =
        newGuest?.name ?? (await repos.guests.getGuest(booking.guestId))?.name ?? 'Guest';
      return { booking, room, guestName, moved: 'switch' in plan };
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
