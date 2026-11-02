import type {
  BookingStatus,
  InquiryExtraction,
  IsoDate,
  Language,
  RoomOccupancy,
  RoomStatus,
} from '@orbit/shared';

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
    }
  | {
      kind: 'room';
      roomId: string;
      roomTypeName: string;
      status: RoomStatus;
      occupancy: RoomOccupancy;
      guestName: string | null;
      /** What is still to do in it, e.g. "Shower drips". */
      openTasks: string[];
    }
  | {
      kind: 'repair';
      taskId: string;
      roomName: string;
      issue: string | null;
      trade: string | null;
      done: boolean;
      /** Who was asked to fix it, once someone was. */
      askedName: string | null;
    }
  | {
      kind: 'contact';
      contactId: string;
      name: string;
      trades: string[];
      email: string | null;
      phone: string | null;
    }
  | { kind: 'note'; title: string; folder: string; until: IsoDate | null }
  | { kind: 'night'; date: IsoDate }
  | { kind: 'tape_chart' | 'report'; from: IsoDate; to: IsoDate };

const occupancyWords: Record<RoomOccupancy, string> = {
  turnover: 'a guest leaves and another arrives today',
  arriving: 'a guest arrives today',
  departing: 'a guest leaves today',
  staying: 'a guest is staying',
  vacant: 'nobody is staying',
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
    case 'room': {
      const guest = subject.guestName ? ` (${subject.guestName})` : '';
      const tasks =
        subject.openTasks.length > 0 ? ` Still to do: ${subject.openTasks.join('; ')}.` : '';
      return `The staff member is looking at room [[${subject.roomId}]], ${subject.roomTypeName}: ${subject.status.replace(/_/g, ' ')}, ${occupancyWords[subject.occupancy]}${guest}.${tasks}`;
    }
    case 'repair': {
      const what = subject.issue ? `"${subject.issue}"` : 'a repair';
      const trade = subject.trade ? ` (${subject.trade})` : '';
      const state = subject.done
        ? 'done'
        : subject.askedName
          ? `${subject.askedName} was asked to fix it`
          : 'nobody asked to fix it yet';
      return `The staff member is looking at the repair ${subject.taskId} in room ${subject.roomName}: ${what}${trade}, ${state}. Use taskId ${subject.taskId}.`;
    }
    case 'contact': {
      const trades = subject.trades.length > 0 ? ` (${subject.trades.join(', ')})` : '';
      const reach = [subject.email, subject.phone].filter(Boolean).join(', ');
      return `The staff member is looking at the contact ${subject.contactId}: ${subject.name}${trades}${reach ? `, ${reach}` : ''}.`;
    }
    case 'note': {
      const until = subject.until ? `, a notice until ${subject.until}` : '';
      return `The staff member is looking at the note "${subject.title}" in Knowledge (${subject.folder})${until}.`;
    }
    case 'night':
      return `The staff member is looking at the night of ${subject.date} on the rate outlook.`;
    case 'tape_chart':
      return `The staff member is looking at the tape chart for the nights ${subject.from} to ${subject.to}.`;
    case 'report':
      return `The staff member is looking at the report for the nights ${subject.from} to ${subject.to}.`;
  }
}
