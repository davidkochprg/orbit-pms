import type { Inquiry, InquiryExtraction, InquiryStatus } from '@orbit/shared';
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
