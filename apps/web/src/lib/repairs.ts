import type { Contact, RoomAccess, WorkOrder } from '@orbit/shared';
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

/** Opens the email in the staff member's own mail app, ready to send. */
export function mailtoHref({ to, subject, body }: WorkOrder): string {
  const params = new URLSearchParams({ subject, body }).toString().replaceAll('+', '%20');
  return `mailto:${to ? encodeURIComponent(to).replace('%40', '@') : ''}?${params}`;
}

/** "Example Plumbing · Sam", how a contact is named in a list. */
export function contactName(contact: Pick<Contact, 'name' | 'person'>): string {
  return contact.person ? `${contact.name} · ${contact.person}` : contact.name;
}
