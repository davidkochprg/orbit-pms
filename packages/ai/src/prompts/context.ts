import type { BookingStatus, InquiryExtraction, IsoDate, Language } from '@orbit/shared';

/** What the staff member was looking at, read by the server from its own data. */
export type ContextSubject =
  | {
      kind: 'booking';
      bookingId: string;
      guestName: string;
      roomName: string;
      checkIn: IsoDate;
      checkOut: IsoDate;
      status: BookingStatus;
    }
  | { kind: 'guest'; guestId: string; name: string; email: string | null; language: Language }
  | {
      kind: 'inquiry';
      inquiryId: string;
      senderName: string | null;
      senderAddress: string | null;
      request: InquiryExtraction | null;
      /** The guest's latest message, cut to a few hundred characters. */
      lastMessage: string | null;
    };

const statusWords: Record<BookingStatus, string> = {
  hold: 'a hold',
  confirmed: 'confirmed',
  checked_in: 'checked in',
  checked_out: 'checked out',
  cancelled: 'cancelled',
};

/** How long a guest's message may be in the note. */
const MESSAGE_LIMIT = 400;

/**
 * The note put before a staff member's message, so "this booking" or "them" can be resolved. It
 * uses the same `[[id]]` tokens as the agent's answers.
 */
export function contextNote(subject: ContextSubject): string {
  switch (subject.kind) {
    case 'booking':
      return `The staff member is looking at booking [[${subject.bookingId}]]: ${subject.guestName}, room ${subject.roomName}, ${subject.checkIn} to ${subject.checkOut}, ${statusWords[subject.status]}.`;
    case 'guest':
      return `The staff member is looking at the profile of guest [[${subject.guestId}]]: ${subject.name}${subject.email ? `, ${subject.email}` : ''}, writes in ${subject.language}.`;
    case 'inquiry': {
      const who = [subject.senderName, subject.senderAddress && `<${subject.senderAddress}>`]
        .filter(Boolean)
        .join(' ');
      const r = subject.request;
      const asks = r
        ? [
            r.checkIn && r.checkOut && `${r.checkIn} to ${r.checkOut}`,
            r.adults && `${r.adults} adult${r.adults === 1 ? '' : 's'}`,
            r.childAges.length > 0 && `children aged ${r.childAges.join(', ')}`,
            r.wishes.dog && 'a dog',
            r.wishes.wellness && 'wellness',
            r.wishes.apartment && 'an apartment',
          ].filter(Boolean)
        : [];
      const message = subject.lastMessage?.trim();
      return [
        `The staff member is looking at the inbox conversation [[${subject.inquiryId}]] with ${who || 'a guest'}, not yet a guest record.`,
        asks.length > 0 && `They ask for ${asks.join(', ')}.`,
        r?.language && `They write in ${r.language}.`,
        message &&
          `Their latest message: "${message.length > MESSAGE_LIMIT ? `${message.slice(0, MESSAGE_LIMIT)}…` : message}"`,
      ]
        .filter(Boolean)
        .join(' ');
    }
  }
}
