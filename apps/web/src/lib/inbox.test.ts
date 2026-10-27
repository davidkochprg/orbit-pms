import type { Inquiry } from '@orbit/shared';
import { describe, expect, it } from 'vitest';
import { analysisFacts, channelLabel, snippet } from './inbox';

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
