import type { Guest, Inquiry, InquiryExtraction, InquiryStatus } from '@orbit/shared';
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
export function canDecline(m: Inquiry): boolean {
  return m.status !== 'declined' && m.status !== 'converted' && m.bookingId === null;
}
