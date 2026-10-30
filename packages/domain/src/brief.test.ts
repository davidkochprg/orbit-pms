import type { Guest, HousekeepingTask, Inquiry, InquiryStatus, StayGuest } from '@orbit/shared';
import { describe, expect, it } from 'vitest';
import { briefBookingRange, buildDailyBrief, findGaps } from './brief';
import { guestBookRulesFor } from './policy';
import { conversation } from './testing';
import { booking, room } from './test-fixtures';

const date = '2026-05-10';
const now = new Date('2026-05-10T08:00:00Z');

const guests: Guest[] = ['a', 'b', 'c'].map((id) => ({
  id: `gst_${id}`,
  name: `Guest ${id.toUpperCase()}`,
  email: null,
  phone: null,
  language: 'en',
  notes: null,
}));

function inquiry(id: string, status: InquiryStatus): Inquiry {
  return conversation({ id, status });
}

function maintenance(roomId: string, overrides: Partial<HousekeepingTask> = {}): HousekeepingTask {
  return {
    id: `hk_${roomId}`,
    roomId,
    type: 'maintenance',
    status: 'open',
    notes: 'Lamp broken.',
    trade: 'electrical',
    contactId: null,
    createdAt: '2026-05-10T06:00:00.000Z',
    ...overrides,
  };
}

const empty = {
  guests,
  bookings: [],
  tasks: [],
  inquiries: [],
  stayGuests: [] as StayGuest[],
  rules: guestBookRulesFor('CZ'),
};

function entry(bookingId: string, overrides: Partial<StayGuest> = {}): StayGuest {
  return {
    id: `sg_${bookingId}`,
    bookingId,
    guestId: null,
    name: 'Demo Person',
    nationality: 'CZ',
    dateOfBirth: '1980-01-01',
    documentType: 'id_card',
    documentNumber: 'DEMO-1',
    address: null,
    registeredAt: '2026-05-10T07:00:00.000Z',
    createdAt: '2026-05-10T07:00:00.000Z',
    ...overrides,
  };
}

describe('briefBookingRange', () => {
  it('reaches back and ahead far enough to see gaps at both ends', () => {
    expect(briefBookingRange(date)).toEqual({ from: '2026-05-08', to: '2026-05-26' });
  });
});

describe('buildDailyBrief', () => {
  it('counts occupancy and guests tonight from stays that block a room', () => {
    const rooms = [room('101'), room('102'), room('103'), room('104', { status: 'out_of_order' })];
    const brief = buildDailyBrief({
      ...empty,
      date,
      now,
      rooms,
      bookings: [
        booking({
          roomId: '101',
          checkIn: '2026-05-08',
          checkOut: '2026-05-12',
          status: 'checked_in',
          childAges: [4],
        }),
        // Leaves today: not here tonight.
        booking({ roomId: '102', checkIn: '2026-05-07', checkOut: date, status: 'checked_in' }),
        // A lapsed hold does not hold the room.
        booking({
          roomId: '103',
          checkIn: date,
          checkOut: '2026-05-12',
          status: 'hold',
          holdExpiresAt: '2026-05-10T07:00:00.000Z',
        }),
      ],
    });
    expect(brief.occupancy).toEqual({ occupied: 1, sellable: 3, total: 4 });
    expect(brief.guestsTonight).toBe(3);
    expect(brief.departures).toBe(1);
  });

  it('lists same-day turnovers with both guests', () => {
    const brief = buildDailyBrief({
      ...empty,
      date,
      now,
      rooms: [room('101', { status: 'dirty' })],
      bookings: [
        booking({
          roomId: '101',
          guestId: 'gst_a',
          checkIn: '2026-05-07',
          checkOut: date,
          status: 'checked_in',
        }),
        booking({ roomId: '101', guestId: 'gst_b', checkIn: date, checkOut: '2026-05-12' }),
      ],
    });
    expect(brief.turnovers).toEqual([
      {
        roomId: '101',
        roomName: '101',
        status: 'dirty',
        departingGuest: 'Guest A',
        arrivingGuest: 'Guest B',
      },
    ]);
  });

  it('flags arrival rooms that are not inspected, but not guests already checked in', () => {
    const brief = buildDailyBrief({
      ...empty,
      date,
      now,
      rooms: [
        room('101', { status: 'dirty' }),
        room('102', { status: 'inspected' }),
        room('103', { status: 'clean' }),
      ],
      bookings: [
        booking({
          roomId: '101',
          id: 'bk_1',
          guestId: 'gst_a',
          checkIn: date,
          checkOut: '2026-05-12',
        }),
        booking({ roomId: '102', checkIn: date, checkOut: '2026-05-12' }),
        booking({ roomId: '103', checkIn: date, checkOut: '2026-05-12', status: 'checked_in' }),
      ],
    });
    expect(brief.roomsToPrepare).toEqual([
      { roomId: '101', roomName: '101', status: 'dirty', guestName: 'Guest A', bookingId: 'bk_1' },
    ]);
  });

  it('lists holds that lapsed, expire within a day or arrive within a week', () => {
    const rooms = ['101', '102', '103', '104'].map((id) => room(id));
    const brief = buildDailyBrief({
      ...empty,
      date,
      now,
      rooms,
      bookings: [
        booking({
          roomId: '101',
          id: 'bk_lapsed',
          checkIn: '2026-05-20',
          checkOut: '2026-05-22',
          status: 'hold',
          holdExpiresAt: '2026-05-10T07:59:00.000Z',
        }),
        booking({
          roomId: '102',
          id: 'bk_soon',
          checkIn: '2026-05-25',
          checkOut: '2026-05-27',
          status: 'hold',
          holdExpiresAt: '2026-05-11T07:00:00.000Z',
        }),
        booking({
          roomId: '103',
          id: 'bk_near',
          checkIn: '2026-05-16',
          checkOut: '2026-05-18',
          status: 'hold',
          holdExpiresAt: '2026-05-12T08:00:00.000Z',
        }),
        // Far off and not expiring soon.
        booking({
          roomId: '104',
          id: 'bk_later',
          checkIn: '2026-05-17',
          checkOut: '2026-05-19',
          status: 'hold',
          holdExpiresAt: '2026-05-12T08:00:00.000Z',
        }),
      ],
    });
    expect(brief.holds.map((h) => [h.summary.booking.id, h.expired])).toEqual([
      ['bk_near', false],
      ['bk_lapsed', true],
      ['bk_soon', false],
    ]);
  });

  it('collects out-of-order rooms, open maintenance and unanswered messages', () => {
    const brief = buildDailyBrief({
      ...empty,
      date,
      now,
      rooms: [room('101', { status: 'out_of_order' }), room('102')],
      tasks: [
        maintenance('102'),
        maintenance('101', { id: 'hk_done', status: 'done' }),
        maintenance('101', { id: 'hk_turn', type: 'turnover' }),
      ],
      inquiries: [
        inquiry('m1', 'new'),
        inquiry('m2', 'quoted'),
        inquiry('m3', 'replied'),
        inquiry('m4', 'converted'),
      ],
    });
    expect(brief.outOfOrder).toEqual([{ roomId: '101', roomName: '101' }]);
    expect(brief.maintenance).toEqual([
      { taskId: 'hk_102', roomId: '102', roomName: '102', notes: 'Lamp broken.' },
    ]);
    expect(brief.unansweredMessages).toBe(2);
  });
});

describe('findGaps', () => {
  const rooms = [room('101'), room('102')];

  it('finds one- and two-night gaps between stays, but not longer ones', () => {
    const gaps = findGaps({
      date,
      now,
      rooms,
      bookings: [
        booking({ roomId: '101', checkIn: '2026-05-09', checkOut: '2026-05-11' }),
        booking({ roomId: '101', checkIn: '2026-05-12', checkOut: '2026-05-14' }),
        booking({ roomId: '101', checkIn: '2026-05-16', checkOut: '2026-05-18' }),
        booking({ roomId: '101', checkIn: '2026-05-21', checkOut: '2026-05-23' }),
        // Same-day turnover is no gap.
        booking({ roomId: '102', checkIn: '2026-05-09', checkOut: '2026-05-12' }),
        booking({ roomId: '102', checkIn: '2026-05-12', checkOut: '2026-05-14' }),
      ],
    });
    expect(gaps).toEqual([
      { roomId: '101', roomName: '101', from: '2026-05-11', to: '2026-05-12', nights: 1 },
      { roomId: '101', roomName: '101', from: '2026-05-14', to: '2026-05-16', nights: 2 },
    ]);
  });

  it('counts a gap already under way from today', () => {
    const gaps = findGaps({
      date,
      now,
      rooms,
      bookings: [
        booking({
          roomId: '101',
          checkIn: '2026-05-06',
          checkOut: '2026-05-09',
          status: 'checked_out',
        }),
        booking({ roomId: '101', checkIn: '2026-05-05', checkOut: '2026-05-09' }),
        booking({ roomId: '101', checkIn: '2026-05-11', checkOut: '2026-05-13' }),
      ],
    });
    expect(gaps).toEqual([
      { roomId: '101', roomName: '101', from: date, to: '2026-05-11', nights: 1 },
    ]);
  });

  it('ignores gaps past the horizon, unbounded vacancy, out-of-order rooms and lapsed holds', () => {
    const gaps = findGaps({
      date,
      now,
      rooms: [room('101'), room('102', { status: 'out_of_order' }), room('103')],
      bookings: [
        // Starts on the horizon's last day + 1.
        booking({ roomId: '101', checkIn: '2026-05-20', checkOut: '2026-05-24' }),
        booking({ roomId: '101', checkIn: '2026-05-25', checkOut: '2026-05-27' }),
        booking({ roomId: '102', checkIn: '2026-05-10', checkOut: '2026-05-12' }),
        booking({ roomId: '102', checkIn: '2026-05-13', checkOut: '2026-05-15' }),
        booking({ roomId: '103', checkIn: '2026-05-10', checkOut: '2026-05-12' }),
        booking({
          roomId: '103',
          checkIn: '2026-05-13',
          checkOut: '2026-05-15',
          status: 'hold',
          holdExpiresAt: '2026-05-10T07:00:00.000Z',
        }),
      ],
    });
    expect(gaps).toEqual([]);
  });

  it('keeps a gap that starts on the last day of the horizon', () => {
    const gaps = findGaps({
      date,
      now,
      rooms,
      bookings: [
        booking({ roomId: '101', checkIn: '2026-05-20', checkOut: '2026-05-23' }),
        booking({ roomId: '101', checkIn: '2026-05-24', checkOut: '2026-05-26' }),
      ],
    });
    expect(gaps).toEqual([
      { roomId: '101', roomName: '101', from: '2026-05-23', to: '2026-05-24', nights: 1 },
    ]);
  });

  it('lists arrivals and in-house stays whose guest book is incomplete', () => {
    const brief = buildDailyBrief({
      ...empty,
      date,
      now,
      rooms: [room('101'), room('102'), room('103'), room('104')],
      bookings: [
        // Arriving, one of two registered.
        booking({ id: 'arr', roomId: '102', guestId: 'gst_a', checkIn: date, adults: 2 }),
        // In house, nobody registered.
        booking({
          id: 'in',
          roomId: '101',
          guestId: 'gst_b',
          checkIn: '2026-05-08',
          checkOut: '2026-05-12',
          adults: 1,
          status: 'checked_in',
        }),
        // In house and complete.
        booking({
          id: 'done',
          roomId: '103',
          guestId: 'gst_c',
          checkIn: '2026-05-09',
          checkOut: '2026-05-11',
          adults: 1,
          status: 'checked_in',
        }),
        // A hold isn't a stay yet.
        booking({ id: 'hold', roomId: '104', guestId: 'gst_c', checkIn: date, status: 'hold' }),
      ],
      stayGuests: [entry('arr'), entry('done')],
    });
    expect(
      brief.missingIds.map((m) => [m.summary.roomName, m.summary.guestName, m.missing, m.arriving]),
    ).toEqual([
      ['101', 'Guest B', 1, false],
      ['102', 'Guest A', 1, true],
    ]);
  });
});
