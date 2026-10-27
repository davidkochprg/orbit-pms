import type { Booking, Room, RoomKind, RoomType } from '@orbit/shared';
import { assertValidRange, type DateRange, rangesOverlap } from './dates';
import { DomainError } from './errors';

export interface Party {
  adults: number;
  childAges: number[];
}

export interface AvailabilityQuery extends DateRange, Party {
  kind?: RoomKind;
  roomTypeId?: string;
  /** Ignore this booking when checking conflicts, e.g. when moving or extending it. */
  excludeBookingId?: string;
}

export interface AvailabilityContext {
  rooms: Room[];
  roomTypes: RoomType[];
  bookings: Booking[];
  now: Date;
}

export interface AvailableRoom {
  room: Room;
  roomType: RoomType;
}

export const MAX_CHILD_AGE = 17;

export function assertValidParty(party: Party): void {
  if (!Number.isInteger(party.adults) || party.adults < 1) {
    throw new DomainError('invalid_party', 'At least one adult is required');
  }
  for (const age of party.childAges) {
    if (!Number.isInteger(age) || age < 0 || age > MAX_CHILD_AGE) {
      throw new DomainError('invalid_party', `Invalid child age: ${age}`);
    }
  }
}

/** Whether a booking currently occupies its room. Expired holds and cancelled or finished stays do not. */
export function blocksRoom(booking: Booking, now: Date): boolean {
  switch (booking.status) {
    case 'confirmed':
    case 'checked_in':
      return true;
    case 'hold':
      return booking.holdExpiresAt === null || new Date(booking.holdExpiresAt) > now;
    case 'checked_out':
    case 'cancelled':
      return false;
  }
}

/** Children may use adult beds, but adults may not exceed the adult limit. */
export function fitsRoomType(roomType: RoomType, party: Party, extraBeds = 0): boolean {
  const guests = party.adults + party.childAges.length;
  return (
    party.adults <= roomType.maxAdults + extraBeds &&
    guests <= roomType.maxAdults + roomType.maxChildren + extraBeds
  );
}

export function findConflicts(
  roomId: string,
  range: DateRange,
  bookings: Booking[],
  now: Date,
  excludeBookingId?: string,
): Booking[] {
  return bookings.filter(
    (b) =>
      b.roomId === roomId &&
      b.id !== excludeBookingId &&
      blocksRoom(b, now) &&
      rangesOverlap(b, range),
  );
}

/** Rooms that are bookable for the whole stay and fit the party, cheapest room type first. */
export function checkAvailability(
  query: AvailabilityQuery,
  ctx: AvailabilityContext,
): AvailableRoom[] {
  assertValidRange(query);
  assertValidParty(query);

  const roomTypes = new Map(ctx.roomTypes.map((t) => [t.id, t]));
  const available: AvailableRoom[] = [];

  for (const room of ctx.rooms) {
    const roomType = roomTypes.get(room.roomTypeId);
    if (!roomType) continue;
    if (room.status === 'out_of_order') continue;
    if (query.kind && room.kind !== query.kind) continue;
    if (query.roomTypeId && room.roomTypeId !== query.roomTypeId) continue;
    if (!fitsRoomType(roomType, query)) continue;
    if (findConflicts(room.id, query, ctx.bookings, ctx.now, query.excludeBookingId).length > 0) {
      continue;
    }
    available.push({ room, roomType });
  }

  return available.sort(
    (a, b) => a.roomType.basePrice - b.roomType.basePrice || a.room.name.localeCompare(b.room.name),
  );
}
