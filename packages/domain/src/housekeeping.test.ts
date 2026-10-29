import type { HousekeepingTask } from '@orbit/shared';
import { describe, expect, it } from 'vitest';
import {
  buildHousekeepingBoard,
  canChangeRoomStatus,
  completedByStatus,
  noteChangesStatus,
  resolveRoom,
  roomDay,
} from './housekeeping';
import { apartment, booking, double, room } from './test-fixtures';

const today = '2026-05-10';

function task(overrides: Partial<HousekeepingTask> & Pick<HousekeepingTask, 'roomId'>) {
  return {
    id: `hk_${overrides.roomId}_${overrides.type ?? 'turnover'}`,
    type: 'turnover',
    status: 'open',
    notes: null,
    createdAt: '2026-05-10T06:00:00.000Z',
    ...overrides,
  } satisfies HousekeepingTask;
}

describe('canChangeRoomStatus', () => {
  it('allows any change except out of order straight to clean or inspected', () => {
    expect(canChangeRoomStatus('dirty', 'inspected')).toBe(true);
    expect(canChangeRoomStatus('inspected', 'dirty')).toBe(true);
    expect(canChangeRoomStatus('clean', 'out_of_order')).toBe(true);
    expect(canChangeRoomStatus('out_of_order', 'dirty')).toBe(true);
    expect(canChangeRoomStatus('out_of_order', 'clean')).toBe(false);
    expect(canChangeRoomStatus('out_of_order', 'inspected')).toBe(false);
  });
});

describe('noteChangesStatus', () => {
  it('never lets "clean" undo an inspection', () => {
    expect(noteChangesStatus('inspected', 'clean')).toBe(false);
    expect(noteChangesStatus('dirty', 'clean')).toBe(true);
    expect(noteChangesStatus('inspected', 'dirty')).toBe(true);
    expect(noteChangesStatus('clean', 'clean')).toBe(false);
  });
});

describe('completedByStatus', () => {
  it('completes open cleaning tasks when the room is clean or inspected', () => {
    const turnover = task({ roomId: 'r1', type: 'turnover' });
    expect(completedByStatus('clean', turnover)).toBe(true);
    expect(completedByStatus('inspected', task({ roomId: 'r1', type: 'stayover' }))).toBe(true);
    expect(completedByStatus('dirty', turnover)).toBe(false);
  });

  it('leaves maintenance and finished tasks alone', () => {
    expect(completedByStatus('clean', task({ roomId: 'r1', type: 'maintenance' }))).toBe(false);
    expect(completedByStatus('clean', task({ roomId: 'r1', status: 'done' }))).toBe(false);
  });
});

describe('roomDay', () => {
  it('detects same-day turnover: one guest leaves, another arrives', () => {
    const bookings = [
      booking({ roomId: 'r1', checkIn: '2026-05-07', checkOut: today, status: 'checked_in' }),
      booking({ roomId: 'r1', checkIn: today, checkOut: '2026-05-12', guestId: 'gst_next' }),
    ];
    expect(roomDay('r1', bookings, today)).toMatchObject({
      occupancy: 'turnover',
      guestId: 'gst_next',
      stay: { id: bookings[0]!.id },
      arrival: { id: bookings[1]!.id },
    });
  });

  it('distinguishes arriving, departing, staying and vacant', () => {
    const bookings = [
      booking({ roomId: 'arr', checkIn: today, checkOut: '2026-05-12' }),
      booking({ roomId: 'dep', checkIn: '2026-05-08', checkOut: today, status: 'checked_out' }),
      booking({
        roomId: 'stay',
        checkIn: '2026-05-08',
        checkOut: '2026-05-12',
        status: 'checked_in',
      }),
      booking({ roomId: 'gone', checkIn: today, checkOut: '2026-05-12', status: 'cancelled' }),
    ];
    expect(roomDay('arr', bookings, today).occupancy).toBe('arriving');
    expect(roomDay('dep', bookings, today).occupancy).toBe('departing');
    expect(roomDay('stay', bookings, today).occupancy).toBe('staying');
    expect(roomDay('gone', bookings, today).occupancy).toBe('vacant');
  });
});

describe('buildHousekeepingBoard', () => {
  const rooms = [
    room('r1', { name: '101', status: 'inspected' }),
    room('r2', { name: '102', status: 'dirty' }),
    room('r3', { name: '103', status: 'clean' }),
    room('a1', { name: 'A1', status: 'dirty', roomTypeId: apartment.id }),
  ];
  const bookings = [
    booking({ roomId: 'r1', checkIn: today, checkOut: '2026-05-12' }),
    booking({ roomId: 'a1', checkIn: today, checkOut: '2026-05-12', guestId: 'gst_a' }),
    booking({ roomId: 'r2', checkIn: '2026-05-08', checkOut: today, status: 'checked_out' }),
  ];
  const board = buildHousekeepingBoard({
    rooms,
    roomTypes: [double, apartment],
    bookings,
    guests: [
      { id: 'gst_a', name: 'Anna Test', email: null, phone: null, language: 'en', notes: null },
    ],
    tasks: [
      task({ roomId: 'r2', type: 'turnover' }),
      task({ roomId: 'r2', type: 'maintenance', status: 'done' }),
    ],
    readings: [],
    date: today,
  });

  it('puts arrivals in rooms that are not inspected first', () => {
    expect(board.map((r) => [r.room.name, r.occupancy, r.urgent])).toEqual([
      ['A1', 'arriving', true],
      ['101', 'arriving', false],
      ['102', 'departing', false],
      ['103', 'vacant', false],
    ]);
  });

  it('names the guest and room type and lists only unfinished tasks', () => {
    expect(board[0]).toMatchObject({ guestName: 'Anna Test', roomTypeName: 'Apartment' });
    expect(board.find((r) => r.room.name === '102')!.openTasks.map((t) => t.type)).toEqual([
      'turnover',
    ]);
  });
});

describe('buildHousekeepingBoard effort', () => {
  const departure = (roomId: string, overrides: Partial<Parameters<typeof booking>[0]> = {}) =>
    booking({
      roomId,
      checkIn: '2026-05-08',
      checkOut: today,
      status: 'checked_out',
      ...overrides,
    });
  const build = (rooms: ReturnType<typeof room>[], bookings: ReturnType<typeof booking>[]) =>
    buildHousekeepingBoard({
      rooms,
      roomTypes: [double, apartment],
      bookings,
      guests: [],
      tasks: [],
      readings: [
        {
          bookingId: departure('r3').id,
          pets: false,
          mess: 'much_more',
          messReason: 'Birthday party',
          prepare: [],
        },
      ],
      date: today,
    });

  it('puts heavier cleans first among rooms with the same deadline', () => {
    const board = build(
      [
        room('r1', { name: '101', status: 'dirty' }),
        room('r2', { name: '102', status: 'dirty' }),
        room('r3', { name: '103', status: 'dirty' }),
      ],
      [
        departure('r1', { adults: 1 }),
        departure('r2', { childAges: [3, 6], addons: { wellness: false, dogs: 1, extraBeds: 0 } }),
        departure('r3'),
      ],
    );
    expect(board.map((r) => [r.room.name, r.effort, r.cues])).toEqual([
      ['102', 'heavy', ['Dog', '2 kids']],
      ['103', 'heavy', ['Birthday party']],
      ['101', 'standard', []],
    ]);
  });

  it('never lets effort jump an arrival that is not ready', () => {
    const board = build(
      [room('r1', { name: '101', status: 'clean' }), room('r2', { name: '102', status: 'dirty' })],
      [
        booking({ roomId: 'r1', checkIn: today, checkOut: '2026-05-12' }),
        departure('r2', { addons: { wellness: false, dogs: 2, extraBeds: 0 } }),
      ],
    );
    expect(board.map((r) => [r.room.name, r.urgent, r.effort])).toEqual([
      ['101', true, 'light'],
      ['102', false, 'heavy'],
    ]);
  });

  it('has no effort once the room is done, but keeps the cues', () => {
    const board = build(
      [room('r1', { name: '101', status: 'inspected' })],
      [departure('r1', { childAges: [4] })],
    );
    expect(board[0]).toMatchObject({ effort: null, cues: ['1 kid'] });
  });
});

describe('resolveRoom', () => {
  const rooms = [
    room('r104', { name: '104' }),
    room('r4', { name: '4' }),
    room('a1', { name: 'A1' }),
  ];

  it('matches how people say room names', () => {
    expect(resolveRoom(rooms, '104')?.id).toBe('r104');
    expect(resolveRoom(rooms, 'room 104')?.id).toBe('r104');
    expect(resolveRoom(rooms, 'pokoj 104')?.id).toBe('r104');
    expect(resolveRoom(rooms, 'a 1')?.id).toBe('a1');
    expect(resolveRoom(rooms, 'apartmán A1')?.id).toBe('a1');
    expect(resolveRoom(rooms, '4')?.id).toBe('r4');
  });

  it('matches whole words only and returns null for unknown rooms', () => {
    expect(resolveRoom(rooms, 'pokoj 14')).toBeNull();
    expect(resolveRoom(rooms, 'x104')).toBeNull();
    expect(resolveRoom(rooms, '305')).toBeNull();
    expect(resolveRoom(rooms, '')).toBeNull();
  });
});
