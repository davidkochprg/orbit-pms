import type { Inquiry } from './entities';

/**
 * The mailbox views. A conversation in the trash is in no other folder; starred and sent ones
 * stay there when archived, as in Gmail.
 */
export const mailFolders = [
  'inbox',
  'starred',
  'awaiting',
  'sent',
  'drafts',
  'archived',
  'trash',
] as const;
export type MailFolder = (typeof mailFolders)[number];

/** The guest wrote last and the conversation isn't turned down: someone should answer. */
export function awaitingReply(m: Inquiry): boolean {
  return m.messages.at(-1)?.direction === 'in' && m.status !== 'declined';
}

/** Whether a conversation shows in a folder. Drafts are listed from the drafts themselves. */
export function inMailFolder(m: Inquiry, folder: MailFolder): boolean {
  if (folder === 'trash') return m.trashedAt !== null;
  if (m.trashedAt !== null) return false;
  switch (folder) {
    case 'inbox':
      return m.archivedAt === null;
    case 'starred':
      return m.starred;
    case 'awaiting':
      return m.archivedAt === null && awaitingReply(m);
    case 'sent':
      return m.messages.some((x) => x.direction === 'out');
    case 'archived':
      return m.archivedAt !== null;
    case 'drafts':
      return false;
  }
}

/** When the hotel last wrote in a conversation, for ordering Sent. */
export function lastSentAt(m: Inquiry): string | null {
  return m.messages.findLast((x) => x.direction === 'out')?.sentAt ?? null;
}
