import type {
  Booking,
  Guest,
  HousekeepingRoom,
  HousekeepingTask,
  IsoDate,
  Room,
  RoomOccupancy,
  RoomStatus,
  RoomType,
} from '@orbit/shared';
import { arrivalsOn, departuresOn, stayingOver } from './day';
import { normalizeText } from './text';

/**
 * Staff may set any room status, except straight from out of order to clean or inspected: a
 * repaired room needs cleaning first.
 */
export function canChangeRoomStatus(from: RoomStatus, to: RoomStatus): boolean {
  return !(from === 'out_of_order' && (to === 'clean' || to === 'inspected'));
}

/**
 * Whether a note's status changes the room. A note saying a room is clean must not undo an
 * inspection that already happened, so "clean" leaves an inspected room as it is.
 */
export function noteChangesStatus(current: RoomStatus, said: RoomStatus): boolean {
  return said !== current && !(said === 'clean' && current === 'inspected');
}

/** Cleaning tasks that a clean or inspected status completes. */
export function completedByStatus(status: RoomStatus, task: HousekeepingTask): boolean {
  return (
    (status === 'clean' || status === 'inspected') &&
    task.status !== 'done' &&
    (task.type === 'turnover' || task.type === 'stayover')
  );
}

export interface RoomDay {
  occupancy: RoomOccupancy;
  /** The guest arriving today, or else the one staying or leaving. */
  guestId: string | null;
}

/** What happens in a room on `date`, from its bookings. */
export function roomDay(roomId: string, bookings: Booking[], date: IsoDate): RoomDay {
  const own = bookings.filter((b) => b.roomId === roomId);
  const arriving = arrivalsOn(own, date)[0];
  const departing = departuresOn(own, date)[0];
  const staying = stayingOver(own, date)[0];
  if (arriving && departing) return { occupancy: 'turnover', guestId: arriving.guestId };
  if (arriving) return { occupancy: 'arriving', guestId: arriving.guestId };
  if (departing) return { occupancy: 'departing', guestId: departing.guestId };
  if (staying) return { occupancy: 'staying', guestId: staying.guestId };
  return { occupancy: 'vacant', guestId: null };
}

const occupancyOrder: Record<RoomOccupancy, number> = {
  turnover: 0,
  arriving: 1,
  departing: 2,
  staying: 3,
  vacant: 4,
};

export interface BoardInput {
  rooms: Room[];
  roomTypes: RoomType[];
  /** Bookings around `date`, including those that leave on it. */
  bookings: Booking[];
  guests: Guest[];
  /** Open and in-progress tasks. */
  tasks: HousekeepingTask[];
  date: IsoDate;
}

/**
 * Every room with today's situation and open tasks. Urgent rooms (an arrival today, not yet
 * inspected) come first, then by occupancy, then by room name.
 */
export function buildHousekeepingBoard(input: BoardInput): HousekeepingRoom[] {
  const { rooms, roomTypes, bookings, guests, tasks, date } = input;
  return rooms
    .map((room): HousekeepingRoom => {
      const day = roomDay(room.id, bookings, date);
      const arrivalToday = day.occupancy === 'arriving' || day.occupancy === 'turnover';
      return {
        room,
        roomTypeName: roomTypes.find((t) => t.id === room.roomTypeId)?.name ?? '',
        occupancy: day.occupancy,
        guestName: guests.find((g) => g.id === day.guestId)?.name ?? null,
        urgent: arrivalToday && room.status !== 'inspected',
        openTasks: tasks
          .filter((t) => t.roomId === room.id && t.status !== 'done')
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      };
    })
    .sort(
      (a, b) =>
        Number(b.urgent) - Number(a.urgent) ||
        occupancyOrder[a.occupancy] - occupancyOrder[b.occupancy] ||
        a.room.name.localeCompare(b.room.name, 'en', { numeric: true }),
    );
}

const compact = (value: string) => normalizeText(value).replace(/[^a-z0-9]/g, '');

/**
 * The room a speaker meant: "104", "room 104", "pokoj 104", "A 1" or "apartmán A1". Tries the
 * whole phrase, then its last word, then its last two words joined. Whole words only, so
 * "pokoj 14" never becomes room 4. Null if nothing matches.
 */
export function resolveRoom(rooms: Room[], spoken: string): Room | null {
  const words = normalizeText(spoken)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const candidates = [words.join(''), words.at(-1), words.slice(-2).join('')];
  for (const candidate of candidates) {
    const match = candidate && rooms.find((r) => compact(r.name) === candidate);
    if (match) return match;
  }
  return null;
}
