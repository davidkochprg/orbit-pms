import type { Guest, Inquiry } from '@orbit/shared';
import { describe, expect, it } from 'vitest';
import { analysisFacts, bookingPrefillFor, canDecline, channelLabel, snippet } from './inbox';

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
        childAges: [4, 8],
        wishes: { wellness: false, dog: true, apartment: true },
        question: null,
      }),
    ).toEqual([
      'Booking request',
      'German',
      'Fri 6 Nov – Tue 10 Nov',
      '2 adults, 2 children (4, 8)',
      'Apartment',
      'Dog',
    ]);
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
    const m = { status: 'new', bookingId: null } as Inquiry;
    expect(canDecline(m)).toBe(true);
    expect(canDecline({ ...m, status: 'declined' })).toBe(false);
    expect(canDecline({ ...m, bookingId: 'bk_1' })).toBe(false);
  });
});
