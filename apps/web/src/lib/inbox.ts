import type { Guest, Inquiry, InquiryExtraction, InquiryStatus, Language } from '@orbit/shared';
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

/** The mailbox views: everything not archived, what is unread, what waits for an answer, and the archive. */
export type InboxFolder = 'inbox' | 'unread' | 'awaiting' | 'archived';

export const folderLabels: Record<InboxFolder, string> = {
  inbox: 'Inbox',
  unread: 'Unread',
  awaiting: 'Needs a reply',
  archived: 'Archived',
};

/** The guest wrote last and the conversation isn't turned down: someone should answer. */
export function awaitingReply(m: Inquiry): boolean {
  return m.messages.at(-1)?.direction === 'in' && m.status !== 'declined';
}

export function inFolder(m: Inquiry, folder: InboxFolder): boolean {
  if (folder === 'archived') return m.archivedAt !== null;
  if (m.archivedAt !== null) return false;
  if (folder === 'unread') return m.unread;
  if (folder === 'awaiting') return awaitingReply(m);
  return true;
}

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
  folder: InboxFolder;
  /** A channel label from `channelsOf`, or null for all. */
  channel: string | null;
  query: string;
}

export function filterConversations(list: Inquiry[], filter: InboxFilter): Inquiry[] {
  return list.filter(
    (m) =>
      inFolder(m, filter.folder) &&
      (filter.channel === null || channelLabel(m) === filter.channel) &&
      matchesSearch(m, filter.query),
  );
}

export function folderCounts(list: Inquiry[]): Record<InboxFolder, number> {
  const count = (folder: InboxFolder) => list.filter((m) => inFolder(m, folder)).length;
  return {
    inbox: count('inbox'),
    unread: count('unread'),
    awaiting: count('awaiting'),
    archived: count('archived'),
  };
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
