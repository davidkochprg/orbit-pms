import {
  type Attachment,
  type DraftBody,
  type LabelBody,
  MAX_ATTACHMENT_BYTES,
  type MailDraft,
  type MailLabel,
} from '@orbit/shared';
import { DomainError } from './errors';
import type { Repositories } from './repositories';

export interface MailboxDeps {
  repos: Repositories;
  clock: () => Date;
  newId: (prefix: string) => string;
}

/** A file staff attach, as uploaded. */
export interface NewAttachment {
  name: string;
  contentType: string;
  bytes: Uint8Array;
}

/** A draft's ID is made by the app that writes it, so saving as staff type needs no round trip. */
const DRAFT_ID = /^drf_[A-Za-z0-9_-]{6,40}$/;

/** The file's own name, without a path, kept short and free of control characters. */
export function attachmentName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  const clean = [...base]
    .filter((c) => c.charCodeAt(0) > 31 && c.charCodeAt(0) !== 127)
    .join('')
    .trim();
  return clean.slice(-120) || 'file';
}

/** Labels, drafts and attached files: the parts of the mailbox around the conversations. */
export function createMailboxService({ repos, clock, newId }: MailboxDeps) {
  async function loadLabel(r: Repositories, id: string): Promise<MailLabel> {
    const label = (await r.mail.listLabels()).find((l) => l.id === id);
    if (!label) throw new DomainError('not_found', `Label ${id} not found`);
    return label;
  }

  async function uniqueName(r: Repositories, name: string, except: string | null) {
    const taken = (await r.mail.listLabels()).some(
      (l) => l.id !== except && l.name.toLowerCase() === name.toLowerCase(),
    );
    if (taken) throw new DomainError('conflict', `There is already a label called ${name}`);
  }

  return {
    listLabels: () => repos.mail.listLabels(),

    createLabel(body: LabelBody): Promise<MailLabel> {
      return repos.transaction(async (tx) => {
        await uniqueName(tx, body.name, null);
        const label: MailLabel = { id: newId('lbl'), ...body };
        await tx.mail.saveLabel(label);
        return label;
      });
    },

    updateLabel(id: string, body: LabelBody): Promise<MailLabel> {
      return repos.transaction(async (tx) => {
        await loadLabel(tx, id);
        await uniqueName(tx, body.name, id);
        const label: MailLabel = { id, ...body };
        await tx.mail.saveLabel(label);
        return label;
      });
    },

    /** Deletes a label and takes it off every conversation; the conversations stay. */
    deleteLabel(id: string): Promise<void> {
      return repos.transaction(async (tx) => {
        await loadLabel(tx, id);
        for (const m of await tx.inquiries.listInquiries()) {
          if (m.labelIds.includes(id)) {
            await tx.inquiries.updateInquiry({
              ...m,
              labelIds: m.labelIds.filter((l) => l !== id),
            });
          }
        }
        await tx.mail.deleteLabel(id);
      });
    },

    listDrafts: () => repos.mail.listDrafts(),

    /**
     * Saves a draft as it stands, new or not. A reply draft belongs to a conversation that
     * exists; its files must exist too.
     */
    saveDraft(id: string, body: DraftBody): Promise<MailDraft> {
      return repos.transaction(async (tx) => {
        if (!DRAFT_ID.test(id)) throw new DomainError('invalid_input', 'Invalid draft ID');
        for (const ref of [body.inquiryId, body.forwardOf]) {
          if (ref && !(await tx.inquiries.getInquiry(ref))) {
            throw new DomainError('not_found', `Conversation ${ref} not found`);
          }
        }
        const attachments = await tx.mail.getAttachments([...new Set(body.attachmentIds)]);
        const { attachmentIds: _, ...fields } = body;
        const draft: MailDraft = {
          id,
          ...fields,
          attachments,
          updatedAt: clock().toISOString(),
        };
        await tx.mail.saveDraft(draft);
        return draft;
      });
    },

    async deleteDraft(id: string): Promise<void> {
      if (!(await repos.mail.getDraft(id))) {
        throw new DomainError('not_found', `Draft ${id} not found`);
      }
      await repos.mail.deleteDraft(id);
    },

    /** Keeps an uploaded file, to attach to a draft or an email. */
    async addAttachment({ name, contentType, bytes }: NewAttachment): Promise<Attachment> {
      if (bytes.length === 0) throw new DomainError('invalid_input', 'The file is empty');
      if (bytes.length > MAX_ATTACHMENT_BYTES) {
        throw new DomainError('invalid_input', 'Files can be up to 4 MB');
      }
      const attachment: Attachment = {
        id: newId('att'),
        name: attachmentName(name),
        contentType: /^[\w.+-]+\/[\w.+-]+$/.test(contentType)
          ? contentType
          : 'application/octet-stream',
        size: bytes.length,
      };
      await repos.mail.saveAttachment(attachment, bytes);
      return attachment;
    },

    async readAttachment(id: string) {
      const file = await repos.mail.readAttachment(id);
      if (!file) throw new DomainError('not_found', `File ${id} not found`);
      return file;
    },
  };
}

export type MailboxService = ReturnType<typeof createMailboxService>;
