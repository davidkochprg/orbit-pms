import { describe, expect, it } from 'vitest';
import type { StayOption } from '@orbit/shared';
import { blockOffer, holdExpiry } from './inbox';

describe('holdExpiry', () => {
  const end = '2026-10-31T21:10:00.000Z';

  it("writes when a hold ends in the hotel's time zone and clock", () => {
    expect(holdExpiry(end, 'US', 'America/Los_Angeles')).toBe('Saturday, October 31 at 2:10 PM');
    expect(holdExpiry(end, 'CZ', 'Europe/Prague')).toBe('Saturday 31 October at 22:10');
  });
});

describe('blockOffer', () => {
  const room = (roomName: string, roomTypeName: string, adults: number, total: number) =>
    ({
      roomId: `rm_${roomName}`,
      roomName,
      roomTypeName,
      kind: 'room',
      quote: {
        roomTypeId: 'rt',
        checkIn: '2026-11-17',
        checkOut: '2026-11-19',
        nights: 2,
        adults,
        childAges: adults === 1 ? [] : [6],
        lines: [],
        total,
        currency: 'USD',
      },
    }) satisfies StayOption;

  it('gives the model the total, the subtotals by type and who sleeps where', () => {
    expect(
      blockOffer({
        rooms: [room('101', 'Queen room', 2, 318), room('108', 'Cozy single', 1, 238)],
        byType: [
          { roomTypeName: 'Cozy single', kind: 'room', count: 1, total: 238 },
          { roomTypeName: 'Queen room', kind: 'room', count: 1, total: 318 },
        ],
        total: 556,
        currency: 'USD',
      }),
    ).toBe(
      [
        'A block of 2 rooms, 2 nights: total for the block $556.',
        'By room type:',
        '- 1 × Cozy single: $238',
        '- 1 × Queen room: $318',
        'Rooms:',
        '- Queen room 101 for 2 adults and children aged 6: $318',
        '- Cozy single 108 for 1 adult: $238',
      ].join('\n'),
    );
  });
});
