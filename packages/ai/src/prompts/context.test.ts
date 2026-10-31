import { describe, expect, it } from 'vitest';
import { contextNote } from './context';

describe('contextNote', () => {
  it('names a booking with its token, guest, room, dates and status', () => {
    expect(
      contextNote({
        kind: 'booking',
        bookingId: 'bk_12',
        guestName: 'Demo Guest',
        roomName: '210',
        checkIn: '2026-10-26',
        checkOut: '2026-10-31',
        status: 'checked_in',
      }),
    ).toBe(
      'The staff member is looking at booking [[bk_12]]: Demo Guest, room 210, 2026-10-26 to 2026-10-31, checked in.',
    );
  });

  it('describes an inbox conversation by what the guest asks for, with a short message', () => {
    const note = contextNote({
      kind: 'inquiry',
      inquiryId: 'inq_4',
      senderName: 'Demo Sender',
      senderAddress: 'demo@example.com',
      request: {
        rooms: null,
        kind: 'booking_request',
        language: 'de',
        guestName: 'Demo Sender',
        checkIn: '2026-11-06',
        checkOut: '2026-11-08',
        adults: 2,
        childAges: [7],
        wishes: { wellness: false, dog: true, apartment: false },
        question: null,
      },
      lastMessage: 'x'.repeat(500),
    });
    expect(note).toContain('the inbox conversation [[inq_4]] with Demo Sender <demo@example.com>');
    expect(note).toContain(
      'They ask for 2026-11-06 to 2026-11-08, 2 adults, children aged 7, a dog.',
    );
    expect(note).toContain('They write in de.');
    expect(note).toMatch(/"x{400}…"$/);
  });

  it('copes with a conversation nothing was read from yet', () => {
    expect(
      contextNote({
        kind: 'inquiry',
        inquiryId: 'inq_9',
        senderName: null,
        senderAddress: null,
        request: null,
        lastMessage: null,
      }),
    ).toBe(
      'The staff member is looking at the inbox conversation [[inq_9]] with a guest, not yet a guest record.',
    );
  });
});
