import type { BookingStatus, DayOverview, HousekeepingRoom } from '@orbit/shared';
import { statusLabels } from '@/lib/format';

/**
 * What a room looks like tonight on the house map, in the tape chart's colors: the status of the
 * stay there tonight, a stay ending today with nobody after it, free, or out of order.
 */
export type HouseRoomState =
  'hold' | 'confirmed' | 'checked_in' | 'leaving' | 'vacant' | 'out_of_order';

/** A stay's status as the map shows it; checked out and cancelled stays aren't there tonight. */
export type TonightStatus = Extract<BookingStatus, 'hold' | 'confirmed' | 'checked_in'>;

export interface HouseRoom {
  id: string;
  name: string;
  state: HouseRoomState;
  /** Accessible description, e.g. "Room 205, turnover, Jana Hájková". */
  label: string;
}

export interface HouseFloor {
  floor: number;
  /** Short label at the start of the row: the floor number, or G for the ground floor. */
  label: string;
  rooms: HouseRoom[];
}

export const houseStateLabels: Record<HouseRoomState, string> = {
  hold: statusLabels.hold,
  confirmed: statusLabels.confirmed,
  checked_in: statusLabels.checked_in,
  leaving: 'Leaving',
  vacant: 'Free',
  out_of_order: 'Out of order',
};

/** Legend order, as on the tape chart: taken tonight first, then empty. */
export const houseStates: HouseRoomState[] = [
  'hold',
  'confirmed',
  'checked_in',
  'leaving',
  'vacant',
  'out_of_order',
];

const isTonight = (status: BookingStatus): status is TonightStatus =>
  status === 'hold' || status === 'confirmed' || status === 'checked_in';

/**
 * The status of each room's stay tonight: today's arrival, or else the guest staying over. Rooms
 * nobody sleeps in tonight are missing.
 */
export function tonightByRoom(day: DayOverview): Map<string, TonightStatus> {
  const tonight = new Map<string, TonightStatus>();
  for (const { booking } of [...day.arrivals, ...day.inHouse]) {
    if (!tonight.has(booking.roomId) && isTonight(booking.status)) {
      tonight.set(booking.roomId, booking.status);
    }
  }
  return tonight;
}

/**
 * A room's state from tonight's stay. Until the day's bookings load, the room's occupancy stands
 * in: a guest staying over is checked in, one arriving is expected.
 */
export function houseRoomState(
  { room, occupancy }: HousekeepingRoom,
  tonight?: Map<string, TonightStatus>,
): HouseRoomState {
  if (room.status === 'out_of_order') return 'out_of_order';
  if (tonight) return tonight.get(room.id) ?? (occupancy === 'departing' ? 'leaving' : 'vacant');
  if (occupancy === 'staying') return 'checked_in';
  if (occupancy === 'arriving' || occupancy === 'turnover') return 'confirmed';
  return occupancy === 'departing' ? 'leaving' : 'vacant';
}

/** The hotel as a building: floors from the top down, rooms in name order on each floor. */
export function houseFloors(
  rooms: HousekeepingRoom[],
  tonight?: Map<string, TonightStatus>,
): HouseFloor[] {
  const byFloor = new Map<number, HousekeepingRoom[]>();
  for (const r of rooms) {
    const list = byFloor.get(r.room.floor) ?? [];
    list.push(r);
    byFloor.set(r.room.floor, list);
  }
  return [...byFloor.entries()]
    .sort(([a], [b]) => b - a)
    .map(([floor, list]) => ({
      floor,
      label: floor === 0 ? 'G' : String(floor),
      rooms: list
        .sort((a, b) => a.room.name.localeCompare(b.room.name, 'en', { numeric: true }))
        .map((r) => {
          const state = houseRoomState(r, tonight);
          const parts = [`Room ${r.room.name}`, houseStateLabels[state].toLowerCase()];
          if (r.guestName && state !== 'vacant' && state !== 'out_of_order') {
            parts.push(r.guestName);
          }
          return { id: r.room.id, name: r.room.name, state, label: parts.join(', ') };
        }),
    }));
}

/**
 * The stay each room opens to from the map: today's arrival first, since they are next, then the
 * guest staying, then the one leaving. Rooms without one are missing.
 */
export function stayByRoom(day: DayOverview): Map<string, string> {
  const stays = new Map<string, string>();
  for (const { booking } of [...day.arrivals, ...day.inHouse, ...day.departures]) {
    if (!stays.has(booking.roomId)) stays.set(booking.roomId, booking.id);
  }
  return stays;
}
