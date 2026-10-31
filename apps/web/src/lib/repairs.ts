import type { Contact, HousekeepingRoom, Inquiry, RoomAccess } from '@orbit/shared';
import { formatDate } from '@/lib/format';

/** When a contractor can work in the room, e.g. "Free until Sat, Nov 7". */
export function accessLabel({ guestName, freeFrom, freeUntil }: RoomAccess): string {
  if (!guestName) {
    if (!freeUntil) return 'Free now';
    return freeUntil === freeFrom
      ? 'Free until today’s arrival'
      : `Free until ${formatDate(freeUntil)}`;
  }
  return freeUntil
    ? `Free ${formatDate(freeFrom)} – ${formatDate(freeUntil)}`
    : `Free from ${formatDate(freeFrom)}`;
}

/** A link that dials the number on a phone, or hands it to the computer's calling app. */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

/** The conversations with contractors about a repair, latest first, the trash left out. */
export function repairConversations<
  T extends Pick<Inquiry, 'taskId' | 'trashedAt' | 'lastMessageAt'>,
>(taskId: string, inbox: T[]): T[] {
  return inbox
    .filter((m) => m.taskId === taskId && !m.trashedAt)
    .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
}

/** "Example Plumbing · Sam", how a contact is named in a list. */
export function contactName(contact: Pick<Contact, 'name' | 'person'>): string {
  return contact.person ? `${contact.name} · ${contact.person}` : contact.name;
}

/**
 * What a contact is doing for the hotel: the open repairs they were asked to fix, and the emails
 * with them, from their address or about one of those repairs. Latest email first.
 */
export function contactWork(
  contact: Pick<Contact, 'id' | 'email'>,
  rooms: Pick<HousekeepingRoom, 'room' | 'openTasks'>[],
  inbox: Inquiry[],
) {
  const repairs = rooms.flatMap(({ room, openTasks }) =>
    openTasks
      .filter((t) => t.type === 'maintenance' && t.contactId === contact.id)
      .map((t) => ({ taskId: t.id, roomName: room.name, notes: t.notes })),
  );
  const address = contact.email?.toLowerCase() ?? null;
  const emails = inbox
    .filter(
      (m) =>
        !m.trashedAt &&
        ((address !== null && m.senderAddress?.toLowerCase() === address) ||
          repairs.some((r) => r.taskId === m.taskId)),
    )
    .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
  return { repairs, emails };
}
