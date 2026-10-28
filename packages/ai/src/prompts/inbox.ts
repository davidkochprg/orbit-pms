import {
  type Currency,
  formatMoney,
  type Inquiry,
  type InquiryExtraction,
  type Language,
  type StayOption,
} from '@orbit/shared';
import { type HotelContext, hotelFacts } from './hotel';

export const languageNames: Record<Language, string> = {
  cs: 'Czech',
  de: 'German',
  en: 'English',
  pl: 'Polish',
};

/** An amount as the drafts state it, e.g. "$1,250" or "12 500 CZK"; the price guard reads it back. */
export function formatAmount(amount: number, currency: Currency): string {
  return formatMoney(amount, currency);
}

export const extractionSystemPrompt = `You read guest messages sent to a small hotel and extract structured data. Never invent anything that is not in the message.

- kind: "booking_request" if they ask for a stay, availability or a price; "question" if they ask about an existing booking or the hotel (arrival time, parking, pets, facilities); otherwise "other".
- language: the language the guest wrote in (cs, de, en or pl).
- checkIn and checkOut: YYYY-MM-DD. checkOut is the departure day. "3 nights from the 14th" means checkOut is 3 days after checkIn. Dates without a year are the next such date on or after today. Use null if not stated.
- adults: number of adults, or null if unknown. A couple is 2, and so is a family with children that does not state how many adults.
- childAges: one age per child. Babies under one year are 0.
- wishes: wellness (sauna, massage, spa), dog (any pet dog), apartment (apartment, holiday flat, "Ferienwohnung", "apartmán").
- question: one English sentence summarising what they ask, or null if they only ask for a stay.`;

/** The conversation oldest first, each message marked as the guest's or the hotel's. */
export function transcript(inquiry: Inquiry): string {
  return inquiry.messages
    .map(
      (m) =>
        `${m.direction === 'in' ? 'Guest' : 'Hotel'} (${m.sentAt.slice(0, 10)}):\n"""\n${m.body}\n"""`,
    )
    .join('\n\n');
}

export function extractionPrompt(inquiry: Inquiry, today: string): string {
  return `Today is ${today}.
Channel: ${inquiry.channel}${inquiry.partner ? ` via ${inquiry.partner}` : ''}
From: ${inquiry.senderName ?? 'unknown'}
Subject: ${inquiry.subject ?? '(none)'}

The conversation, oldest first. Extract what the guest wants as of their latest message.

${transcript(inquiry)}`;
}

export function draftSystemPrompt(hotel: HotelContext): string {
  const { name } = hotel.profile;
  return `You write replies to guests for the reception of ${name}. Warm, short, professional.

Facts you may use (from Settings):
${hotelFacts(hotel)}

Rules:
- Write only in the language you are told to use, and translate every word you take from the options or the facts, such as room types and "total".
- Prices: state each offered room type with its total exactly as written in the options, e.g. "${formatAmount(1250, hotel.pricing.currency)}". Never calculate, round, convert or invent any amount.${hotel.pricing.tax.mode === 'exclusive' ? '\n- The totals are before tax. Say that taxes are added to the bill; never work them out.' : ''}
- Do not confirm a booking. Offer to hold the room for the guest and ask them to reply to confirm.
- Greet the guest by the name they signed with. Don't guess a title such as Mr. or Mrs. from a name.
- If something is not covered by the facts above, say you will check and get back to them. Never invent facilities or prices.
- Output only the message body, without a subject line. Sign off as the reception of ${name}, in the guest's language.`;
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
              `${i + 1}. ${o.roomTypeName} (room ${o.roomName}), ${o.quote.nights} nights: total ${formatAmount(o.quote.total, o.quote.currency)}. Breakdown: ${o.quote.lines.map((l) => `${l.label} ${formatAmount(l.amount, o.quote.currency)}`).join('; ')}`,
          )
          .join('\n')
      : (note ?? 'No room offer: this message is not a booking request.');
  return `Write the reply in ${languageNames[analysis.language]}.
Guest name: ${analysis.guestName ?? inquiry.senderName ?? 'unknown'}
${analysis.question ? `They ask: ${analysis.question}\n` : ''}
Options to offer:
${offer}
${feedback ? `\nYour previous draft was rejected: ${feedback} Use only the amounts listed above.\n` : ''}
Reply to the guest's latest message. The conversation, oldest first:

${transcript(inquiry)}`;
}
