import type { BookingSummary, DailyBrief, DayOverview } from '@orbit/shared';
import { describe, expect, it } from 'vitest';
import { sceneMessages } from './scene-messages';

const summary = (guestName: string, roomName: string): BookingSummary => ({
  booking: {
    id: `bk_${roomName}`,
    guestId: 'gst_1',
    roomId: `rm_${roomName}`,
    checkIn: '2026-10-27',
    checkOut: '2026-10-29',
    adults: 2,
    childAges: [],
    status: 'hold',
    holdExpiresAt: null,
    source: 'email',
    addons: { wellness: false, dogs: 0, extraBeds: 0 },
    priceSnapshot: null,
    notes: null,
  },
  guestName,
  roomName,
});

const brief: DailyBrief = {
  date: '2026-10-27',
  occupancy: { occupied: 25, sellable: 50, total: 50 },
  guestsTonight: 53,
  arrivals: 2,
  departures: 1,
  turnovers: [],
  roomsToPrepare: [
    { roomId: 'rm_205', roomName: '205', status: 'dirty', guestName: 'Guest A', bookingId: 'b' },
  ],
  holds: [{ summary: summary('Guest Hold', '409'), expired: false }],
  outOfOrder: [],
  maintenance: [
    { taskId: 'hk_1', roomId: 'rm_203', roomName: '203', notes: 'Bathroom tap is dripping.' },
  ],
  missingIds: [],
  unansweredMessages: 1,
  gaps: [{ roomId: 'rm_407', roomName: '407', from: '2026-10-28', to: '2026-10-30', nights: 2 }],
};

const day: DayOverview = {
  date: '2026-10-27',
  arrivals: [summary('Ana Arrive', '104'), summary('Ben Arrive', '201')],
  departures: [summary('Cy Leave', '303')],
  inHouse: [],
};

describe('sceneMessages', () => {
  const messages = sceneMessages(brief, day);

  it('covers arrivals, departures, occupancy, rooms and the desk', () => {
    expect(messages).toEqual(
      expect.arrayContaining([
        'RM 104 · ANA ARRIVE · ARRIVING',
        'RM 303 · CY LEAVE · CHECKING OUT',
        'OCC 50% · 25 OF 50 ROOMS TONIGHT',
        '53 GUESTS IN HOUSE · 2 IN · 1 OUT',
        'RM 205 · DIRTY · GUEST DUE TODAY',
        'HOLD · GUEST HOLD · RM 409',
        '1 GUEST MESSAGE WAITING',
        'RM 407 · 2 EMPTY NIGHTS · WED 28 OCT',
      ]),
    );
  });

  it('alternates between kinds of news', () => {
    expect(messages.slice(0, 3)).toEqual([
      'RM 104 · ANA ARRIVE · ARRIVING',
      'OCC 50% · 25 OF 50 ROOMS TONIGHT',
      'RM 303 · CY LEAVE · CHECKING OUT',
    ]);
  });

  it('keeps every line short enough for the scene', () => {
    expect(messages.every((m) => m.length <= 46)).toBe(true);
    expect(messages).toContain('RM 203 · REPAIR · BATHROOM TAP IS DRIPPING');
    const long = sceneMessages(
      {
        ...brief,
        maintenance: [
          { ...brief.maintenance[0]!, notes: 'Wardrobe door hinge is loose and squeaks' },
        ],
      },
      day,
    );
    const clipped = long.find((m) => m.startsWith('RM 203'))!;
    expect(clipped).toHaveLength(46);
    expect(clipped).toMatch(/…$/);
  });

  it('still has something to say before the day overview loads', () => {
    expect(sceneMessages(brief, undefined).length).toBeGreaterThan(3);
  });
});
