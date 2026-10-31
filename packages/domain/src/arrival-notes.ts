import type {
  ArrivalNoteDue,
  ArrivalNotes,
  Booking,
  Guest,
  Inquiry,
  IsoDate,
  Room,
  RoomType,
} from '@orbit/shared';
import { addDays, hotelToday } from './dates';
import type { Repositories } from './repositories';

/** A message the hotel sent this long before arrival counts as the guest having heard from it. */
export const ARRIVAL_NOTE_DAYS = 14;

/**
 * Confirmed stays arriving on `date` whose guest has an email address and hasn't heard from the
 * hotel about the stay yet: no conversation linked to the booking has a message from the hotel
 * in the two weeks before arrival. By guest name.
 */
export function arrivalNotesDue({
  date,
  bookings,
  guests,
  rooms,
  roomTypes,
  inquiries,
}: {
  date: IsoDate;
  bookings: Booking[];
  guests: Guest[];
  rooms: Room[];
  roomTypes: RoomType[];
  inquiries: Inquiry[];
}): ArrivalNoteDue[] {
  const since = addDays(date, -ARRIVAL_NOTE_DAYS);
  const heard = new Set(
    inquiries
      .filter((i) =>
        i.messages.some((m) => m.direction === 'out' && m.sentAt.slice(0, 10) >= since),
      )
      .flatMap((i) => [i.bookingId, ...i.blockBookingIds])
      .filter((id): id is string => id !== null),
  );
  return bookings
    .filter((b) => b.checkIn === date && b.status === 'confirmed' && !heard.has(b.id))
    .flatMap((b): ArrivalNoteDue[] => {
      const guest = guests.find((g) => g.id === b.guestId);
      const room = rooms.find((r) => r.id === b.roomId);
      const roomType = room && roomTypes.find((t) => t.id === room.roomTypeId);
      if (!guest?.email || !room || !roomType) return [];
      return [
        {
          bookingId: b.id,
          guestId: guest.id,
          guestName: guest.name,
          email: guest.email,
          language: guest.language,
          roomName: room.name,
          roomTypeName: roomType.name,
          checkIn: b.checkIn,
          checkOut: b.checkOut,
          adults: b.adults,
          childAges: b.childAges,
          addons: b.addons,
        },
      ];
    })
    .sort((a, b) => a.guestName.localeCompare(b.guestName));
}

/** Which guests arriving on a day still need their note before the stay. */
export function createArrivalNoteService({
  repos,
  clock,
}: {
  repos: Repositories;
  clock: () => Date;
}) {
  return {
    /** Stays arriving on `date`, tomorrow by default, whose guest hasn't heard from the hotel. */
    async due(date: IsoDate = addDays(hotelToday(clock()), 1)): Promise<ArrivalNotes> {
      const [bookings, guests, rooms, roomTypes, inquiries] = await Promise.all([
        repos.bookings.listBookings({ from: date, to: addDays(date, 1), status: ['confirmed'] }),
        repos.guests.listGuests(),
        repos.rooms.listRooms(),
        repos.rooms.listRoomTypes(),
        repos.inquiries.listInquiries(),
      ]);
      return {
        date,
        due: arrivalNotesDue({ date, bookings, guests, rooms, roomTypes, inquiries }),
      };
    },
  };
}

export type ArrivalNoteService = ReturnType<typeof createArrivalNoteService>;
