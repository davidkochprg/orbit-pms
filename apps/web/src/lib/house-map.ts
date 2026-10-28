import type { HousekeepingRoom } from '@orbit/shared';

/** What a room looks like tonight on the house map. */
export type HouseRoomState =
  'staying' | 'arriving' | 'turnover' | 'departing' | 'vacant' | 'out_of_order';

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
  staying: 'Staying',
  arriving: 'Arriving',
  turnover: 'Turnover',
  departing: 'Leaving',
  vacant: 'Free',
  out_of_order: 'Out of order',
};

/** Legend order: taken tonight first, then empty. */
export const houseStates: HouseRoomState[] = [
  'staying',
  'arriving',
  'turnover',
  'departing',
  'vacant',
  'out_of_order',
];

export function houseRoomState({ room, occupancy }: HousekeepingRoom): HouseRoomState {
  return room.status === 'out_of_order' ? 'out_of_order' : occupancy;
}

/** The hotel as a building: floors from the top down, rooms in name order on each floor. */
export function houseFloors(rooms: HousekeepingRoom[]): HouseFloor[] {
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
          const state = houseRoomState(r);
          const parts = [`Room ${r.room.name}`, houseStateLabels[state].toLowerCase()];
          if (r.guestName && state !== 'vacant' && state !== 'out_of_order') {
            parts.push(r.guestName);
          }
          return { id: r.room.id, name: r.room.name, state, label: parts.join(', ') };
        }),
    }));
}

/** Greeting for the time of day, from the minute of the day in the hotel's clock. */
export function greeting(minute: number): string {
  const hour = Math.floor(minute / 60);
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 18) return 'Good afternoon';
  return 'Good evening';
}
