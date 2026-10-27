import type { Booking, BookingAction, BookingStatus, IsoDate, Room, RoomType } from '@orbit/shared';
import { findConflicts, fitsRoomType } from './availability';
import { assertValidRange, type DateRange } from './dates';
import { DomainError } from './errors';
import { type PricingConfig, quote } from './pricing';

/** Statuses whose room or dates can still be changed. */
const CHANGEABLE: BookingStatus[] = ['hold', 'confirmed', 'checked_in'];

/** The status actions a booking allows on `today`. */
export function allowedActions(booking: Booking, today: IsoDate): BookingAction[] {
  switch (booking.status) {
    case 'hold':
      return ['confirm', 'cancel'];
    case 'confirmed':
      return booking.checkIn <= today && today < booking.checkOut
        ? ['check_in', 'cancel']
        : ['cancel'];
    case 'checked_in':
      return ['check_out'];
    case 'checked_out':
    case 'cancelled':
      return [];
  }
}

const nextStatus: Record<BookingAction, BookingStatus> = {
  confirm: 'confirmed',
  check_in: 'checked_in',
  check_out: 'checked_out',
  cancel: 'cancelled',
};

function assertNoConflicts(
  roomId: string,
  range: DateRange,
  booking: Booking,
  bookings: Booking[],
  now: Date,
  roomName: string,
) {
  const conflicts = findConflicts(roomId, range, bookings, now, booking.id);
  if (conflicts.length > 0) {
    throw new DomainError(
      'conflict',
      `Room ${roomName} is taken ${conflicts.map((c) => `${c.checkIn} to ${c.checkOut}`).join(', ')}`,
    );
  }
}

export interface ActionContext {
  today: IsoDate;
  now: Date;
  /** Other bookings in the same room, used to make sure a hold can still be confirmed. */
  roomBookings: Booking[];
  roomName: string;
}

/** Applies a status action, or throws `invalid_transition` / `conflict`. */
export function applyAction(booking: Booking, action: BookingAction, ctx: ActionContext): Booking {
  if (!allowedActions(booking, ctx.today).includes(action)) {
    throw new DomainError(
      'invalid_transition',
      `Cannot ${action.replace('_', ' ')} a booking that is ${booking.status.replace('_', ' ')}`,
    );
  }
  if (action === 'confirm') {
    assertNoConflicts(booking.roomId, booking, booking, ctx.roomBookings, ctx.now, ctx.roomName);
  }
  return {
    ...booking,
    status: nextStatus[action],
    holdExpiresAt: action === 'confirm' ? null : booking.holdExpiresAt,
  };
}

export interface MoveContext {
  room: Room;
  roomType: RoomType;
  /** Bookings in the target room. */
  roomBookings: Booking[];
  now: Date;
}

/**
 * Moves a booking to another room for the same dates. The agreed price is kept,
 * even if the new room is of a different type.
 */
export function moveBooking(booking: Booking, ctx: MoveContext): Booking {
  if (!CHANGEABLE.includes(booking.status)) {
    throw new DomainError('invalid_transition', `Cannot move a ${booking.status} booking`);
  }
  if (ctx.room.id === booking.roomId) {
    throw new DomainError('conflict', `Booking is already in room ${ctx.room.name}`);
  }
  if (ctx.room.status === 'out_of_order') {
    throw new DomainError('conflict', `Room ${ctx.room.name} is out of order`);
  }
  if (!fitsRoomType(ctx.roomType, booking, booking.addons.extraBeds)) {
    throw new DomainError('over_capacity', `Party does not fit room ${ctx.room.name}`);
  }
  assertNoConflicts(ctx.room.id, booking, booking, ctx.roomBookings, ctx.now, ctx.room.name);
  return { ...booking, roomId: ctx.room.id };
}

export interface DateChangeContext {
  room: Room;
  roomType: RoomType;
  /** Bookings in the booking's room. */
  roomBookings: Booking[];
  now: Date;
  pricing: PricingConfig;
}

/** Changes the dates of a stay in its current room and re-prices it. */
export function changeDates(booking: Booking, range: DateRange, ctx: DateChangeContext): Booking {
  if (!CHANGEABLE.includes(booking.status)) {
    throw new DomainError(
      'invalid_transition',
      `Cannot change dates of a ${booking.status} booking`,
    );
  }
  assertValidRange(range);
  if (booking.status === 'checked_in' && range.checkIn !== booking.checkIn) {
    throw new DomainError(
      'invalid_transition',
      'Cannot change the arrival date of a guest who has checked in',
    );
  }
  assertNoConflicts(booking.roomId, range, booking, ctx.roomBookings, ctx.now, ctx.room.name);
  return {
    ...booking,
    checkIn: range.checkIn,
    checkOut: range.checkOut,
    priceSnapshot: quote(
      {
        roomType: ctx.roomType,
        checkIn: range.checkIn,
        checkOut: range.checkOut,
        adults: booking.adults,
        childAges: booking.childAges,
        addons: booking.addons,
      },
      ctx.pricing,
    ),
  };
}

export interface HoldContext {
  id: string;
  guestId: string;
  room: Room;
  roomType: RoomType;
  roomBookings: Booking[];
  now: Date;
  today: IsoDate;
  pricing: PricingConfig;
  holdHours: number;
}

export interface HoldRequest extends DateRange {
  adults: number;
  childAges: number[];
  addons: Booking['addons'];
  source: Booking['source'];
  notes: string | null;
}

/** A new hold that blocks the room for `holdHours`, priced with `quote()`. */
export function createHold(request: HoldRequest, ctx: HoldContext): Booking {
  assertValidRange(request);
  if (request.checkIn < ctx.today) {
    throw new DomainError(
      'invalid_date_range',
      `Cannot hold a stay starting in the past (${request.checkIn})`,
    );
  }
  if (ctx.room.status === 'out_of_order') {
    throw new DomainError('conflict', `Room ${ctx.room.name} is out of order`);
  }
  const priceSnapshot = quote({ ...request, roomType: ctx.roomType }, ctx.pricing);
  const booking: Booking = {
    id: ctx.id,
    guestId: ctx.guestId,
    roomId: ctx.room.id,
    checkIn: request.checkIn,
    checkOut: request.checkOut,
    adults: request.adults,
    childAges: [...request.childAges],
    status: 'hold',
    holdExpiresAt: new Date(ctx.now.getTime() + ctx.holdHours * 3_600_000).toISOString(),
    source: request.source,
    addons: request.addons,
    priceSnapshot,
    notes: request.notes,
  };
  assertNoConflicts(ctx.room.id, booking, booking, ctx.roomBookings, ctx.now, ctx.room.name);
  return booking;
}

export interface RescheduleContext {
  room: Room;
  roomType: RoomType;
  /** Bookings in the target room. */
  roomBookings: Booking[];
  now: Date;
  pricing: PricingConfig;
}

/**
 * Moves a booking to another room and/or other dates in one step (a tape chart drag). Changing
 * only the room keeps the agreed price; changing the dates re-prices in the target room's type.
 */
export function reschedule(booking: Booking, range: DateRange, ctx: RescheduleContext): Booking {
  if (!CHANGEABLE.includes(booking.status)) {
    throw new DomainError('invalid_transition', `Cannot change a ${booking.status} booking`);
  }
  assertValidRange(range);
  const sameDates = range.checkIn === booking.checkIn && range.checkOut === booking.checkOut;
  const sameRoom = ctx.room.id === booking.roomId;
  if (sameDates && sameRoom) throw new DomainError('invalid_input', 'Nothing to change');
  if (booking.status === 'checked_in' && range.checkIn !== booking.checkIn) {
    throw new DomainError(
      'invalid_transition',
      'Cannot change the arrival date of a guest who has checked in',
    );
  }
  if (!sameRoom && ctx.room.status === 'out_of_order') {
    throw new DomainError('conflict', `Room ${ctx.room.name} is out of order`);
  }
  if (!fitsRoomType(ctx.roomType, booking, booking.addons.extraBeds)) {
    throw new DomainError('over_capacity', `Party does not fit room ${ctx.room.name}`);
  }
  assertNoConflicts(ctx.room.id, range, booking, ctx.roomBookings, ctx.now, ctx.room.name);
  return {
    ...booking,
    roomId: ctx.room.id,
    checkIn: range.checkIn,
    checkOut: range.checkOut,
    priceSnapshot: sameDates
      ? booking.priceSnapshot
      : quote(
          {
            roomType: ctx.roomType,
            ...range,
            adults: booking.adults,
            childAges: booking.childAges,
            addons: booking.addons,
          },
          ctx.pricing,
        ),
  };
}
