import type {
  Booking,
  BookingPatch,
  Charge,
  GuestPatch,
  PendingAction,
  PendingActionInput,
  StayGuestPatch,
} from '@orbit/shared';
import type { BillingService } from './billing';
import { changedBookingFields } from './bookings';
import { nightsBetween } from './dates';
import { DomainError } from './errors';
import type { GuestService } from './guests';
import type { RegistrationService } from './registration';
import type { Repositories } from './repositories';
import type { HotelService } from './service';

export interface PendingActionDeps {
  repos: Repositories;
  hotel: HotelService;
  billing: BillingService;
  registrations: RegistrationService;
  guests: GuestService;
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

/** "2 × Sauna at 150 CZK (300 CZK), standard VAT" for a bill extra. */
function extra(c: Pick<Charge, 'quantity' | 'label' | 'unitPrice' | 'amount' | 'vatBracket'>) {
  const vat = c.vatBracket === 'none' ? 'no VAT' : `${c.vatBracket} VAT`;
  return `${c.quantity} × ${c.label} at ${czk(c.unitPrice)} (${czk(c.amount)}), ${vat}`;
}

const documentNames = { id_card: 'ID card', passport: 'passport' } as const;

/** "nationality DE, born 1990-05-01, passport no. X123" for a guest-book change. */
function identityText(fields: Omit<StayGuestPatch, 'scanId'>): string {
  const parts: string[] = [];
  if (fields.name !== undefined) parts.push(`name "${fields.name}"`);
  if (fields.nationality !== undefined)
    parts.push(`nationality ${fields.nationality ?? 'cleared'}`);
  if (fields.dateOfBirth !== undefined) parts.push(`born ${fields.dateOfBirth ?? 'cleared'}`);
  if (fields.documentType !== undefined) {
    parts.push(fields.documentType ? documentNames[fields.documentType] : 'document type cleared');
  }
  if (fields.documentNumber !== undefined) {
    parts.push(`document no. ${fields.documentNumber ?? 'cleared'}`);
  }
  if (fields.address !== undefined) parts.push(`address "${fields.address ?? ''}"`);
  return parts.join(', ');
}

/** "email anna@example.com, language de" for a guest profile edit. */
function profileText(patch: GuestPatch): string {
  return (Object.keys(patch) as (keyof GuestPatch)[])
    .map((key) => {
      const value = patch[key];
      if (value === null || value === '') return `${key} cleared`;
      return key === 'notes' || key === 'name' ? `${key} "${value}"` : `${key} ${value}`;
    })
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
  registrations,
  guests,
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
      case 'check_in': {
        const { booking, room } = await hotel.previewBookingAction(
          action.input.bookingId,
          'check_in',
        );
        const { missingIds } = await hotel.getBookingDetail(booking.id);
        const ids = missingIds
          ? `; ${missingIds} ${missingIds === 1 ? 'guest still needs' : 'guests still need'} an ID in the guest book`
          : '';
        return `Check in ${await guestName(booking.guestId)} to room ${room.name}, ${stay(booking)}${ids}`;
      }
      case 'check_out': {
        const { booking, room } = await hotel.previewBookingAction(
          action.input.bookingId,
          'check_out',
        );
        const { balance } = await billing.getFolio(booking.id);
        const bill =
          balance > 0
            ? `${czk(balance)} still due`
            : balance < 0
              ? `${czk(-balance)} owed to the guest`
              : 'bill paid in full';
        return `Check out ${await guestName(booking.guestId)} from room ${room.name}; ${bill}`;
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
      case 'update_charge': {
        const { bookingId, chargeId, ...patch } = action.input;
        const before = await hotel.getBookingDetail(bookingId);
        const { charge, updated, balanceAfter } = await billing.previewChargeUpdate(
          bookingId,
          chargeId,
          patch,
        );
        return `Change ${charge.label} on the bill of ${before.guest.name}, room ${before.room.name}, to ${extra(updated)} (was ${extra(charge)}); balance then ${czk(balanceAfter)}`;
      }
      case 'remove_charge': {
        const { bookingId, chargeId } = action.input;
        const before = await hotel.getBookingDetail(bookingId);
        const { charge, balanceAfter } = await billing.previewChargeRemoval(bookingId, chargeId);
        return `Remove ${extra(charge)} from the bill of ${before.guest.name}, room ${before.room.name}; balance then ${czk(balanceAfter)}`;
      }
      case 'add_stay_guest': {
        const { bookingId, ...body } = action.input;
        const before = await hotel.getBookingDetail(bookingId);
        const { added } = await registrations.previewAdd(bookingId, body);
        const { name: _, ...identity } = body;
        const details = identityText(identity);
        return `Add ${added.name} to the guest book of room ${before.room.name} (${before.guest.name}'s booking)${details ? `: ${details}` : ''}`;
      }
      case 'update_stay_guest': {
        const { bookingId, stayGuestId, ...patch } = action.input;
        const before = await hotel.getBookingDetail(bookingId);
        const { current } = await registrations.previewUpdate(bookingId, stayGuestId, patch);
        return `Record in the guest book of room ${before.room.name} for ${current.name}: ${identityText(patch) || 'no changes'}`;
      }
      case 'remove_stay_guest': {
        const { bookingId, stayGuestId } = action.input;
        const before = await hotel.getBookingDetail(bookingId);
        const { removed } = await registrations.previewRemove(bookingId, stayGuestId);
        return `Remove ${removed.name} from the guest book of room ${before.room.name} (${before.guest.name}'s booking)`;
      }
      case 'update_guest': {
        const { guestId, ...patch } = action.input;
        const { guest } = await guests.previewUpdate(guestId, patch);
        return `Update the profile of ${guest.name}: ${profileText(patch)}`;
      }
    }
  }

  /** Runs the action and returns the ID of the booking it created or changed, if any. */
  async function execute(action: PendingActionInput): Promise<string | null> {
    const id = (b: Booking) => b.id;
    switch (action.kind) {
      case 'create_hold':
        return id(await hotel.createHold(action.input, 'agent'));
      case 'confirm_booking':
        return id(await hotel.applyBookingAction(action.input.bookingId, 'confirm', 'agent'));
      case 'cancel_booking':
        return id(await hotel.applyBookingAction(action.input.bookingId, 'cancel', 'agent'));
      case 'check_in':
        return id(await hotel.applyBookingAction(action.input.bookingId, 'check_in', 'agent'));
      case 'check_out':
        return id(await hotel.applyBookingAction(action.input.bookingId, 'check_out', 'agent'));
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
      case 'update_charge': {
        const { bookingId, chargeId, ...patch } = action.input;
        return (await billing.updateCharge(bookingId, chargeId, patch, 'agent')).bookingId;
      }
      case 'remove_charge': {
        const { bookingId, chargeId } = action.input;
        return (await billing.removeCharge(bookingId, chargeId, 'agent')).bookingId;
      }
      case 'add_stay_guest': {
        const { bookingId, ...body } = action.input;
        await registrations.addGuest(bookingId, body, 'agent');
        return bookingId;
      }
      case 'update_stay_guest': {
        const { bookingId, stayGuestId, ...patch } = action.input;
        await registrations.updateGuest(bookingId, stayGuestId, patch, 'agent');
        return bookingId;
      }
      case 'remove_stay_guest': {
        const { bookingId, stayGuestId } = action.input;
        await registrations.removeGuest(bookingId, stayGuestId, 'agent');
        return bookingId;
      }
      case 'update_guest': {
        const { guestId, ...patch } = action.input;
        await guests.update(guestId, patch, 'agent');
        return null;
      }
    }
  }

  async function load(id: string): Promise<PendingAction> {
    const action = await repos.pendingActions.get(id);
    if (!action) throw new DomainError('not_found', `Pending action ${id} not found`);
    return action;
  }

  function alreadyResolved(action: PendingAction) {
    return new DomainError('invalid_transition', `This action was already ${action.status}`);
  }

  /**
   * Marks a pending action resolved, atomically: of two clicks at once only one wins, so the
   * change it describes can't run twice.
   */
  async function claim(id: string, status: 'confirmed' | 'rejected'): Promise<PendingAction> {
    const action = await load(id);
    if (action.status !== 'pending') throw alreadyResolved(action);
    const claimed = { ...action, status, resolvedAt: clock().toISOString() } as PendingAction;
    if (!(await repos.pendingActions.resolveIfPending(claimed)))
      throw alreadyResolved(await load(id));
    return claimed;
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
    async confirm(id: string): Promise<PendingAction> {
      const claimed = await claim(id, 'confirmed');
      let resolved: PendingAction;
      try {
        resolved = { ...claimed, bookingId: await execute(claimed) };
      } catch (err) {
        if (!(err instanceof DomainError)) {
          // Not the change's fault: put it back so it can be confirmed again.
          await repos.pendingActions.update({ ...claimed, status: 'pending', resolvedAt: null });
          throw err;
        }
        resolved = { ...claimed, status: 'failed', error: err.message };
      }
      await repos.pendingActions.update(resolved);
      return resolved;
    },

    reject: (id: string) => claim(id, 'rejected'),
  };
}

export type PendingActionService = ReturnType<typeof createPendingActionService>;
