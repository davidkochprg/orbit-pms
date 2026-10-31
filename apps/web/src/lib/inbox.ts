import {
  type Guest,
  type Inquiry,
  type InquiryExtraction,
  type InquiryStatus,
  inMailFolder,
  type Language,
  lastSentAt,
  type MailFolder,
} from '@orbit/shared';
import type { NewBookingPrefill } from './booking-editor';
import { formatParty, formatRange, languageLabels } from './format';

export const inquiryStatusLabels: Record<InquiryStatus, string> = {
  new: 'New',
  quoted: 'Quoted',
  replied: 'Replied',
  converted: 'Converted',
  declined: 'Declined',
};

export function senderLabel(m: Inquiry): string {
  return m.senderName ?? m.senderAddress ?? 'Unknown sender';
}

export function channelLabel(m: Inquiry): string {
  return m.partner ?? { email: 'Email', phone: 'Phone', web: 'Web form', ota: 'OTA' }[m.channel];
}

export function snippet(text: string, length = 90): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > length ? `${flat.slice(0, length - 1)}…` : flat;
}

/** Short facts the agent read from the message, for display as chips. */
export function analysisFacts(a: InquiryExtraction): string[] {
  const facts = [
    { booking_request: 'Booking request', question: 'Question', other: 'Other' }[a.kind],
    languageLabels[a.language],
  ];
  if (a.checkIn && a.checkOut) facts.push(formatRange(a.checkIn, a.checkOut));
  if (a.adults) facts.push(formatParty(a.adults, a.childAges));
  if (a.rooms && a.rooms > 1) facts.push(`${a.rooms} rooms`);
  if (a.wishes.apartment) facts.push('Apartment');
  if (a.wishes.dog) facts.push('Dog');
  if (a.wishes.wellness) facts.push('Wellness');
  return facts;
}

/**
 * What a manual booking from this message starts with: the sender as guest (an existing record
 * if their email is known) and whatever stay the agent read, linked back to the message.
 */
export function bookingPrefillFor(m: Inquiry, guests: Guest[]): NewBookingPrefill {
  const a = m.parsed;
  const email = m.senderAddress?.trim().toLowerCase();
  const known = email ? guests.find((g) => g.email?.toLowerCase() === email) : undefined;
  return {
    inquiryId: m.id,
    source:
      m.channel === 'ota'
        ? 'ota'
        : m.channel === 'web'
          ? 'web'
          : m.channel === 'phone'
            ? 'phone'
            : 'email',
    ...(known
      ? { guestId: known.id }
      : {
          newGuest: {
            name: m.senderName ?? a?.guestName ?? '',
            email: m.senderAddress ?? '',
            language: a?.language ?? 'en',
          },
        }),
    ...(a?.checkIn && { checkIn: a.checkIn }),
    ...(a?.checkOut && { checkOut: a.checkOut }),
    ...(a?.adults && { adults: a.adults }),
    ...(a && { childAges: a.childAges }),
    ...(a && {
      addons: { wellness: a.wishes.wellness, dogs: a.wishes.dog ? 1 : 0, extraBeds: 0 },
    }),
    ...(a?.question && { notes: a.question }),
  };
}

/** Whether staff can still decline the message: not once it led to a booking. */
/**
 * Declining says no booking will come of a request, so it is offered until a booking exists and
 * unless Orbit found the message is a question or something else.
 */
export function canDecline(m: Inquiry): boolean {
  return (
    m.status !== 'declined' &&
    m.status !== 'converted' &&
    m.bookingId === null &&
    (m.parsed === null || m.parsed.kind === 'booking_request')
  );
}

export type { MailFolder as InboxFolder } from '@orbit/shared';
export { awaitingReply } from '@orbit/shared';

export const folderLabels: Record<MailFolder, string> = {
  inbox: 'Inbox',
  starred: 'Starred',
  awaiting: 'Needs a reply',
  sent: 'Sent',
  drafts: 'Drafts',
  archived: 'Archive',
  trash: 'Trash',
};

/** The channels conversations came through, e.g. "Booking.com" and "Email", for filtering. */
export function channelsOf(list: Inquiry[]): string[] {
  return [...new Set(list.map(channelLabel))].sort();
}

const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

/** Whether the guest, address, subject or any message mentions the query, accents ignored. */
export function matchesSearch(m: Inquiry, query: string): boolean {
  const q = normalize(query.trim());
  if (!q) return true;
  return [m.senderName, m.senderAddress, m.subject, ...m.messages.map((x) => x.body)].some(
    (field) => field !== null && normalize(field).includes(q),
  );
}

export interface InboxFilter {
  folder: MailFolder;
  /** Only conversations with this label; null for all. */
  label: string | null;
  /** A channel label from `channelsOf`, or null for all. */
  channel: string | null;
  query: string;
}

/**
 * The conversations a view shows, latest first; Sent by when the hotel last wrote. A label
 * view shows the label's conversations wherever they are, except in the trash.
 */
export function filterConversations(list: Inquiry[], filter: InboxFilter): Inquiry[] {
  const shown = list.filter(
    (m) =>
      (filter.label
        ? m.labelIds.includes(filter.label) && m.trashedAt === null
        : inMailFolder(m, filter.folder)) &&
      (filter.channel === null || channelLabel(m) === filter.channel) &&
      matchesSearch(m, filter.query),
  );
  if (filter.folder === 'sent' && !filter.label) {
    return shown.sort((a, b) => (lastSentAt(b) ?? '').localeCompare(lastSentAt(a) ?? ''));
  }
  return shown;
}

/** What the rail counts: unread in the inbox, conversations waiting for a reply, and the rest. */
export function folderCounts(list: Inquiry[]): {
  unread: number;
  awaiting: number;
  starred: number;
  trash: number;
} {
  const live = list.filter((m) => m.trashedAt === null);
  return {
    unread: live.filter((m) => m.unread && m.archivedAt === null).length,
    awaiting: live.filter((m) => inMailFolder(m, 'awaiting')).length,
    starred: live.filter((m) => m.starred).length,
    trash: list.length - live.length,
  };
}

/** Unread conversations per label, outside the trash. */
export function labelCounts(list: Inquiry[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const m of list) {
    if (m.trashedAt !== null || !m.unread) continue;
    for (const l of m.labelIds) counts.set(l, (counts.get(l) ?? 0) + 1);
  }
  return counts;
}

/** The latest message, one line, marked when the hotel wrote it. */
export function preview(m: Inquiry): string {
  const last = m.messages.at(-1);
  if (!last) return '';
  return `${last.direction === 'out' ? 'You: ' : ''}${snippet(last.body, 140)}`;
}

// Everyday words that give a short guest message away, with letters only one language uses.
const languageHints: Record<Language, RegExp> = {
  cs: /\b(dobrý|děkuji|děkujeme|prosím|máte|jsme|bychom|pokoj|zdravím|pozdravem)\b|[ěřůť]/giu,
  de: /\b(und|wir|ist|nicht|guten|hallo|grüße|vielen|dank|zimmer|haben|möchten)\b|ß/giu,
  en: /\b(the|and|we|would|hello|thanks|thank|you|room|please|is)\b/giu,
  pl: /\b(dzień|dobry|czy|jest|pozdrawiam|dziękuję|proszę|pokój|chcielibyśmy)\b|[łśźżąę]/giu,
};

/** A best guess at the language of a text, free and instant; null when nothing stands out. */
export function guessLanguage(text: string): Language | null {
  const scores = (Object.keys(languageHints) as Language[])
    .map((l) => ({ l, n: text.match(languageHints[l])?.length ?? 0 }))
    .sort((a, b) => b.n - a.n);
  return scores[0]!.n > 0 && scores[0]!.n > scores[1]!.n ? scores[0]!.l : null;
}

/**
 * The language the guest writes in: what the agent read, once it prepared a reply, or else a
 * guess from the guest's latest message.
 */
export function guestLanguage(m: Inquiry): Language | null {
  const read = m.parsed?.language ?? m.suggestion?.draftLanguage;
  if (read) return read;
  const last = m.messages.findLast((x) => x.direction === 'in');
  return last ? guessLanguage(last.body) : null;
}

/** What the send button says: replies go back the way the guest wrote. */
export function sendLabel(m: Inquiry): string {
  if (m.channel === 'ota') return `Send via ${m.partner ?? 'the OTA'}`;
  return m.senderAddress ? 'Send email' : 'Send reply';
}

/**
 * Whether Orbit has read the guest's latest message: a new message from the guest clears the
 * reading's time, and the request has to be read again.
 */
export function isRead(m: Inquiry): boolean {
  return m.parsed !== null && m.processedAt !== null && !m.processingError;
}

/**
 * A guest's conversations: those about one of their bookings, or from their email address.
 * Latest message first.
 */
export function conversationsOf(
  all: Inquiry[],
  guest: Pick<Guest, 'email'>,
  bookingIds: string[],
): Inquiry[] {
  const email = guest.email?.toLowerCase() ?? null;
  return all
    .filter(
      (m) =>
        (m.bookingId !== null && bookingIds.includes(m.bookingId)) ||
        (email !== null && m.senderAddress?.toLowerCase() === email),
    )
    .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
}
