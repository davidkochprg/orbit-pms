import type { Inquiry, InquiryExtraction, Language, StayOption } from '@orbit/shared';
import type { HotelProfile } from '../hotel';

const languageNames: Record<Language, string> = {
  cs: 'Czech',
  de: 'German',
  en: 'English',
  pl: 'Polish',
};

/** Whole CZK with spaces between thousands, e.g. "12 500 CZK". The price guard reads this back. */
export function formatAmount(amount: number): string {
  return `${String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} CZK`;
}

export const extractionSystemPrompt = `You read guest messages sent to a small hotel and extract structured data. Never invent anything that is not in the message.

- kind: "booking_request" if they ask for a stay, availability or a price; "question" if they ask about an existing booking or the hotel (arrival time, parking, pets, facilities); otherwise "other".
- language: the language the guest wrote in (cs, de, en or pl).
- checkIn and checkOut: YYYY-MM-DD. checkOut is the departure day. "3 nights from the 14th" means checkOut is 3 days after checkIn. Dates without a year are the next such date on or after today. Use null if not stated.
- adults: number of adults, or null if unknown. A couple is 2.
- childAges: one age per child. Babies under one year are 0.
- wishes: wellness (sauna, massage, spa), dog (any pet dog), apartment (apartment, holiday flat, "Ferienwohnung", "apartmán").
- question: one English sentence summarising what they ask, or null if they only ask for a stay.`;

export function extractionPrompt(inquiry: Inquiry, today: string): string {
  return `Today is ${today}.
Channel: ${inquiry.channel}${inquiry.partner ? ` via ${inquiry.partner}` : ''}
From: ${inquiry.senderName ?? 'unknown'}
Subject: ${inquiry.subject ?? '(none)'}

Message:
"""
${inquiry.rawText}
"""`;
}

export function draftSystemPrompt(hotel: HotelProfile): string {
  return `You write replies to guests for the reception of ${hotel.name} (${hotel.location}). Warm, short, professional.

Facts you may use:
- Check-in from ${hotel.checkInFrom}, check-out by ${hotel.checkOutBy}.
${hotel.policies.map((p) => `- ${p}`).join('\n')}

Rules:
- Write only in the language you are told to use.
- Prices: state each offered room type with its total exactly as written in the options, e.g. "12 500 CZK". Never calculate, round, convert or invent any amount.
- Do not confirm a booking. Offer to hold the room for the guest and ask them to reply to confirm.
- If something is not covered by the facts above, say you will check and get back to them. Never invent facilities or prices.
- Output only the message body, without a subject line. Sign off as "${hotel.name} reception".`;
}

export function draftPrompt(params: {
  inquiry: Inquiry;
  analysis: InquiryExtraction;
  options: StayOption[];
  note: string | null;
  feedback?: string;
}): string {
  const { inquiry, analysis, options, note, feedback } = params;
  const offer =
    options.length > 0
      ? options
          .map(
            (o, i) =>
              `${i + 1}. ${o.roomTypeName} (room ${o.roomName}), ${o.quote.nights} nights: total ${formatAmount(o.quote.total)}. Breakdown: ${o.quote.lines.map((l) => `${l.label} ${formatAmount(l.amount)}`).join('; ')}`,
          )
          .join('\n')
      : (note ?? 'No room offer: this message is not a booking request.');
  return `Write the reply in ${languageNames[analysis.language]}.
Guest name: ${analysis.guestName ?? inquiry.senderName ?? 'unknown'}
${analysis.question ? `They ask: ${analysis.question}\n` : ''}
Options to offer:
${offer}
${feedback ? `\nYour previous draft was rejected: ${feedback} Use only the amounts listed above.\n` : ''}
Their message:
"""
${inquiry.rawText}
"""`;
}
