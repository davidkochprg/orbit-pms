import type {
  Booking,
  BookingPatch,
  BookingSource,
  BookingStatus,
  Charge,
  Currency,
  GuestPatch,
  PendingAction,
  PendingActionDetails,
  PendingActionInput,
  PendingValue,
  PricingConfig,
  QuoteAddons,
  StayGuestPatch,
} from '@orbit/shared';
import { formatMoney, hotelInfoCategoryLabels } from '@orbit/shared';
import type { BillingService } from './billing';
import { changedBookingFields } from './bookings';
import { hotelToday, nightsBetween } from './dates';
import { DomainError } from './errors';
import type { GuestService } from './guests';
import { adjustmentChanges, applyAdjustments, type RatesService } from './rates';
import type { RegistrationService } from './registration';
import type { Repositories } from './repositories';
import type { HotelService } from './service';
import type { SettingsService } from './settings';

export interface PendingActionDeps {
  repos: Repositories;
  hotel: HotelService;
  billing: BillingService;
  registrations: RegistrationService;
  guests: GuestService;
  rates: Pick<RatesService, 'getPricing' | 'adjustRates'>;
  settings: Pick<SettingsService, 'previewHotelInfo' | 'saveHotelInfo'>;
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

type Money = (n: number | undefined) => string;

/** Formats amounts in the hotel's currency, "?" for one that isn't known. */
const moneyIn =
  (currency: Currency): Money =>
  (n) =>
    n === undefined ? '?' : formatMoney(n, currency);

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

/** "2 × Sauna at 150 CZK (300 CZK), VAT 21%" for a bill extra. */
function extra(
  c: Pick<Charge, 'quantity' | 'label' | 'unitPrice' | 'amount' | 'vatBracket'>,
  money: Money,
  pricing: PricingConfig,
) {
  const tax =
    c.vatBracket === 'none'
      ? 'no tax'
      : `${pricing.tax[c.vatBracket].label} ${pricing.tax[c.vatBracket].rate}%`;
  return `${c.quantity} × ${c.label} at ${money(c.unitPrice)} (${money(c.amount)}), ${tax}`;
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

interface Description {
  summary: string;
  details: PendingActionDetails;
}

const text = (t: string): PendingValue => ({ text: t });
const dates = (b: Pick<Booking, 'checkIn' | 'checkOut'>): PendingValue => ({
  checkIn: b.checkIn,
  checkOut: b.checkOut,
});
type Change = PendingActionDetails['changes'][number];
const changed = (
  label: string,
  before: PendingValue | null,
  after: PendingValue | null,
): Change => ({
  label,
  before,
  after,
});
const added = (label: string, after: PendingValue): Change => changed(label, null, after);
const removed = (label: string, before: PendingValue): Change => changed(label, before, null);

function details(
  changes: Change[],
  amount: PendingActionDetails['amount'] = null,
  note: string | null = null,
): PendingActionDetails {
  return { changes, amount, note };
}

/** "+15%", "-10%", or "Season rate" for none. */
function ratePercent(percent: number): string {
  return percent === 0 ? 'Season rate' : `${percent > 0 ? '+' : ''}${percent}%`;
}

const shortWeekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Fri 2026-11-06" */
function nightLabel(date: string): string {
  return `${shortWeekdays[new Date(`${date}T12:00:00Z`).getUTCDay()]} ${date}`;
}

const bookingStatusLabels: Record<BookingStatus, string> = {
  hold: 'Hold',
  confirmed: 'Confirmed',
  checked_in: 'Checked in',
  checked_out: 'Checked out',
  cancelled: 'Cancelled',
};

const statusChange = (from: BookingStatus, to: BookingStatus) =>
  changed('Status', text(bookingStatusLabels[from]), text(bookingStatusLabels[to]));

const profileLabels: Record<keyof GuestPatch, string> = {
  name: 'Name',
  email: 'Email',
  phone: 'Phone',
  language: 'Language',
  notes: 'Notes',
};

const sourceLabels: Record<BookingSource, string> = {
  phone: 'Phone',
  email: 'Email',
  walk_in: 'Walk-in',
  web: 'Website',
  ota: 'OTA',
};

const hasAddons = (a: QuoteAddons) => a.wellness || a.dogs > 0 || a.extraBeds > 0;

/** "Wellness, 1 dog" for a confirm card; "None" without add-ons. */
function addonsText(a: QuoteAddons): string {
  const parts = [
    ...(a.wellness ? ['Wellness'] : []),
    ...(a.dogs ? [`${a.dogs} dog${a.dogs === 1 ? '' : 's'}`] : []),
    ...(a.extraBeds ? [`${a.extraBeds} extra bed${a.extraBeds === 1 ? '' : 's'}`] : []),
  ];
  return parts.length ? parts.join(', ') : 'None';
}

/** The stay total before and after a change that re-prices it, if the new total is known. */
function totalChange(before: Booking, after: Booking): PendingActionDetails['amount'] {
  const total = after.priceSnapshot?.total;
  if (total === undefined) return null;
  return { label: 'Total', before: before.priceSnapshot?.total ?? null, after: total };
}

/** One confirm-card row per booking field an edit changes. */
function bookingChanges(before: Booking, after: Booking, patch: BookingPatch): Change[] {
  const rows = changedBookingFields(before, patch).flatMap((field): Change[] => {
    switch (field) {
      case 'adults':
      case 'childAges':
        return [changed('Party', text(party(before)), text(party(after)))];
      case 'checkIn':
      case 'checkOut':
        return [changed('Stay', dates(before), dates(after))];
      case 'addons':
        return [
          changed('Add-ons', text(addonsText(before.addons)), text(addonsText(after.addons))),
        ];
      case 'source':
        return [
          changed('Source', text(sourceLabels[before.source]), text(sourceLabels[after.source])),
        ];
      case 'notes':
        return [
          changed(
            'Notes',
            before.notes ? text(before.notes) : null,
            after.notes ? text(after.notes) : null,
          ),
        ];
      case 'roomId':
        return [];
    }
  });
  // Adults and children, or both dates, are one row each.
  return rows.filter((r, i) => rows.findIndex((o) => o.label === r.label) === i);
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
  rates,
  settings,
  clock,
  newId,
}: PendingActionDeps) {
  async function guestName(guestId: string): Promise<string> {
    return (await repos.guests.getGuest(guestId))?.name ?? 'Unknown guest';
  }

  /** The one-line summary the model repeats, and the details the confirm card shows. */
  async function describe(action: PendingActionInput): Promise<Description> {
    const pricing = await billing.pricing();
    const money = moneyIn(pricing.currency);
    const balanceOf = async (bookingId: string) => (await billing.getFolio(bookingId)).balance;
    switch (action.kind) {
      case 'create_hold': {
        const { booking, room, newGuest } = await hotel.previewHold(action.input);
        const name = newGuest?.name ?? (await guestName(booking.guestId));
        const total = booking.priceSnapshot?.total;
        return {
          summary: `Hold room ${room.name} for ${name}, ${stay(booking)}, ${party(booking)}, total ${money(total)}`,
          details: details(
            [
              added('Guest', text(name)),
              added('Room', text(room.name)),
              added('Stay', dates(booking)),
              added('Party', text(party(booking))),
              ...(hasAddons(booking.addons)
                ? [added('Add-ons', text(addonsText(booking.addons)))]
                : []),
            ],
            total === undefined ? null : { label: 'Total', before: null, after: total },
          ),
        };
      }
      case 'confirm_booking':
      case 'cancel_booking': {
        const verb = action.kind === 'confirm_booking' ? 'confirm' : 'cancel';
        const before = await hotel.getBookingDetail(action.input.bookingId);
        const { booking, room } = await hotel.previewBookingAction(action.input.bookingId, verb);
        return {
          summary: `${verb === 'confirm' ? 'Confirm' : 'Cancel'} ${await guestName(booking.guestId)} in room ${room.name}, ${stay(booking)}`,
          details: details([statusChange(before.booking.status, booking.status)]),
        };
      }
      case 'check_in': {
        const { booking, room } = await hotel.previewBookingAction(
          action.input.bookingId,
          'check_in',
        );
        const { missingIds, booking: before } = await hotel.getBookingDetail(booking.id);
        const missing = missingIds
          ? `${missingIds} ${missingIds === 1 ? 'guest still needs' : 'guests still need'} an ID in the guest book`
          : null;
        return {
          summary: `Check in ${await guestName(booking.guestId)} to room ${room.name}, ${stay(booking)}${missing ? `; ${missing}` : ''}`,
          details: details([statusChange(before.status, booking.status)], null, missing),
        };
      }
      case 'check_out': {
        const before = await hotel.getBookingDetail(action.input.bookingId);
        const { booking, room } = await hotel.previewBookingAction(
          action.input.bookingId,
          'check_out',
        );
        const balance = await balanceOf(booking.id);
        const bill =
          balance > 0
            ? `${money(balance)} still due`
            : balance < 0
              ? `${money(-balance)} owed to the guest`
              : 'bill paid in full';
        return {
          summary: `Check out ${await guestName(booking.guestId)} from room ${room.name}; ${bill}`,
          details: details(
            [statusChange(before.booking.status, booking.status)],
            { label: 'Balance', before: null, after: balance },
            balance !== 0 ? `${bill[0]!.toUpperCase()}${bill.slice(1)}.` : null,
          ),
        };
      }
      case 'move_booking': {
        const before = await hotel.getBookingDetail(action.input.bookingId);
        const { room } = await hotel.previewMove(action.input.bookingId, action.input.roomId);
        return {
          summary: `Move ${before.guest.name} (${stay(before.booking)}) from room ${before.room.name} to room ${room.name}`,
          details: details([changed('Room', text(before.room.name), text(room.name))]),
        };
      }
      case 'change_dates': {
        const before = await hotel.getBookingDetail(action.input.bookingId);
        const { booking } = await hotel.previewDates(action.input.bookingId, action.input);
        return {
          summary: `Change ${before.guest.name} in room ${before.room.name} to ${stay(booking)}, total ${money(booking.priceSnapshot?.total)} (was ${money(before.booking.priceSnapshot?.total)})`,
          details: details(
            [changed('Stay', dates(before.booking), dates(booking))],
            totalChange(before.booking, booking),
          ),
        };
      }
      case 'update_booking': {
        const { bookingId, ...patch } = action.input;
        const before = await hotel.getBookingDetail(bookingId);
        const { booking, room } = await hotel.previewUpdate(bookingId, patch);
        const moved = room.id !== before.room.id ? `, move to room ${room.name}` : '';
        const summary = changes(before.booking, booking, patch);
        return {
          summary: `Update ${before.guest.name} in room ${before.room.name}${summary ? `: ${summary}` : ''}${moved}, total ${money(booking.priceSnapshot?.total)} (was ${money(before.booking.priceSnapshot?.total)})`,
          details: details(
            [
              ...(room.id !== before.room.id
                ? [changed('Room', text(before.room.name), text(room.name))]
                : []),
              ...bookingChanges(before.booking, booking, patch),
            ],
            totalChange(before.booking, booking),
          ),
        };
      }
      case 'add_charge': {
        const { bookingId, ...body } = action.input;
        const before = await hotel.getBookingDetail(bookingId);
        const balance = await balanceOf(bookingId);
        const { charge, balanceAfter } = await billing.previewCharge(bookingId, body);
        return {
          summary: `Add ${charge.quantity} × ${charge.label} at ${money(charge.unitPrice)} (${money(charge.amount)}) to the bill of ${before.guest.name}, room ${before.room.name}; balance then ${money(balanceAfter)}`,
          details: details([added('Extra', text(extra(charge, money, pricing)))], {
            label: 'Balance',
            before: balance,
            after: balanceAfter,
          }),
        };
      }
      case 'record_payment': {
        const { bookingId, ...body } = action.input;
        const before = await hotel.getBookingDetail(bookingId);
        const balance = await balanceOf(bookingId);
        const { payment, balanceAfter } = await billing.previewPayment(bookingId, body);
        const method = payment.method.replace('_', ' ');
        const what =
          payment.kind === 'refund'
            ? `Refund ${money(payment.amount)} by ${method} to`
            : `Record a ${method} payment of ${money(payment.amount)} from`;
        return {
          summary: `${what} ${before.guest.name}, room ${before.room.name}; balance then ${money(balanceAfter)}`,
          details: details(
            [
              added(
                payment.kind === 'refund' ? 'Refund' : 'Payment',
                text(`${money(payment.amount)} by ${method}`),
              ),
            ],
            { label: 'Balance', before: balance, after: balanceAfter },
          ),
        };
      }
      case 'update_charge': {
        const { bookingId, chargeId, ...patch } = action.input;
        const before = await hotel.getBookingDetail(bookingId);
        const balance = await balanceOf(bookingId);
        const { charge, updated, balanceAfter } = await billing.previewChargeUpdate(
          bookingId,
          chargeId,
          patch,
        );
        return {
          summary: `Change ${charge.label} on the bill of ${before.guest.name}, room ${before.room.name}, to ${extra(updated, money, pricing)} (was ${extra(charge, money, pricing)}); balance then ${money(balanceAfter)}`,
          details: details(
            [
              changed(
                'Extra',
                text(extra(charge, money, pricing)),
                text(extra(updated, money, pricing)),
              ),
            ],
            { label: 'Balance', before: balance, after: balanceAfter },
          ),
        };
      }
      case 'remove_charge': {
        const { bookingId, chargeId } = action.input;
        const before = await hotel.getBookingDetail(bookingId);
        const balance = await balanceOf(bookingId);
        const { charge, balanceAfter } = await billing.previewChargeRemoval(bookingId, chargeId);
        return {
          summary: `Remove ${extra(charge, money, pricing)} from the bill of ${before.guest.name}, room ${before.room.name}; balance then ${money(balanceAfter)}`,
          details: details([removed('Extra', text(extra(charge, money, pricing)))], {
            label: 'Balance',
            before: balance,
            after: balanceAfter,
          }),
        };
      }
      case 'add_stay_guest': {
        const { bookingId, ...body } = action.input;
        const before = await hotel.getBookingDetail(bookingId);
        const { added: person } = await registrations.previewAdd(bookingId, body);
        const { name: _, ...identity } = body;
        const id = identityText(identity);
        return {
          summary: `Add ${person.name} to the guest book of room ${before.room.name} (${before.guest.name}'s booking)${id ? `: ${id}` : ''}`,
          details: details([added('Guest book', text(id ? `${person.name}: ${id}` : person.name))]),
        };
      }
      case 'update_stay_guest': {
        const { bookingId, stayGuestId, ...patch } = action.input;
        const before = await hotel.getBookingDetail(bookingId);
        const { current } = await registrations.previewUpdate(bookingId, stayGuestId, patch);
        const id = identityText(patch) || 'no changes';
        return {
          summary: `Record in the guest book of room ${before.room.name} for ${current.name}: ${id}`,
          details: details([added(current.name, text(id))]),
        };
      }
      case 'remove_stay_guest': {
        const { bookingId, stayGuestId } = action.input;
        const before = await hotel.getBookingDetail(bookingId);
        const { removed: person } = await registrations.previewRemove(bookingId, stayGuestId);
        return {
          summary: `Remove ${person.name} from the guest book of room ${before.room.name} (${before.guest.name}'s booking)`,
          details: details([removed('Guest book', text(person.name))]),
        };
      }
      case 'adjust_rates': {
        const { adjustments } = await rates.getPricing();
        const { nights } = action.input;
        if (nights.some((n) => n.date < hotelToday(clock()))) {
          throw new DomainError('invalid_input', 'Rates can only change for tonight or later');
        }
        applyAdjustments(adjustments, nights);
        const list = adjustmentChanges(adjustments, nights);
        if (list.length === 0) {
          throw new DomainError('invalid_input', 'Those nights already have these rates');
        }
        return {
          summary: `Change the rates of ${list.length} night${list.length === 1 ? '' : 's'}: ${list
            .map((c) => `${nightLabel(c.date)} ${ratePercent(c.to)}`)
            .join(', ')}`,
          details: details(
            list.map((c) =>
              changed(nightLabel(c.date), text(ratePercent(c.from)), text(ratePercent(c.to))),
            ),
            null,
            'For every room type, on top of the season. Existing bookings keep their price.',
          ),
        };
      }
      case 'save_hotel_info': {
        const { entry, replaced } = await settings.previewHotelInfo(action.input);
        const where = hotelInfoCategoryLabels[entry.category];
        const until = entry.until ? ` (until ${entry.until})` : '';
        return {
          summary: `${replaced ? 'Update' : 'Save'} in ${where}: ${entry.title}: ${entry.details}${until}`,
          details: details([
            changed(
              where,
              replaced ? text(`${replaced.title}: ${replaced.details}`) : null,
              text(`${entry.title}: ${entry.details}`),
            ),
            ...(entry.until ? [added('Until', text(entry.until))] : []),
          ]),
        };
      }
      case 'update_guest': {
        const { guestId, ...patch } = action.input;
        const { guest } = await guests.previewUpdate(guestId, patch);
        return {
          summary: `Update the profile of ${guest.name}: ${profileText(patch)}`,
          details: details(
            (Object.keys(patch) as (keyof GuestPatch)[]).map((key) => {
              const was = guest[key];
              const now = patch[key];
              return changed(
                profileLabels[key],
                was === null || was === '' ? null : text(String(was)),
                now === null || now === undefined || now === '' ? null : text(String(now)),
              );
            }),
          ),
        };
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
      case 'adjust_rates':
        await rates.adjustRates(action.input.nights, 'agent');
        return null;
      case 'save_hotel_info':
        await settings.saveHotelInfo(action.input, 'agent');
        return null;
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
        ...(await describe(input)),
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
