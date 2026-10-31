import type { Booking, BookingSummary, DailyBrief, KnockOn } from '@orbit/shared';
import { describe, expect, it } from 'vitest';
import { attentionItems, doneOf, gapItems, occupancyPercent } from './brief';

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

  it('puts three or more stays missing IDs, or holds, in one row that opens into them', () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => i);
    const crowded: DailyBrief = {
      ...brief,
      missingIds: many(4).map((i) => ({
        ...brief.missingIds[0]!,
        summary: {
          ...brief.missingIds[0]!.summary,
          booking: { ...hold, id: `bk_id${i}` },
          roomName: `10${i}`,
        },
      })),
      holds: many(3).map((i) => ({
        ...brief.holds[0]!,
        summary: { ...brief.holds[0]!.summary, booking: { ...hold, id: `bk_h${i}` } },
      })),
    };
    const items = attentionItems(crowded);
    const ids = items.find((i) => i.kind === 'ids')!;
    expect(ids).toMatchObject({
      title: '4 stays still need an ID',
      detail: 'Rooms 100, 101, 102 and 1 more',
    });
    expect('items' in ids.target && ids.target.items.map((i) => i.id)).toEqual([
      'ids:bk_id0',
      'ids:bk_id1',
      'ids:bk_id2',
      'ids:bk_id3',
    ]);
    expect(items.find((i) => i.kind === 'hold')?.title).toBe('3 holds waiting for a decision');
    expect(items.filter((i) => i.kind === 'ids' || i.kind === 'hold')).toHaveLength(2);
  });

  it("asks for an inspection when an arrival's room is clean but not inspected", () => {
    const clean = attentionItems({
      ...brief,
      roomsToPrepare: [{ ...brief.roomsToPrepare[0]!, status: 'clean' }],
    });
    expect(clean[0]?.title).toBe('Room 104 needs inspecting');
  });

  it('says when a hold already lapsed', () => {
    const lapsed = attentionItems({ ...brief, holds: [{ ...brief.holds[0]!, expired: true }] });
    expect(lapsed.find((i) => i.kind === 'hold')).toMatchObject({
      title: 'Hold for Guest B lapsed',
      detail: 'Room 201, arrives Fri, Oct 30',
    });
  });
});

describe('attentionItems with knock-ons', () => {
  const knockOns: KnockOn[] = [
    {
      kind: 'relocate',
      id: 'relocate:rm_203',
      roomId: 'rm_203',
      roomName: '203',
      moves: [
        {
          bookingId: 'bk_9',
          guestName: 'Guest D',
          checkIn: '2026-10-28',
          checkOut: '2026-10-30',
          status: 'confirmed',
          toRoomId: 'rm_207',
          toRoomName: '207',
          sameType: true,
        },
      ],
    },
    {
      kind: 'repair',
      id: 'repair:hk_1',
      taskId: 'hk_1',
      roomId: 'rm_203',
      roomName: '203',
      issue: 'Tap is dripping.',
      trade: 'plumbing',
      contact: {
        id: 'ct_1',
        name: 'Example Plumbing',
        person: 'Sam',
        trades: ['plumbing'],
        phone: '+1 555 0100',
        email: null,
        language: 'en',
        notes: null,
      },
    },
    {
      kind: 'opening',
      id: 'opening:inq_1',
      inquiryId: 'inq_1',
      guestName: 'Guest E',
      checkIn: '2026-11-02',
      checkOut: '2026-11-04',
      rooms: 2,
      fromTotal: 318,
    },
  ];

  it('joins stays to move and who to ask to their rows, and lists a freed room for a request', () => {
    const items = attentionItems(brief, knockOns);
    expect(items.map((i) => [i.kind, i.title, i.detail, i.knockOn?.kind])).toEqual([
      ['prepare', 'Room 104 is dirty', 'Guest A arrives today', undefined],
      ['ids', 'Room 102: 2 IDs missing', 'Guest C is in house', undefined],
      ['hold', 'Hold for Guest B not confirmed', expect.any(String), undefined],
      ['opening', 'A room is free for Guest E', expect.stringContaining('from'), 'opening'],
      ['messages', '1 message waiting for a reply', undefined, undefined],
      ['out_of_order', 'Room 203 is out of order', '1 stay to move', 'relocate'],
      ['maintenance', 'Room 203: Tap is dripping', 'Ask Example Plumbing · Sam', 'repair'],
    ]);
  });

  it('leaves rows as they are when their knock-on is gone', () => {
    expect(attentionItems(brief, []).map((i) => i.knockOn)).toEqual(
      attentionItems(brief).map(() => undefined),
    );
  });
});

describe('gapItems', () => {
  it('names the room and nights and opens the tape chart at the gap', () => {
    expect(gapItems(brief)).toEqual([
      {
        id: 'gap:rm_105:2026-10-28',
        kind: 'gap',
        title: 'Room 105, 1 night',
        detail: 'Night of Wed, Oct 28',
        target: { path: '/tape-chart?from=2026-10-28' },
      },
    ]);
  });
});

describe('doneOf', () => {
  const row = (status: Booking['status']): BookingSummary => ({
    booking: { ...hold, status },
    guestName: 'Guest A',
    roomName: '201',
  });

  it('counts arrivals that are in, including any that already left', () => {
    expect(doneOf([row('confirmed'), row('checked_in'), row('checked_out')], 'checked_in')).toBe(
      '2 of 3',
    );
  });

  it('counts departures that are out', () => {
    expect(doneOf([row('checked_in'), row('checked_out')], 'checked_out')).toBe('1 of 2');
    expect(doneOf([], 'checked_out')).toBe('0 of 0');
  });
});
