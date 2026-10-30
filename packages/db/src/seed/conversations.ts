import type {
  Booking,
  Guest,
  HotelProfile,
  InboxMessage,
  Inquiry,
  IsoDate,
  StaffMember,
} from '@orbit/shared';

const HOUR = 3600_000;

export interface Line extends Partial<Pick<InboxMessage, 'to' | 'cc' | 'attachments'>> {
  direction: InboxMessage['direction'];
  body: string;
  hoursAgo: number;
  author?: string;
}

export function thread(
  id: string,
  now: Date,
  lines: Line[],
  fields: Pick<Inquiry, 'channel' | 'partner' | 'subject' | 'senderName' | 'senderAddress'> &
    Partial<
      Pick<
        Inquiry,
        'bookingId' | 'archivedAt' | 'status' | 'unread' | 'starred' | 'trashedAt' | 'labelIds'
      >
    >,
): Inquiry {
  const messages: InboxMessage[] = lines.map((l, i) => ({
    id: `msg_${id}_${i + 1}`,
    inquiryId: id,
    direction: l.direction,
    body: l.body,
    sentAt: new Date(now.getTime() - l.hoursAgo * HOUR).toISOString(),
    author: l.author ?? null,
    translation: null,
    to: l.to ?? [],
    cc: l.cc ?? [],
    bcc: [],
    attachments: l.attachments ?? [],
  }));
  return {
    id,
    receivedAt: messages[0]!.sentAt,
    lastMessageAt: messages.at(-1)!.sentAt,
    messages,
    unread: false,
    archivedAt: null,
    starred: false,
    trashedAt: null,
    labelIds: [],
    parsed: null,
    suggestion: null,
    status: 'replied',
    bookingId: null,
    processedAt: null,
    processingError: null,
    ...fields,
  };
}

/**
 * Conversations with history, so the inbox reads like a mailbox and not only a queue of
 * requests: a Booking.com exchange about an upcoming stay, an archived thank-you with a lost
 * charger, and an email the hotel wrote first. All synthetic, built around seeded bookings.
 */
export function buildConversations(
  bookings: Booking[],
  guests: Guest[],
  team: StaffMember[],
  profile: HotelProfile,
  today: IsoDate,
  now: Date,
): Inquiry[] {
  const guest = (b: Booking) => guests.find((g) => g.id === b.guestId)!;
  const desk = team.filter((s) => s.active && s.role === 'receptionist').map((s) => s.name);
  const manager = team.find((s) => s.active && s.role === 'manager')?.name;
  // "15:00" as a US guest reads it ("3 PM"), as written elsewhere.
  const [hour = 15, minute = 0] = profile.checkInFrom.split(':').map(Number);
  const checkIn =
    profile.country === 'US'
      ? `${hour % 12 || 12}${minute ? `:${String(minute).padStart(2, '0')}` : ''} ${hour < 12 ? 'AM' : 'PM'}`
      : profile.checkInFrom;
  const conversations: Inquiry[] = [];

  const otaStay = bookings.find(
    (b) =>
      b.source === 'ota' &&
      b.status === 'confirmed' &&
      b.checkIn > today &&
      guest(b).language === 'de',
  );
  if (otaStay) {
    const g = guest(otaStay);
    conversations.push(
      thread(
        'inq_seed_ota',
        now,
        [
          {
            direction: 'in',
            hoursAgo: 30,
            body: `Guten Tag,\nwir kommen erst gegen 22 Uhr an. Ist das ein Problem? Gibt es eine Möglichkeit, den Schlüssel später abzuholen?\nViele Grüße\n${g.name}`,
          },
          {
            direction: 'out',
            hoursAgo: 28,
            ...(desk[0] && { author: desk[0] }),
            body: `Guten Tag,\n\nkein Problem: Die Rezeption ist bis 22:30 besetzt. Sollten Sie später kommen, hinterlegen wir Ihren Schlüssel in der Schlüsselbox neben dem Eingang und schicken Ihnen den Code am Anreisetag.\n\nMit freundlichen Grüßen\nIhre Rezeption`,
          },
          {
            direction: 'in',
            hoursAgo: 26,
            body: 'Vielen Dank, das ist sehr hilfreich! Bis bald.',
          },
        ],
        {
          channel: 'ota',
          partner: 'Booking.com',
          subject: 'Späte Anreise',
          senderName: g.name,
          senderAddress: null,
          bookingId: otaStay.id,
        },
      ),
    );
  }

  const pastStay = bookings
    .filter((b) => b.status === 'checked_out' && guest(b).language === 'en' && guest(b).email)
    .at(-1);
  if (pastStay) {
    const g = guest(pastStay);
    conversations.push(
      thread(
        'inq_seed_charger',
        now,
        [
          {
            direction: 'in',
            hoursAgo: 96,
            body: `Hello,\n\nthank you for a lovely stay! I think I left my phone charger plugged in next to the bed. Could you check?\n\nBest,\n${g.name}`,
          },
          {
            direction: 'out',
            hoursAgo: 94,
            ...(desk[1] && { author: desk[1] }),
            body: `Dear ${g.name.split(' ')[0]},\n\nthank you for staying with us. Housekeeping found the charger, and we will post it to you this week.\n\nKind regards,\nReception`,
          },
        ],
        {
          channel: 'email',
          partner: null,
          subject: 'Charger left in the room',
          senderName: g.name,
          senderAddress: g.email,
          archivedAt: new Date(now.getTime() - 90 * HOUR).toISOString(),
        },
      ),
    );
  }

  const nextStay = bookings.find(
    (b) =>
      b.status === 'confirmed' &&
      b.checkIn > today &&
      guest(b).language === 'en' &&
      guest(b).email &&
      b.id !== otaStay?.id,
  );
  if (nextStay) {
    const g = guest(nextStay);
    conversations.push(
      thread(
        'inq_seed_welcome',
        now,
        [
          {
            direction: 'out',
            hoursAgo: 5,
            ...(manager && { author: manager }),
            body: `Dear ${g.name.split(' ')[0]},\n\nwe look forward to welcoming you soon. Check-in is from ${checkIn}, and parking is free. If you would like to book the sauna, just reply to this email.\n\nKind regards,\nReception`,
          },
        ],
        {
          channel: 'email',
          partner: null,
          subject: 'Before your stay',
          senderName: g.name,
          senderAddress: g.email,
          bookingId: nextStay.id,
        },
      ),
    );
  }
  return conversations;
}
