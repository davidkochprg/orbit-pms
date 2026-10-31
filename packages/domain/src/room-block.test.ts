import type { StayOption } from '@orbit/shared';
import { describe, expect, it } from 'vitest';
import { allocateRooms, planBlock, splitParty, summarizeBlock } from './room-block';
import { apartment, double } from './test-fixtures';

const single = { ...double, id: 'rt_single', name: 'Single', maxAdults: 1, maxChildren: 0 };
const free = (...types: (typeof double)[]) =>
  types.map((roomType, i) => ({ roomId: `rm_${i + 1}`, roomType }));

describe('splitParty', () => {
  it('spreads adults evenly, larger shares first', () => {
    expect(splitParty(9, [], 8)).toEqual([
      { adults: 2, childAges: [] },
      ...Array.from({ length: 7 }, () => ({ adults: 1, childAges: [] })),
    ]);
  });

  it('puts children with the fewest people, oldest first', () => {
    expect(splitParty(3, [4, 9], 2)).toEqual([
      { adults: 2, childAges: [4] },
      { adults: 1, childAges: [9] },
    ]);
  });

  it('needs an adult in every room', () => {
    expect(splitParty(2, [5, 7], 3)).toBeNull();
    expect(splitParty(2, [], 0)).toBeNull();
  });
});

describe('allocateRooms', () => {
  it('gives each share the cheapest free room that fits, largest share first', () => {
    const shares = [
      { adults: 2, childAges: [] },
      { adults: 1, childAges: [] },
    ];
    const allocation = allocateRooms(shares, free(single, double, double));
    expect(allocation?.map((a) => a.room.roomId)).toEqual(['rm_2', 'rm_1']);
  });

  it('fails when a share fits none of the rooms left', () => {
    expect(allocateRooms([{ adults: 2, childAges: [] }], free(single, single))).toBeNull();
    expect(allocateRooms(splitParty(2, [], 2)!, free(double))).toBeNull();
  });
});

describe('planBlock', () => {
  it('takes as many rooms as the guest asks for', () => {
    expect(
      planBlock({ adults: 4, childAges: [] }, 4, free(double, double, double, double)),
    ).toHaveLength(4);
    expect(planBlock({ adults: 4, childAges: [] }, 4, free(double, double))).toBeNull();
  });

  it('otherwise uses the fewest rooms that sleep everyone', () => {
    const six = { adults: 6, childAges: [] };
    const plan = planBlock(six, null, free(double, double, apartment, apartment));
    expect(plan?.map((p) => [p.room.roomType.id, p.party.adults])).toEqual([
      ['rt_apartment', 3],
      ['rt_apartment', 3],
    ]);
    expect(planBlock(six, null, free(double, double, double, apartment))).toHaveLength(3);
    expect(planBlock(six, null, free(double, double))).toBeNull();
  });
});

describe('summarizeBlock', () => {
  const option = (roomName: string, roomTypeName: string, total: number): StayOption => ({
    roomId: `rm_${roomName}`,
    roomName,
    roomTypeName,
    kind: 'room',
    quote: {
      roomTypeId: 'rt',
      checkIn: '2026-11-17',
      checkOut: '2026-11-19',
      nights: 2,
      adults: 1,
      childAges: [],
      lines: [],
      total,
      currency: 'USD',
    },
  });

  it('adds up the rooms overall and by type, cheapest type first', () => {
    const block = summarizeBlock([
      option('101', 'Queen', 318),
      option('108', 'Single', 238),
      option('102', 'Queen', 318),
    ]);
    expect(block.total).toBe(874);
    expect(block.currency).toBe('USD');
    expect(block.byType).toEqual([
      { roomTypeName: 'Single', kind: 'room', count: 1, total: 238 },
      { roomTypeName: 'Queen', kind: 'room', count: 2, total: 636 },
    ]);
  });

  it('needs at least two rooms', () => {
    expect(() => summarizeBlock([option('101', 'Queen', 318)])).toThrow();
  });
});
