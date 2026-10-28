import type {
  Booking,
  BriefGap,
  BriefHold,
  BriefRoomToPrepare,
  BriefTurnover,
  DailyBrief,
  Guest,
  HousekeepingTask,
  Inquiry,
  IsoDate,
  Room,
  StayGuest,
} from '@orbit/shared';
import { blocksRoom } from './availability';
import { addDays, nightsBetween } from './dates';
import { arrivalsOn, departuresOn } from './day';
import type { HotelPolicy } from './policy';
import { buildGuestBook } from './registration';

/** How far ahead the brief looks for empty nights between stays. */
export const BRIEF_GAP_HORIZON_DAYS = 14;
/** Runs of empty nights up to this length count as gaps worth discounting. */
export const BRIEF_MAX_GAP_NIGHTS = 2;
/** Holds for stays starting within this many days are listed even if they lapse later. */
export const BRIEF_HOLD_LOOKAHEAD_DAYS = 7;
const HOLD_EXPIRY_WARNING_MS = 24 * 3600_000;

export interface BriefInput {
  date: IsoDate;
  now: Date;
  rooms: Room[];
  guests: Guest[];
  /**
   * Bookings with a night in `[date - BRIEF_MAX_GAP_NIGHTS, date + BRIEF_GAP_HORIZON_DAYS +
   * BRIEF_MAX_GAP_NIGHTS)`, so stays leaving on `date` and gaps near both ends are seen.
   */
  bookings: Booking[];
  /** Open and in-progress housekeeping tasks. */
  tasks: HousekeepingTask[];
  inquiries: Inquiry[];
  /** Guest-book entries of the stays `guestBookStays` returns. */
  stayGuests: StayGuest[];
  policy: Pick<HotelPolicy, 'homeCountry' | 'idDocumentMinAge'>;
}

/** Stays whose guest book the brief checks: arriving today or in house tonight. */
export function guestBookStays(bookings: Booking[], date: IsoDate): Booking[] {
  return bookings.filter(
    (b) =>
      (b.status === 'confirmed' && b.checkIn === date) ||
      (b.status === 'checked_in' && coversNight(b, date)),
  );
}

/** The range of bookings `buildDailyBrief` needs for `date`. */
export function briefBookingRange(date: IsoDate): { from: IsoDate; to: IsoDate } {
  return {
    from: addDays(date, -BRIEF_MAX_GAP_NIGHTS),
    to: addDays(date, BRIEF_GAP_HORIZON_DAYS + BRIEF_MAX_GAP_NIGHTS),
  };
}

const coversNight = (b: Booking, night: IsoDate) => b.checkIn <= night && night < b.checkOut;

/**
 * Short empty runs between two stays in the same room, starting tonight or within the horizon.
 * A run already under way counts from `date`. Out-of-order rooms are skipped.
 */
export function findGaps(input: Pick<BriefInput, 'date' | 'now' | 'rooms' | 'bookings'>) {
  const { date, now, rooms, bookings } = input;
  const horizonEnd = addDays(date, BRIEF_GAP_HORIZON_DAYS);
  const gaps: BriefGap[] = [];
  for (const room of rooms) {
    if (room.status === 'out_of_order') continue;
    const stays = bookings
      .filter((b) => b.roomId === room.id && blocksRoom(b, now))
      .sort((a, b) => a.checkIn.localeCompare(b.checkIn));
    for (const [i, next] of stays.entries()) {
      const prev = stays[i - 1];
      if (!prev || prev.checkOut >= next.checkIn) continue;
      const from = prev.checkOut < date ? date : prev.checkOut;
      const nights = nightsBetween(from, next.checkIn);
      if (from >= horizonEnd || nights < 1 || nights > BRIEF_MAX_GAP_NIGHTS) continue;
      gaps.push({ roomId: room.id, roomName: room.name, from, to: next.checkIn, nights });
    }
  }
  return gaps.sort(
    (a, b) =>
      a.from.localeCompare(b.from) || a.roomName.localeCompare(b.roomName, 'en', { numeric: true }),
  );
}

/**
 * The day's brief: occupancy, turnovers, rooms to get ready for arrivals, holds that need a
 * decision, broken rooms, missing IDs, unanswered messages and short gaps worth discounting.
 */
export function buildDailyBrief(input: BriefInput): DailyBrief {
  const { date, now, rooms, guests, bookings, tasks, inquiries, stayGuests, policy } = input;
  const guestName = (id: string) => guests.find((g) => g.id === id)?.name ?? 'Unknown guest';
  const roomById = new Map(rooms.map((r) => [r.id, r]));
  const roomName = (id: string) => roomById.get(id)?.name ?? id;
  const byRoomName = <T extends { roomName: string }>(a: T, b: T) =>
    a.roomName.localeCompare(b.roomName, 'en', { numeric: true });

  const arrivals = arrivalsOn(bookings, date);
  const departures = departuresOn(bookings, date);
  const tonight = bookings.filter((b) => coversNight(b, date) && blocksRoom(b, now));
  const occupiedRooms = new Set(tonight.map((b) => b.roomId));

  const turnovers: BriefTurnover[] = [];
  for (const arrival of arrivals) {
    const departure = departures.find((d) => d.roomId === arrival.roomId);
    const room = roomById.get(arrival.roomId);
    if (!departure || !room) continue;
    turnovers.push({
      roomId: room.id,
      roomName: room.name,
      status: room.status,
      departingGuest: guestName(departure.guestId),
      arrivingGuest: guestName(arrival.guestId),
    });
  }

  const roomsToPrepare: BriefRoomToPrepare[] = arrivals
    .filter((b) => b.status !== 'checked_in')
    .flatMap((b) => {
      const room = roomById.get(b.roomId);
      if (!room || room.status === 'inspected') return [];
      return [
        {
          roomId: room.id,
          roomName: room.name,
          status: room.status,
          guestName: guestName(b.guestId),
          bookingId: b.id,
        },
      ];
    });

  const lookahead = addDays(date, BRIEF_HOLD_LOOKAHEAD_DAYS);
  const holds: BriefHold[] = bookings
    .filter((b) => b.status === 'hold' && b.checkOut > date)
    .map((b) => ({ booking: b, expired: !blocksRoom(b, now) }))
    .filter(
      ({ booking, expired }) =>
        expired ||
        booking.checkIn < lookahead ||
        (booking.holdExpiresAt !== null &&
          new Date(booking.holdExpiresAt).getTime() - now.getTime() < HOLD_EXPIRY_WARNING_MS),
    )
    .sort((a, b) => a.booking.checkIn.localeCompare(b.booking.checkIn))
    .map(({ booking, expired }) => ({
      summary: {
        booking,
        guestName: guestName(booking.guestId),
        roomName: roomName(booking.roomId),
      },
      expired,
    }));

  const missingIds = guestBookStays(bookings, date).flatMap((b) => {
    const guest = guests.find((g) => g.id === b.guestId);
    if (!guest) return [];
    const entries = stayGuests.filter((s) => s.bookingId === b.id);
    const { missing } = buildGuestBook(b, guest, entries, null, date, policy);
    if (missing === 0) return [];
    return [
      {
        summary: { booking: b, guestName: guest.name, roomName: roomName(b.roomId) },
        missing,
        arriving: b.status === 'confirmed',
      },
    ];
  });

  return {
    date,
    occupancy: {
      occupied: occupiedRooms.size,
      // A guest may still be in a room that broke during their stay; it is sold tonight.
      sellable: rooms.filter((r) => r.status !== 'out_of_order' || occupiedRooms.has(r.id)).length,
      total: rooms.length,
    },
    guestsTonight: tonight.reduce((sum, b) => sum + b.adults + b.childAges.length, 0),
    arrivals: arrivals.length,
    departures: departures.length,
    turnovers: turnovers.sort(byRoomName),
    roomsToPrepare: roomsToPrepare.sort(byRoomName),
    holds,
    outOfOrder: rooms
      .filter((r) => r.status === 'out_of_order')
      .map((r) => ({ roomId: r.id, roomName: r.name }))
      .sort(byRoomName),
    maintenance: tasks
      .filter((t) => t.type === 'maintenance' && t.status !== 'done')
      .map((t) => ({
        taskId: t.id,
        roomId: t.roomId,
        roomName: roomName(t.roomId),
        notes: t.notes,
      }))
      .sort(byRoomName),
    missingIds: missingIds.sort((a, b) => byRoomName(a.summary, b.summary)),
    unansweredMessages: inquiries.filter((i) => i.status === 'new' || i.status === 'quoted').length,
    gaps: findGaps({ date, now, rooms, bookings }),
  };
}
