import type { RoomBlock, RoomType, StayOption } from '@orbit/shared';
import { fitsRoomType, type Party } from './availability';

/** A free room as `findAvailableRooms` lists it, cheapest first. */
export interface FreeRoom {
  roomId: string;
  roomType: RoomType;
}

const size = (p: Party) => p.adults + p.childAges.length;

/**
 * Splits a party over `rooms` rooms as evenly as possible, each with at least one adult, largest
 * share first. Children go to the rooms with the fewest people. Null when there are fewer adults
 * than rooms.
 */
export function splitParty(adults: number, childAges: number[], rooms: number): Party[] | null {
  if (!Number.isInteger(rooms) || rooms < 1 || adults < rooms) return null;
  const shares: Party[] = Array.from({ length: rooms }, (_, i) => ({
    adults: Math.floor(adults / rooms) + (i < adults % rooms ? 1 : 0),
    childAges: [],
  }));
  for (const age of [...childAges].sort((a, b) => b - a)) {
    const target = shares.reduce((best, s) => (size(s) < size(best) ? s : best));
    target.childAges.push(age);
  }
  return shares.sort((a, b) => size(b) - size(a) || b.adults - a.adults);
}

/**
 * A free room for each share, largest share first, each the cheapest left that fits it. Null when
 * some share fits none of the rooms left.
 */
export function allocateRooms<T extends FreeRoom>(
  shares: Party[],
  free: T[],
): Array<{ room: T; party: Party }> | null {
  const taken = new Set<string>();
  const allocation: Array<{ room: T; party: Party }> = [];
  for (const party of shares) {
    const room = free.find((r) => !taken.has(r.roomId) && fitsRoomType(r.roomType, party));
    if (!room) return null;
    taken.add(room.roomId);
    allocation.push({ room, party });
  }
  return allocation;
}

/**
 * Rooms for a party across several rooms: as many as `rooms` asks for, or, when it doesn't say,
 * the fewest that sleep everyone. Null when the free rooms can't take the party that way.
 */
export function planBlock<T extends FreeRoom>(
  party: Party,
  rooms: number | null,
  free: T[],
): Array<{ room: T; party: Party }> | null {
  const counts = rooms
    ? [rooms]
    : Array.from({ length: Math.min(party.adults, free.length) - 1 }, (_, i) => i + 2);
  for (const n of counts) {
    const shares = splitParty(party.adults, party.childAges, n);
    const allocation = shares && allocateRooms(shares, free);
    if (allocation) return allocation;
  }
  return null;
}

/** The block's rooms with their totals added up, overall and by room type, cheapest type first. */
export function summarizeBlock(rooms: StayOption[]): RoomBlock {
  const [first] = rooms;
  if (!first || rooms.length < 2) throw new Error('A block has at least two rooms');
  const byType = new Map<string, RoomBlock['byType'][number]>();
  for (const o of rooms) {
    const entry = byType.get(o.roomTypeName);
    if (entry) {
      entry.count += 1;
      entry.total += o.quote.total;
    } else {
      byType.set(o.roomTypeName, {
        roomTypeName: o.roomTypeName,
        kind: o.kind,
        count: 1,
        total: o.quote.total,
      });
    }
  }
  return {
    rooms,
    byType: [...byType.values()].sort((a, b) => a.total / a.count - b.total / b.count),
    total: rooms.reduce((sum, o) => sum + o.quote.total, 0),
    currency: first.quote.currency,
  };
}
