import type {
  AuditActor,
  Booking,
  Guest,
  IsoDate,
  KnockOn,
  RelocateBody,
  Relocation,
  Room,
  RoomType,
} from '@orbit/shared';
import { blocksRoom, findConflicts, fitsRoomType } from './availability';
import { addDays, hotelToday } from './dates';
import { stayRequest } from './inbox';
import type { HotelPolicy } from './policy';
import type { Repositories } from './repositories';
import type { HotelService } from './service';

export interface RelocationInput {
  /** The room that went out of order. */
  room: Room;
  rooms: Room[];
  roomTypes: RoomType[];
  bookings: Booking[];
  guests: Pick<Guest, 'id' | 'name'>[];
  policy: Pick<HotelPolicy, 'dogsAllowedIn'>;
  today: IsoDate;
  now: Date;
}

const ready = (room: Room) => room.status === 'clean' || room.status === 'inspected';

/**
 * How far ahead stays are moved out of a room that goes out of order. Most repairs take days;
 * later stays wait, in case the room is back in service by then.
 */
export const RELOCATION_DAYS = 7;

/**
 * Where each stay in an out-of-order room can go, for guests in house or arriving within
 * `RELOCATION_DAYS`: a free room for the whole stay
 * that the party fits, dogs allowed if they bring one. The same room type comes first, then a
 * room that is ready when the guest is already here or arrives today, then the type closest in
 * price; the guest keeps the price they booked. Rooms taken by an earlier stay in the plan are
 * not offered twice.
 */
export function planRelocations({
  room,
  rooms,
  roomTypes,
  bookings,
  guests,
  policy,
  today,
  now,
}: RelocationInput): Relocation[] {
  const types = new Map(roomTypes.map((t) => [t.id, t]));
  const from = types.get(room.roomTypeId);
  const affected = bookings
    .filter(
      (b) =>
        b.roomId === room.id &&
        blocksRoom(b, now) &&
        b.checkOut > today &&
        b.checkIn < addDays(today, RELOCATION_DAYS),
    )
    .sort((a, b) => a.checkIn.localeCompare(b.checkIn));
  const taken = [...bookings];

  return affected.map((booking) => {
    const here = booking.checkIn <= today;
    const options = rooms.flatMap((r) => {
      const type = types.get(r.roomTypeId);
      if (!type || r.id === room.id || r.status === 'out_of_order') return [];
      if (!fitsRoomType(type, booking, booking.addons.extraBeds)) return [];
      if (booking.addons.dogs > 0 && !policy.dogsAllowedIn.includes(r.kind)) return [];
      if (findConflicts(r.id, booking, taken, now, booking.id).length > 0) return [];
      return [{ room: r, type }];
    });
    const score = ({ room: r, type }: (typeof options)[number]) => [
      type.id === room.roomTypeId ? 0 : 1,
      here && !ready(r) ? 1 : 0,
      Math.abs(type.basePrice - (from?.basePrice ?? type.basePrice)),
    ];
    const best = options.sort((a, b) => {
      const [x, y] = [score(a), score(b)];
      for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i]! - y[i]!;
      return a.room.name.localeCompare(b.room.name, undefined, { numeric: true });
    })[0];
    if (best) taken.push({ ...booking, roomId: best.room.id });
    return {
      bookingId: booking.id,
      guestName: guests.find((g) => g.id === booking.guestId)?.name ?? 'Guest',
      checkIn: booking.checkIn,
      checkOut: booking.checkOut,
      status: booking.status,
      toRoomId: best?.room.id ?? null,
      toRoomName: best?.room.name ?? null,
      sameType: best?.type.id === room.roomTypeId,
    };
  });
}

export interface KnockOnDeps {
  repos: Repositories;
  hotel: HotelService;
  policy: Pick<HotelPolicy, 'dogsAllowedIn'>;
  clock: () => Date;
}

/**
 * What recent changes made worth doing next, worked out from current data each time it is asked,
 * so it is right whichever screen, staff member or agent made the change (ADR 0018).
 */
export function createKnockOnService({ repos, hotel, policy, clock }: KnockOnDeps) {
  async function relocations(today: IsoDate, now: Date): Promise<KnockOn[]> {
    const rooms = await repos.rooms.listRooms();
    const broken = rooms.filter((r) => r.status === 'out_of_order');
    if (broken.length === 0) return [];
    const [roomTypes, bookings, guests] = await Promise.all([
      repos.rooms.listRoomTypes(),
      repos.bookings.listBookings({ status: ['hold', 'confirmed', 'checked_in'] }),
      repos.guests.listGuests(),
    ]);
    return broken.flatMap((room): KnockOn[] => {
      const moves = planRelocations({
        room,
        rooms,
        roomTypes,
        bookings,
        guests,
        policy,
        today,
        now,
      });
      if (moves.length === 0) return [];
      return [
        {
          kind: 'relocate',
          id: `relocate:${room.id}:${moves.map((m) => m.bookingId).join(',')}`,
          roomId: room.id,
          roomName: room.name,
          moves,
        },
      ];
    });
  }

  /** Requests read when nothing was free that a room is free for now, e.g. after a cancellation. */
  async function openings(today: IsoDate): Promise<KnockOn[]> {
    const waiting = (await repos.inquiries.listInquiries()).filter(
      (i) =>
        (i.status === 'new' || i.status === 'replied') &&
        i.archivedAt === null &&
        i.bookingId === null &&
        i.suggestion?.options.length === 0 &&
        i.parsed !== null &&
        (stayRequest(i.parsed)?.checkIn ?? '') >= today,
    );
    const found: KnockOn[] = [];
    for (const inquiry of waiting) {
      const stay = stayRequest(inquiry.parsed!)!;
      const { options } = await hotel.inboxOptions(inquiry.parsed!);
      if (options.length === 0) continue;
      found.push({
        kind: 'opening',
        id: `opening:${inquiry.id}`,
        inquiryId: inquiry.id,
        guestName: inquiry.parsed!.guestName ?? inquiry.senderName ?? 'A guest',
        checkIn: stay.checkIn,
        checkOut: stay.checkOut,
        rooms: options.length,
        fromTotal: Math.min(...options.map((o) => o.quote.total)),
      });
    }
    return found;
  }

  return {
    /** Where the stays still to come in an out-of-order room can go; none for a working room. */
    async relocationsFor(roomId: string): Promise<Relocation[]> {
      const now = clock();
      const found = await relocations(hotelToday(now), now);
      return found.flatMap((k) => (k.kind === 'relocate' && k.roomId === roomId ? k.moves : []));
    },

    async list(): Promise<KnockOn[]> {
      const now = clock();
      const today = hotelToday(now);
      return [...(await relocations(today, now)), ...(await openings(today))];
    },

    /** Moves the stays, each checked as any move is; stops at the first that is no longer valid. */
    async relocate({ moves }: RelocateBody, actor: AuditActor): Promise<Booking[]> {
      const moved: Booking[] = [];
      for (const { bookingId, roomId } of moves) {
        moved.push(await hotel.moveBooking(bookingId, roomId, actor));
      }
      return moved;
    },
  };
}

export type KnockOnService = ReturnType<typeof createKnockOnService>;
