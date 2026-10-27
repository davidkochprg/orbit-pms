import type {
  AuditActor,
  AvailabilityQueryInput,
  Booking,
  BookingAction,
  BookingDetail,
  BookingSearch,
  BookingSummary,
  CreateHoldInput,
  DayOverview,
  Guest,
  IsoDate,
  Quote,
  QuoteInput,
  Room,
  RoomType,
} from '@orbit/shared';
import { checkAvailability } from './availability';
import { allowedActions, applyAction, changeDates, createHold, moveBooking } from './bookings';
import { addDays, type DateRange, hotelToday } from './dates';
import { arrivalsOn, departuresOn, stayingOver } from './day';
import { DomainError } from './errors';
import type { HotelPolicy } from './policy';
import { type PricingConfig, quote } from './pricing';
import type { NewAuditEntry, Repositories } from './repositories';
import { containsText } from './text';

export interface ServiceDeps {
  repos: Repositories;
  pricing: PricingConfig;
  policy: HotelPolicy;
  clock: () => Date;
  /** New unique ID with the given prefix, e.g. `bk`. */
  newId: (prefix: string) => string;
}

export interface AvailableRoomSummary {
  roomId: string;
  roomName: string;
  kind: Room['kind'];
  roomType: RoomType;
}

/** A change computed against current data but not yet saved. */
interface Plan {
  booking: Booking;
  /** Room and type the booking ends up in. */
  room: Room;
  newGuest?: Guest;
  audit: Omit<NewAuditEntry, 'actor'>;
  apply: (repos: Repositories) => Promise<void>;
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
 * transaction and writes an audit log entry with the acting party. `preview*` functions run the
 * same checks against current data without saving, so the agent can propose only valid changes.
 */
export function createHotelService({ repos, pricing, policy, clock, newId }: ServiceDeps) {
  async function commit(plan: (tx: Repositories) => Promise<Plan>, actor: AuditActor) {
    return repos.transaction(async (tx) => {
      const p = await plan(tx);
      await p.apply(tx);
      await tx.audit.append({ actor, ...p.audit });
      return p.booking;
    });
  }

  function planAction(id: string, action: BookingAction) {
    return async (tx: Repositories): Promise<Plan> => {
      const now = clock();
      const booking = await loadBooking(tx, id);
      const { room } = await loadRoom(tx, booking.roomId);
      const updated = applyAction(booking, action, {
        today: hotelToday(now),
        now,
        roomBookings: await tx.bookings.listBookings({ roomId: booking.roomId }),
        roomName: room.name,
      });
      return {
        booking: updated,
        room,
        audit: {
          action: `booking.${action}`,
          subjectId: id,
          payload: { from: booking.status, to: updated.status },
        },
        apply: async (r) => {
          await r.bookings.updateBooking(updated);
          if (action === 'check_out') await r.rooms.setRoomStatus(room.id, 'dirty');
        },
      };
    };
  }

  function planMove(id: string, roomId: string) {
    return async (tx: Repositories): Promise<Plan> => {
      const booking = await loadBooking(tx, id);
      const target = await loadRoom(tx, roomId);
      const updated = moveBooking(booking, {
        ...target,
        roomBookings: await tx.bookings.listBookings({ roomId }),
        now: clock(),
      });
      return {
        booking: updated,
        room: target.room,
        audit: {
          action: 'booking.move',
          subjectId: id,
          payload: { fromRoomId: booking.roomId, toRoomId: roomId },
        },
        apply: (r) => r.bookings.updateBooking(updated),
      };
    };
  }

  function planDates(id: string, range: DateRange) {
    return async (tx: Repositories): Promise<Plan> => {
      const booking = await loadBooking(tx, id);
      const current = await loadRoom(tx, booking.roomId);
      const updated = changeDates(booking, range, {
        ...current,
        roomBookings: await tx.bookings.listBookings({ roomId: booking.roomId }),
        now: clock(),
        pricing,
      });
      return {
        booking: updated,
        room: current.room,
        audit: {
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
        },
        apply: (r) => r.bookings.updateBooking(updated),
      };
    };
  }

  function planHold(input: CreateHoldInput) {
    return async (tx: Repositories): Promise<Plan> => {
      const now = clock();
      let guestId: string;
      let newGuest: Guest | undefined;
      if ('guestId' in input.guest) {
        const existing = await tx.guests.getGuest(input.guest.guestId);
        if (!existing) throw new DomainError('not_found', `Guest ${input.guest.guestId} not found`);
        guestId = existing.id;
      } else {
        newGuest = { id: newId('gst'), notes: null, ...input.guest };
        guestId = newGuest.id;
      }
      const target = await loadRoom(tx, input.roomId);
      const booking = createHold(input, {
        ...target,
        id: newId('bk'),
        guestId,
        roomBookings: await tx.bookings.listBookings({ roomId: input.roomId }),
        now,
        today: hotelToday(now),
        pricing,
        holdHours: policy.holdHours,
      });
      return {
        booking,
        room: target.room,
        ...(newGuest && { newGuest }),
        audit: {
          action: 'booking.create_hold',
          subjectId: booking.id,
          payload: {
            roomId: booking.roomId,
            total: booking.priceSnapshot?.total ?? null,
            inquiryId: input.inquiryId,
          },
        },
        apply: async (r) => {
          if (newGuest) await r.guests.createGuest(newGuest);
          await r.bookings.createBooking(booking);
        },
      };
    };
  }

  async function preview(plan: (tx: Repositories) => Promise<Plan>) {
    const { booking, room, newGuest } = await plan(repos);
    return { booking, room, newGuest: newGuest ?? null };
  }

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

  async function summarize(bookings: Booking[]): Promise<BookingSummary[]> {
    const guests = new Map((await repos.guests.listGuests()).map((g) => [g.id, g.name]));
    const rooms = new Map((await repos.rooms.listRooms()).map((r) => [r.id, r.name]));
    return bookings.map((booking) => ({
      booking,
      guestName: guests.get(booking.guestId) ?? 'Unknown guest',
      roomName: rooms.get(booking.roomId) ?? booking.roomId,
    }));
  }

  async function getDayOverview(date: IsoDate = hotelToday(clock())): Promise<DayOverview> {
    // Half-open ranges: a booking leaving on `date` has its last night on the day before.
    const bookings = await repos.bookings.listBookings({
      from: addDays(date, -1),
      to: addDays(date, 1),
    });
    return {
      date,
      arrivals: await summarize(arrivalsOn(bookings, date)),
      departures: await summarize(departuresOn(bookings, date)),
      inHouse: await summarize(stayingOver(bookings, date)),
    };
  }

  async function searchBookings(search: BookingSearch): Promise<BookingSummary[]> {
    const bookings = await repos.bookings.listBookings({
      ...(search.from && { from: search.from }),
      ...(search.to && { to: search.to }),
      ...(search.status && { status: search.status }),
    });
    return (await summarize(bookings)).filter(
      (s) =>
        (!search.guestName || containsText(s.guestName, search.guestName)) &&
        (!search.roomName || s.roomName.toLowerCase() === search.roomName.toLowerCase()),
    );
  }

  async function findAvailableRooms(
    query: AvailabilityQueryInput,
  ): Promise<AvailableRoomSummary[]> {
    const bookings = await repos.bookings.listBookings({ from: query.checkIn, to: query.checkOut });
    const available = checkAvailability(
      {
        checkIn: query.checkIn,
        checkOut: query.checkOut,
        adults: query.adults,
        childAges: query.childAges,
        ...(query.kind && { kind: query.kind }),
        ...(query.roomTypeId && { roomTypeId: query.roomTypeId }),
      },
      {
        rooms: await repos.rooms.listRooms(),
        roomTypes: await repos.rooms.listRoomTypes(),
        bookings,
        now: clock(),
      },
    );
    return available.map(({ room, roomType }) => ({
      roomId: room.id,
      roomName: room.name,
      kind: room.kind,
      roomType,
    }));
  }

  async function quoteStay(input: QuoteInput): Promise<Quote> {
    const roomTypeId = input.roomId
      ? (await loadRoom(repos, input.roomId)).roomType.id
      : input.roomTypeId;
    const roomType = (await repos.rooms.listRoomTypes()).find((t) => t.id === roomTypeId);
    if (!roomType)
      throw new DomainError('not_found', `Room type ${roomTypeId ?? '(none)'} not found`);
    return quote({ ...input, roomType }, pricing);
  }

  return {
    getBookingDetail,
    getDayOverview,
    searchBookings,
    findAvailableRooms,
    quoteStay,
    applyBookingAction: (id: string, action: BookingAction, actor: AuditActor) =>
      commit(planAction(id, action), actor),
    moveBooking: (id: string, roomId: string, actor: AuditActor) =>
      commit(planMove(id, roomId), actor),
    changeBookingDates: (id: string, range: DateRange, actor: AuditActor) =>
      commit(planDates(id, range), actor),
    createHold: (input: CreateHoldInput, actor: AuditActor) => commit(planHold(input), actor),
    previewBookingAction: (id: string, action: BookingAction) => preview(planAction(id, action)),
    previewMove: (id: string, roomId: string) => preview(planMove(id, roomId)),
    previewDates: (id: string, range: DateRange) => preview(planDates(id, range)),
    previewHold: (input: CreateHoldInput) => preview(planHold(input)),
  };
}

export type HotelService = ReturnType<typeof createHotelService>;
