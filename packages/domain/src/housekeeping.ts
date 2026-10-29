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
  StayReading,
} from '@orbit/shared';
import { cleaningEffort, effortRank } from './cleaning-effort';
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
  /** The stay whose room is cleaned today: the guest leaving, or staying over. */
  stay: Booking | null;
  /** The stay arriving today. */
  arrival: Booking | null;
}

/** What happens in a room on `date`, from its bookings. */
export function roomDay(roomId: string, bookings: Booking[], date: IsoDate): RoomDay {
  const own = bookings.filter((b) => b.roomId === roomId);
  const arrival = arrivalsOn(own, date)[0] ?? null;
  const departing = departuresOn(own, date)[0] ?? null;
  const staying = stayingOver(own, date)[0] ?? null;
  const stay = departing ?? staying;
  const occupancy: RoomOccupancy =
    arrival && departing
      ? 'turnover'
      : arrival
        ? 'arriving'
        : departing
          ? 'departing'
          : staying
            ? 'staying'
            : 'vacant';
  return { occupancy, guestId: (arrival ?? stay)?.guestId ?? null, stay, arrival };
}

/** Every stay the board shows on `date`: those leaving, staying over and arriving. */
export function boardStays(rooms: Room[], bookings: Booking[], date: IsoDate): Booking[] {
  return rooms.flatMap((room) => {
    const { stay, arrival } = roomDay(room.id, bookings, date);
    return [stay, arrival].filter((b) => b !== null);
  });
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
  /** What the model read from stays' notes; stays without one count only their numbers. */
  readings: StayReading[];
  date: IsoDate;
}

/**
 * Every room with today's situation, cleaning effort and open tasks. Urgent rooms (an arrival
 * today, not yet inspected) come first, then by occupancy, then the heavier cleans, then by room
 * name. A room with no cleaning left (inspected, or clean with no cleaning task) has no effort.
 */
export function buildHousekeepingBoard(input: BoardInput): HousekeepingRoom[] {
  const { rooms, roomTypes, bookings, guests, tasks, readings, date } = input;
  const readingsById = new Map(readings.map((r) => [r.bookingId, r]));
  return rooms
    .map((room): HousekeepingRoom => {
      const day = roomDay(room.id, bookings, date);
      const arrivalToday = day.occupancy === 'arriving' || day.occupancy === 'turnover';
      const urgent = arrivalToday && room.status !== 'inspected';
      const openTasks = tasks
        .filter((t) => t.roomId === room.id && t.status !== 'done')
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const cleaningLeft =
        urgent ||
        room.status === 'dirty' ||
        (room.status !== 'inspected' &&
          openTasks.some((t) => t.type === 'turnover' || t.type === 'stayover'));
      const { effort, cues } = cleaningEffort({ ...day, readings: readingsById });
      return {
        room,
        roomTypeName: roomTypes.find((t) => t.id === room.roomTypeId)?.name ?? '',
        occupancy: day.occupancy,
        guestName: guests.find((g) => g.id === day.guestId)?.name ?? null,
        urgent,
        effort: cleaningLeft ? effort : null,
        cues,
        openTasks,
      };
    })
    .sort(
      (a, b) =>
        Number(b.urgent) - Number(a.urgent) ||
        occupancyOrder[a.occupancy] - occupancyOrder[b.occupancy] ||
        (b.effort ? effortRank[b.effort] : -1) - (a.effort ? effortRank[a.effort] : -1) ||
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
