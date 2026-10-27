import type { Booking, BookingPatch, PendingAction, PendingActionInput } from '@orbit/shared';
import type { BillingService } from './billing';
import { changedBookingFields } from './bookings';
import { nightsBetween } from './dates';
import { DomainError } from './errors';
import type { Repositories } from './repositories';
import type { HotelService } from './service';

export interface PendingActionDeps {
  repos: Repositories;
  hotel: HotelService;
  billing: BillingService;
  clock: () => Date;
  newId: (prefix: string) => string;
}

function party(b: Pick<Booking, 'adults' | 'childAges'>): string {
  const kids = b.childAges.length;
  return `${b.adults} adult${b.adults === 1 ? '' : 's'}${kids ? ` + ${kids} child${kids === 1 ? '' : 'ren'}` : ''}`;
}

function stay(b: Pick<Booking, 'checkIn' | 'checkOut'>): string {
  const n = nightsBetween(b.checkIn, b.checkOut);
  return `${b.checkIn} to ${b.checkOut} (${n} night${n === 1 ? '' : 's'})`;
}

const czk = (n: number | undefined) => (n === undefined ? '?' : `${n} CZK`);

/** "party 2 adults → 1 adult, notes" for an edit summary. */
function changes(before: Booking, after: Booking, patch: BookingPatch): string {
  return changedBookingFields(before, patch)
    .map((field) => {
      switch (field) {
        case 'adults':
        case 'childAges':
          return `party ${party(before)} → ${party(after)}`;
        case 'checkIn':
        case 'checkOut':
          return `dates ${stay(after)}`;
        case 'addons':
          return `add-ons wellness ${after.addons.wellness ? 'yes' : 'no'}, dogs ${after.addons.dogs}, extra beds ${after.addons.extraBeds}`;
        case 'source':
          return `source ${after.source}`;
        case 'notes':
          return `notes "${after.notes ?? ''}"`;
        case 'roomId':
          return null;
      }
    })
    .filter((s, i, all) => s !== null && all.indexOf(s) === i)
    .join(', ');
}

/**
 * Agent mutations are proposed, not executed. `propose` validates the change against current
 * data and stores it; only `confirm` (a user click) runs it, using the stored arguments.
 */
export function createPendingActionService({
  repos,
  hotel,
  billing,
  clock,
  newId,
}: PendingActionDeps) {
  async function guestName(guestId: string): Promise<string> {
    return (await repos.guests.getGuest(guestId))?.name ?? 'Unknown guest';
  }

  async function describe(action: PendingActionInput): Promise<string> {
    switch (action.kind) {
      case 'create_hold': {
        const { booking, room, newGuest } = await hotel.previewHold(action.input);
        const name = newGuest?.name ?? (await guestName(booking.guestId));
        return `Hold room ${room.name} for ${name}, ${stay(booking)}, ${party(booking)}, total ${czk(booking.priceSnapshot?.total)}`;
      }
      case 'confirm_booking':
      case 'cancel_booking': {
        const verb = action.kind === 'confirm_booking' ? 'confirm' : 'cancel';
        const { booking, room } = await hotel.previewBookingAction(action.input.bookingId, verb);
        return `${verb === 'confirm' ? 'Confirm' : 'Cancel'} ${await guestName(booking.guestId)} in room ${room.name}, ${stay(booking)}`;
      }
      case 'move_booking': {
        const before = await hotel.getBookingDetail(action.input.bookingId);
        const { room } = await hotel.previewMove(action.input.bookingId, action.input.roomId);
        return `Move ${before.guest.name} (${stay(before.booking)}) from room ${before.room.name} to room ${room.name}`;
      }
      case 'change_dates': {
        const before = await hotel.getBookingDetail(action.input.bookingId);
        const { booking } = await hotel.previewDates(action.input.bookingId, action.input);
        return `Change ${before.guest.name} in room ${before.room.name} to ${stay(booking)}, total ${czk(booking.priceSnapshot?.total)} (was ${czk(before.booking.priceSnapshot?.total)})`;
      }
      case 'update_booking': {
        const { bookingId, ...patch } = action.input;
        const before = await hotel.getBookingDetail(bookingId);
        const { booking, room } = await hotel.previewUpdate(bookingId, patch);
        const moved = room.id !== before.room.id ? `, move to room ${room.name}` : '';
        const details = changes(before.booking, booking, patch);
        return `Update ${before.guest.name} in room ${before.room.name}${details ? `: ${details}` : ''}${moved}, total ${czk(booking.priceSnapshot?.total)} (was ${czk(before.booking.priceSnapshot?.total)})`;
      }
      case 'add_charge': {
        const { bookingId, ...body } = action.input;
        const before = await hotel.getBookingDetail(bookingId);
        const { charge, balanceAfter } = await billing.previewCharge(bookingId, body);
        return `Add ${charge.quantity} × ${charge.label} at ${czk(charge.unitPrice)} (${czk(charge.amount)}) to the bill of ${before.guest.name}, room ${before.room.name}; balance then ${czk(balanceAfter)}`;
      }
      case 'record_payment': {
        const { bookingId, ...body } = action.input;
        const before = await hotel.getBookingDetail(bookingId);
        const { payment, balanceAfter } = await billing.previewPayment(bookingId, body);
        const method = payment.method.replace('_', ' ');
        const what =
          payment.kind === 'refund'
            ? `Refund ${czk(payment.amount)} by ${method} to`
            : `Record a ${method} payment of ${czk(payment.amount)} from`;
        return `${what} ${before.guest.name}, room ${before.room.name}; balance then ${czk(balanceAfter)}`;
      }
    }
  }

  /** Runs the action and returns the ID of the booking it created or changed. */
  async function execute(action: PendingActionInput): Promise<string> {
    const id = (b: Booking) => b.id;
    switch (action.kind) {
      case 'create_hold':
        return id(await hotel.createHold(action.input, 'agent'));
      case 'confirm_booking':
        return id(await hotel.applyBookingAction(action.input.bookingId, 'confirm', 'agent'));
      case 'cancel_booking':
        return id(await hotel.applyBookingAction(action.input.bookingId, 'cancel', 'agent'));
      case 'move_booking':
        return id(await hotel.moveBooking(action.input.bookingId, action.input.roomId, 'agent'));
      case 'change_dates':
        return id(await hotel.changeBookingDates(action.input.bookingId, action.input, 'agent'));
      case 'update_booking': {
        const { bookingId, ...patch } = action.input;
        return id(await hotel.updateBooking(bookingId, patch, 'agent'));
      }
      case 'add_charge': {
        const { bookingId, ...body } = action.input;
        return (await billing.addCharge(bookingId, body, 'agent')).bookingId;
      }
      case 'record_payment': {
        const { bookingId, ...body } = action.input;
        return (await billing.recordPayment(bookingId, body, 'agent')).bookingId;
      }
    }
  }

  async function load(id: string): Promise<PendingAction> {
    const action = await repos.pendingActions.get(id);
    if (!action) throw new DomainError('not_found', `Pending action ${id} not found`);
    return action;
  }

  async function resolve(
    id: string,
    decide: (a: PendingAction) => Promise<Partial<PendingAction>>,
  ) {
    const action = await load(id);
    if (action.status !== 'pending') {
      throw new DomainError('invalid_transition', `This action was already ${action.status}`);
    }
    const resolved = {
      ...action,
      ...(await decide(action)),
      resolvedAt: clock().toISOString(),
    } as PendingAction;
    await repos.pendingActions.update(resolved);
    return resolved;
  }

  return {
    get: load,

    /** Throws a DomainError if the change would not be valid right now. */
    async propose(input: PendingActionInput): Promise<PendingAction> {
      const action = {
        ...input,
        id: newId('act'),
        summary: await describe(input),
        status: 'pending',
        bookingId: 'bookingId' in input.input ? input.input.bookingId : null,
        error: null,
        createdAt: clock().toISOString(),
        resolvedAt: null,
      } as PendingAction;
      await repos.pendingActions.create(action);
      return action;
    },

    /** Runs the stored action. If it is no longer valid, the action is marked failed. */
    confirm: (id: string) =>
      resolve(id, async (action) => {
        try {
          return { status: 'confirmed', bookingId: await execute(action) };
        } catch (err) {
          if (!(err instanceof DomainError)) throw err;
          return { status: 'failed', error: err.message };
        }
      }),

    reject: (id: string) => resolve(id, () => Promise.resolve({ status: 'rejected' })),
  };
}

export type PendingActionService = ReturnType<typeof createPendingActionService>;
