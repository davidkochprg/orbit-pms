import type { Guest, Inquiry } from '@orbit/shared';
import { describe, expect, it } from 'vitest';
import {
  analysisFacts,
  awaitingReply,
  bookingPrefillFor,
  canDecline,
  channelLabel,
  channelsOf,
  conversationsOf,
  filterConversations,
  folderCounts,
  labelCounts,
  guessLanguage,
  guestLanguage,
  preview,
  sendLabel,
  snippet,
} from './inbox';

describe('inbox display helpers', () => {
  it('labels OTA messages by partner and direct ones by channel', () => {
    expect(channelLabel({ partner: 'Booking.com', channel: 'ota' } as Inquiry)).toBe('Booking.com');
    expect(channelLabel({ partner: null, channel: 'email' } as Inquiry)).toBe('Email');
  });

  it('shortens long messages to one line', () => {
    expect(snippet('Dobrý den,\nchtěli bychom', 12)).toBe('Dobrý den, …');
  });

  it('lists what the agent understood', () => {
    expect(
      analysisFacts({
        kind: 'booking_request',
        language: 'de',
        guestName: null,
        checkIn: '2026-11-06',
        checkOut: '2026-11-10',
        adults: 2,
        rooms: null,
        childAges: [4, 8],
        wishes: { wellness: false, dog: true, apartment: true },
        question: null,
      }),
    ).toEqual([
      'Booking request',
      'German',
      'Fri, Nov 6 – Tue, Nov 10',
      '2 adults, 2 children (4, 8)',
      'Apartment',
      'Dog',
    ]);
  });

  it('says how many rooms a group asks for', () => {
    const group = {
      kind: 'booking_request',
      language: 'en',
      guestName: null,
      checkIn: '2026-11-17',
      checkOut: '2026-11-19',
      adults: 9,
      rooms: 8,
      childAges: [],
      wishes: { wellness: false, dog: false, apartment: false },
      question: null,
    } as const;
    expect(analysisFacts({ ...group, childAges: [] })).toContain('8 rooms');
    expect(analysisFacts({ ...group, childAges: [], rooms: 1 })).not.toContain('1 rooms');
  });
});

describe('bookingPrefillFor', () => {
  const message = {
    id: 'inq_1',
    channel: 'ota',
    partner: 'Booking.com',
    senderName: 'Familie Beispiel',
    senderAddress: 'Familie@Example.com',
    status: 'quoted',
    bookingId: null,
    blockBookingIds: [],
    parsed: {
      kind: 'booking_request',
      language: 'de',
      guestName: null,
      checkIn: '2026-11-02',
      checkOut: '2026-11-05',
      adults: 2,
      childAges: [4],
      wishes: { wellness: true, dog: false, apartment: false },
      question: null,
    },
  } as unknown as Inquiry;

  it('fills the stay the agent read and links the message', () => {
    expect(bookingPrefillFor(message, [])).toMatchObject({
      inquiryId: 'inq_1',
      source: 'ota',
      checkIn: '2026-11-02',
      checkOut: '2026-11-05',
      adults: 2,
      childAges: [4],
      addons: { wellness: true, dogs: 0, extraBeds: 0 },
      newGuest: { name: 'Familie Beispiel', email: 'Familie@Example.com', language: 'de' },
    });
  });

  it('reuses a guest whose email matches, ignoring case', () => {
    const known = { id: 'gst_7', email: 'familie@example.com' } as Guest;
    const prefill = bookingPrefillFor(message, [known]);
    expect(prefill.guestId).toBe('gst_7');
    expect(prefill.newGuest).toBeUndefined();
  });

  it('works without an extraction', () => {
    expect(bookingPrefillFor({ ...message, parsed: null }, [])).toEqual({
      inquiryId: 'inq_1',
      source: 'ota',
      newGuest: { name: 'Familie Beispiel', email: 'Familie@Example.com', language: 'en' },
    });
  });
});

describe('canDecline', () => {
  it('is false once the message is declined or led to a booking', () => {
    const m = { status: 'new', bookingId: null, parsed: null } as Inquiry;
    expect(canDecline(m)).toBe(true);
    expect(canDecline({ ...m, status: 'declined' })).toBe(false);
    expect(canDecline({ ...m, bookingId: 'bk_1' })).toBe(false);
  });

  it('is only offered for booking requests once Orbit has read the message', () => {
    const m = { status: 'new', bookingId: null } as Inquiry;
    const read = (kind: 'booking_request' | 'question' | 'other') =>
      ({ ...m, parsed: { kind } }) as Inquiry;
    expect(canDecline(read('booking_request'))).toBe(true);
    expect(canDecline(read('question'))).toBe(false);
    expect(canDecline(read('other'))).toBe(false);
  });
});

describe('conversationsOf', () => {
  it("finds a guest's conversations by their booking or email, latest first", () => {
    const all = [
      conversation({
        id: 'a',
        senderAddress: 'Ruby@Example.com',
        lastMessageAt: '2026-10-27T10:00:00.000Z',
      }),
      conversation({ id: 'b', bookingId: 'bk_1', lastMessageAt: '2026-10-28T10:00:00.000Z' }),
      conversation({ id: 'c', senderAddress: 'other@example.com' }),
    ];
    expect(conversationsOf(all, { email: 'ruby@example.com' }, ['bk_1']).map((m) => m.id)).toEqual([
      'b',
      'a',
    ]);
    expect(conversationsOf(all, { email: null }, []).map((m) => m.id)).toEqual([]);
  });
});

function conversation(overrides: Partial<Inquiry> & { id: string }): Inquiry {
  return {
    channel: 'email',
    partner: null,
    subject: null,
    senderName: 'Demo Guest',
    senderAddress: 'demo@example.com',
    receivedAt: '2026-10-27T08:00:00.000Z',
    lastMessageAt: '2026-10-27T08:00:00.000Z',
    messages: [
      {
        id: `msg_${overrides.id}`,
        inquiryId: overrides.id,
        direction: 'in',
        body: 'Dobrý den, máte volný pokoj?',
        sentAt: '2026-10-27T08:00:00.000Z',
        author: null,
        translation: null,
        to: [],
        cc: [],
        bcc: [],
        attachments: [],
      },
    ],
    unread: false,
    archivedAt: null,
    starred: false,
    trashedAt: null,
    labelIds: [],
    parsed: null,
    suggestion: null,
    status: 'new',
    bookingId: null,
    blockBookingIds: [],
    processedAt: null,
    processingError: null,
    ...overrides,
  };
}

describe('mailbox views', () => {
  const asked = conversation({ id: 'a', unread: true, subject: 'Pokoj na víkend' });
  const answered = conversation({
    id: 'b',
    channel: 'ota',
    partner: 'Booking.com',
    messages: [
      ...asked.messages,
      {
        id: 'msg_b2',
        inquiryId: 'b',
        direction: 'out',
        body: 'Ano, máme.',
        sentAt: '2026-10-27T09:00:00.000Z',
        author: 'Petr',
        translation: null,
        to: [],
        cc: [],
        bcc: [],
        attachments: [],
      },
    ],
  });
  const archived = conversation({ id: 'c', archivedAt: '2026-10-27T10:00:00.000Z' });
  const all = [asked, answered, archived];

  it('sorts conversations into folders', () => {
    const ids = (folder: Parameters<typeof filterConversations>[1]['folder']) =>
      filterConversations(all, { folder, label: null, channel: null, query: '' }).map((m) => m.id);
    expect(ids('inbox')).toEqual(['a', 'b']);
    expect(ids('awaiting')).toEqual(['a']);
    expect(ids('sent')).toEqual(['b']);
    expect(ids('archived')).toEqual(['c']);
    expect(folderCounts(all)).toEqual({ unread: 1, awaiting: 1, starred: 0, trash: 0 });
  });

  it('keeps trashed conversations out of every folder and label but Trash', () => {
    const gone = conversation({ id: 'd', trashedAt: '2026-10-27T10:00:00.000Z', labelIds: ['l'] });
    const filed = conversation({ id: 'e', labelIds: ['l'], starred: true, unread: true });
    const list = [...all, gone, filed];
    const ids = (
      folder: Parameters<typeof filterConversations>[1]['folder'],
      label: string | null = null,
    ) => filterConversations(list, { folder, label, channel: null, query: '' }).map((m) => m.id);
    expect(ids('trash')).toEqual(['d']);
    expect(ids('inbox')).not.toContain('d');
    expect(ids('starred')).toEqual(['e']);
    expect(ids('inbox', 'l')).toEqual(['e']);
    expect(labelCounts(list).get('l')).toBe(1);
  });

  it('filters by channel and searches without accents', () => {
    expect(channelsOf(all)).toEqual(['Booking.com', 'Email']);
    expect(
      filterConversations(all, {
        folder: 'inbox',
        label: null,
        channel: 'Booking.com',
        query: '',
      }).map((m) => m.id),
    ).toEqual(['b']);
    expect(
      filterConversations(all, {
        folder: 'inbox',
        label: null,
        channel: null,
        query: 'vikend',
      }).map((m) => m.id),
    ).toEqual(['a']);
    expect(
      filterConversations(all, {
        folder: 'inbox',
        label: null,
        channel: null,
        query: 'ano, MAME',
      }).map((m) => m.id),
    ).toEqual(['b']);
  });

  it('previews the latest message and replies the way the guest wrote', () => {
    expect(preview(answered)).toBe('You: Ano, máme.');
    expect(awaitingReply(answered)).toBe(false);
    expect(awaitingReply({ ...asked, status: 'declined' })).toBe(false);
    expect(sendLabel(answered)).toBe('Send via Booking.com');
    expect(sendLabel(asked)).toBe('Send email');
  });
});

describe('guessLanguage', () => {
  it('recognises the hotel languages from everyday words', () => {
    expect(guessLanguage('Guten Tag, wir sind eine Familie und suchen ein Zimmer.')).toBe('de');
    expect(guessLanguage('Dobrý den, máte volný pokoj na víkend?')).toBe('cs');
    expect(guessLanguage('Dzień dobry, czy jest wolny pokój?')).toBe('pl');
    expect(guessLanguage('Hello, is there parking? Thanks!')).toBe('en');
    expect(guessLanguage('OK')).toBe(null);
  });

  it('prefers what the agent read over the guess', () => {
    const m = conversation({ id: 'g' });
    expect(guestLanguage(m)).toBe('cs');
    expect(guestLanguage({ ...m, parsed: { language: 'de' } as Inquiry['parsed'] })).toBe('de');
  });
});
