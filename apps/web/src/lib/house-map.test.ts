import type { HousekeepingRoom, RoomOccupancy, RoomStatus } from '@orbit/shared';
import { describe, expect, it } from 'vitest';
import { houseFloors, stayByRoom, tonightByRoom } from './house-map';

function room(
  name: string,
  floor: number,
  occupancy: RoomOccupancy,
  status: RoomStatus = 'clean',
  guestName: string | null = null,
): HousekeepingRoom {
  return {
    room: { id: `rm_${name}`, name, roomTypeId: 'rt_1', kind: 'room', floor, status },
    roomTypeName: 'Double room',
    occupancy,
    guestName,
    urgent: false,
    effort: null,
    cues: [],
    openTasks: [],
  };
}

describe('houseFloors', () => {
  it('stacks floors from the top down with the ground floor as G', () => {
    const floors = houseFloors([
      room('A1', 0, 'vacant'),
      room('201', 2, 'staying'),
      room('101', 1, 'vacant'),
    ]);
    expect(floors.map((f) => f.label)).toEqual(['2', '1', 'G']);
  });

  it('orders rooms by name, numbers numerically', () => {
    const [floor] = houseFloors([
      room('110', 1, 'vacant'),
      room('102', 1, 'vacant'),
      room('109', 1, 'vacant'),
    ]);
    expect(floor?.rooms.map((r) => r.name)).toEqual(['102', '109', '110']);
  });

  it('shows out-of-order rooms as out of order whatever the bookings say', () => {
    const [floor] = houseFloors([room('203', 2, 'staying', 'out_of_order', 'Guest A')]);
    expect(floor?.rooms[0]).toMatchObject({
      state: 'out_of_order',
      label: 'Room 203, out of order',
    });
  });

  it('names the guest in occupied rooms only', () => {
    const [floor] = houseFloors([
      room('205', 2, 'turnover', 'dirty', 'Guest B'),
      room('206', 2, 'vacant', 'clean', null),
    ]);
    expect(floor?.rooms.map((r) => r.label)).toEqual([
      'Room 205, confirmed, Guest B',
      'Room 206, free',
    ]);
  });

  it("colors rooms by tonight's stay, like the tape chart", () => {
    const tonight = new Map([
      ['rm_201', 'checked_in' as const],
      ['rm_202', 'hold' as const],
    ]);
    const [floor] = houseFloors(
      [
        room('201', 2, 'arriving'),
        room('202', 2, 'arriving'),
        room('203', 2, 'departing'),
        room('204', 2, 'vacant'),
      ],
      tonight,
    );
    expect(floor?.rooms.map((r) => r.state)).toEqual(['checked_in', 'hold', 'leaving', 'vacant']);
  });

  it('falls back to occupancy until the day has loaded', () => {
    const [floor] = houseFloors([room('201', 2, 'staying'), room('202', 2, 'turnover')]);
    expect(floor?.rooms.map((r) => r.state)).toEqual(['checked_in', 'confirmed']);
  });
});

describe('stayByRoom', () => {
  const summary = (id: string, roomId: string) => ({
    booking: {
      id,
      guestId: 'gst_1',
      roomId,
      checkIn: '2026-10-30',
      checkOut: '2026-11-01',
      adults: 1,
      childAges: [],
      status: 'confirmed' as const,
      holdExpiresAt: null,
      source: 'phone' as const,
      addons: { wellness: false, dogs: 0, extraBeds: 0 },
      priceSnapshot: null,
      notes: null,
    },
    guestName: 'Test Guest',
    roomName: roomId,
  });

  it('opens a turnover room to the arrival, not the guest leaving', () => {
    const stays = stayByRoom({
      date: '2026-10-30',
      arrivals: [summary('bk_in', 'rm_1')],
      departures: [summary('bk_out', 'rm_1'), summary('bk_gone', 'rm_2')],
      inHouse: [summary('bk_stay', 'rm_3')],
    });
    expect(stays.get('rm_1')).toBe('bk_in');
    expect(stays.get('rm_2')).toBe('bk_gone');
    expect(stays.get('rm_3')).toBe('bk_stay');
    expect(stays.has('rm_4')).toBe(false);
  });
});

describe('tonightByRoom', () => {
  const summary = (
    id: string,
    roomId: string,
    status: 'confirmed' | 'checked_in' | 'checked_out',
  ) => ({
    booking: {
      id,
      guestId: 'gst_1',
      roomId,
      checkIn: '2026-10-30',
      checkOut: '2026-11-01',
      adults: 1,
      childAges: [],
      status,
      holdExpiresAt: null,
      source: 'phone' as const,
      addons: { wellness: false, dogs: 0, extraBeds: 0 },
      priceSnapshot: null,
      notes: null,
    },
    guestName: 'Test Guest',
    roomName: roomId,
  });

  it("takes the arrival's status in a turnover room and leaves departures out", () => {
    const tonight = tonightByRoom({
      date: '2026-10-30',
      arrivals: [summary('bk_in', 'rm_1', 'checked_in')],
      departures: [
        summary('bk_out', 'rm_1', 'checked_out'),
        summary('bk_gone', 'rm_2', 'checked_in'),
      ],
      inHouse: [summary('bk_stay', 'rm_3', 'confirmed')],
    });
    expect(tonight.get('rm_1')).toBe('checked_in');
    expect(tonight.has('rm_2')).toBe(false);
    expect(tonight.get('rm_3')).toBe('confirmed');
  });
});
