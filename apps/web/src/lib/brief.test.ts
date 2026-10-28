import type { Booking, DailyBrief } from '@orbit/shared';
import { describe, expect, it } from 'vitest';
import { attentionItems, gapItems, occupancyPercent } from './brief';

const hold: Booking = {
  id: 'bk_7',
  guestId: 'gst_1',
  roomId: 'rm_201',
  checkIn: '2026-10-30',
  checkOut: '2026-11-01',
  adults: 2,
  childAges: [],
  status: 'hold',
  holdExpiresAt: '2026-10-28T09:00:00.000Z',
  source: 'email',
  addons: { wellness: false, dogs: 0, extraBeds: 0 },
  priceSnapshot: null,
  notes: null,
};

const brief: DailyBrief = {
  date: '2026-10-27',
  occupancy: { occupied: 37, sellable: 49, total: 50 },
  guestsTonight: 81,
  arrivals: 9,
  departures: 7,
  turnovers: [],
  roomsToPrepare: [
    { roomId: 'rm_104', roomName: '104', status: 'dirty', guestName: 'Guest A', bookingId: 'bk_1' },
  ],
  holds: [{ summary: { booking: hold, guestName: 'Guest B', roomName: '201' }, expired: false }],
  outOfOrder: [{ roomId: 'rm_203', roomName: '203' }],
  maintenance: [{ taskId: 'hk_1', roomId: 'rm_203', roomName: '203', notes: 'Tap is dripping.' }],
  missingIds: [
    {
      summary: {
        booking: { ...hold, id: 'bk_8', status: 'checked_in' },
        guestName: 'Guest C',
        roomName: '102',
      },
      missing: 2,
      arriving: false,
    },
  ],
  unansweredMessages: 1,
  gaps: [{ roomId: 'rm_105', roomName: '105', from: '2026-10-28', to: '2026-10-29', nights: 1 }],
};

describe('occupancyPercent', () => {
  it('rounds the share of sellable rooms', () => {
    expect(occupancyPercent(brief.occupancy)).toBe(76);
    expect(occupancyPercent({ occupied: 0, sellable: 0, total: 0 })).toBe(0);
  });
});

describe('attentionItems', () => {
  it('lists rooms to prepare, decisions and repairs in that order', () => {
    expect(attentionItems(brief).map((i) => [i.kind, i.title])).toEqual([
      ['prepare', 'Room 104 is dirty'],
      ['ids', 'Room 102: 2 IDs missing'],
      ['hold', 'Hold for Guest B not confirmed'],
      ['messages', '1 message waiting for a reply'],
      ['out_of_order', 'Room 203 is out of order'],
      ['maintenance', 'Room 203 needs a repair'],
    ]);
  });

  it('links each item to where it is handled', () => {
    const items = attentionItems(brief);
    expect(items.find((i) => i.kind === 'hold')?.target).toEqual({ bookingId: 'bk_7' });
    expect(items.find((i) => i.kind === 'prepare')?.target).toEqual({ path: '/housekeeping' });
    expect(items.find((i) => i.kind === 'ids')).toMatchObject({
      detail: 'Guest C is in house',
      target: { bookingId: 'bk_8' },
    });
  });

  it('says when a hold already lapsed', () => {
    const lapsed = attentionItems({ ...brief, holds: [{ ...brief.holds[0]!, expired: true }] });
    expect(lapsed.find((i) => i.kind === 'hold')).toMatchObject({
      title: 'Hold for Guest B lapsed',
      detail: 'Room 201, arrives Fri 30 Oct',
    });
  });
});

describe('gapItems', () => {
  it('names the room and nights and opens the tape chart at the gap', () => {
    expect(gapItems(brief)).toEqual([
      {
        id: 'gap:rm_105:2026-10-28',
        kind: 'gap',
        title: 'Room 105, 1 night',
        detail: 'Night of Wed 28 Oct',
        target: { path: '/tape-chart?from=2026-10-28' },
      },
    ]);
  });
});
