import type {
  AuditActor,
  Booking,
  BookingAction,
  BookingDetail,
  BookingSummary,
  DayOverview,
  IsoDate,
} from '@orbit/shared';
import { allowedActions, applyAction, changeDates, moveBooking } from './bookings';
import { addDays, type DateRange, hotelToday } from './dates';
import { arrivalsOn, departuresOn, stayingOver } from './day';
import { DomainError } from './errors';
import type { PricingConfig } from './pricing';
import type { Repositories } from './repositories';

export interface ServiceDeps {
  repos: Repositories;
  pricing: PricingConfig;
  clock: () => Date;
}

async function loadBooking(repos: Repositories, id: string): Promise<Booking> {
  const booking = await repos.bookings.getBooking(id);
  if (!booking) throw new DomainError('not_found', `Booking ${id} not found`);
  return booking;
}

async function loadRoom(repos: Repositories, id: string) {
  const room = await repos.rooms.getRoom(id);
  if (!room) throw new DomainError('not_found', `Room ${id} not found`);
  const roomType = (await repos.rooms.listRoomTypes()).find((t) => t.id === room.roomTypeId);
  if (!roomType) throw new DomainError('not_found', `Room type ${room.roomTypeId} not found`);
  return { room, roomType };
}

/**
 * Hotel operations used by both the API routes and the agent tools. Every mutation runs in a
 * transaction and writes an audit log entry with the acting party.
 */
export function createHotelService({ repos, pricing, clock }: ServiceDeps) {
  async function getBookingDetail(id: string): Promise<BookingDetail> {
    const booking = await loadBooking(repos, id);
    const guest = await repos.guests.getGuest(booking.guestId);
    if (!guest) throw new DomainError('not_found', `Guest ${booking.guestId} not found`);
    const { room, roomType } = await loadRoom(repos, booking.roomId);
    return {
      booking,
      guest,
      room,
      roomType,
      allowedActions: allowedActions(booking, hotelToday(clock())),
    };
  }

  async function applyBookingAction(id: string, action: BookingAction, actor: AuditActor) {
    return repos.transaction(async (tx) => {
      const now = clock();
      const booking = await loadBooking(tx, id);
      const { room } = await loadRoom(tx, booking.roomId);
      const updated = applyAction(booking, action, {
        today: hotelToday(now),
        now,
        roomBookings: await tx.bookings.listBookings({ roomId: booking.roomId }),
        roomName: room.name,
      });
      await tx.bookings.updateBooking(updated);
      if (action === 'check_out') await tx.rooms.setRoomStatus(room.id, 'dirty');
      await tx.audit.append({
        actor,
        action: `booking.${action}`,
        subjectId: id,
        payload: { from: booking.status, to: updated.status },
      });
      return updated;
    });
  }

  async function moveBookingToRoom(id: string, roomId: string, actor: AuditActor) {
    return repos.transaction(async (tx) => {
      const booking = await loadBooking(tx, id);
      const target = await loadRoom(tx, roomId);
      const updated = moveBooking(booking, {
        ...target,
        roomBookings: await tx.bookings.listBookings({ roomId }),
        now: clock(),
      });
      await tx.bookings.updateBooking(updated);
      await tx.audit.append({
        actor,
        action: 'booking.move',
        subjectId: id,
        payload: { fromRoomId: booking.roomId, toRoomId: roomId },
      });
      return updated;
    });
  }

  async function changeBookingDates(id: string, range: DateRange, actor: AuditActor) {
    return repos.transaction(async (tx) => {
      const booking = await loadBooking(tx, id);
      const current = await loadRoom(tx, booking.roomId);
      const updated = changeDates(booking, range, {
        ...current,
        roomBookings: await tx.bookings.listBookings({ roomId: booking.roomId }),
        now: clock(),
        pricing,
      });
      await tx.bookings.updateBooking(updated);
      await tx.audit.append({
        actor,
        action: 'booking.change_dates',
        subjectId: id,
        payload: {
          from: { checkIn: booking.checkIn, checkOut: booking.checkOut },
          to: range,
          total: {
            from: booking.priceSnapshot?.total ?? null,
            to: updated.priceSnapshot?.total ?? null,
          },
        },
      });
      return updated;
    });
  }

  async function getDayOverview(date: IsoDate = hotelToday(clock())): Promise<DayOverview> {
    // Half-open ranges: a booking leaving on `date` has its last night on the day before.
    const bookings = await repos.bookings.listBookings({
      from: addDays(date, -1),
      to: addDays(date, 1),
    });
    const guests = new Map((await repos.guests.listGuests()).map((g) => [g.id, g.name]));
    const rooms = new Map((await repos.rooms.listRooms()).map((r) => [r.id, r.name]));
    const summarize = (list: Booking[]): BookingSummary[] =>
      list.map((booking) => ({
        booking,
        guestName: guests.get(booking.guestId) ?? 'Unknown guest',
        roomName: rooms.get(booking.roomId) ?? booking.roomId,
      }));
    return {
      date,
      arrivals: summarize(arrivalsOn(bookings, date)),
      departures: summarize(departuresOn(bookings, date)),
      inHouse: summarize(stayingOver(bookings, date)),
    };
  }

  return {
    getBookingDetail,
    applyBookingAction,
    moveBooking: moveBookingToRoom,
    changeBookingDates,
    getDayOverview,
  };
}

export type HotelService = ReturnType<typeof createHotelService>;
