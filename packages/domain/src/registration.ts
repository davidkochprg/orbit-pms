import type {
  AuditActor,
  Booking,
  Guest,
  GuestBook,
  IdentityFields,
  IsoDate,
  NewStayGuestBody,
  RegistrationField,
  StayGuest,
  StayGuestPatch,
  StayGuestView,
} from '@orbit/shared';
import { hotelToday } from './dates';
import { DomainError } from './errors';
import type { HotelPolicy } from './policy';
import type { Repositories } from './repositories';

const identityKeys = [
  'nationality',
  'dateOfBirth',
  'documentType',
  'documentNumber',
  'address',
] as const satisfies readonly (keyof IdentityFields)[];

const emptyIdentity: IdentityFields = {
  nationality: null,
  dateOfBirth: null,
  documentType: null,
  documentNumber: null,
  address: null,
};

/** The main guest's entry has a fixed ID, so it exists before anything about them is recorded. */
export function primaryStayGuestId(bookingId: string): string {
  return `sg_${bookingId}`;
}

/** Whole years from `dateOfBirth` to `day`. */
export function ageOn(dateOfBirth: IsoDate, day: IsoDate): number {
  const years = Number(day.slice(0, 4)) - Number(dateOfBirth.slice(0, 4));
  return day.slice(5) < dateOfBirth.slice(5) ? years - 1 : years;
}

/**
 * Guest-book fields a person still needs: nationality and date of birth always, an ID document
 * from `idDocumentMinAge` (or when the age is unknown), and a home address for guests from abroad.
 */
export function missingFields(
  person: IdentityFields,
  today: IsoDate,
  policy: Pick<HotelPolicy, 'homeCountry' | 'idDocumentMinAge'>,
): RegistrationField[] {
  const missing: RegistrationField[] = [];
  if (!person.nationality) missing.push('nationality');
  if (!person.dateOfBirth) missing.push('dateOfBirth');
  const needsDocument =
    !person.dateOfBirth || ageOn(person.dateOfBirth, today) >= policy.idDocumentMinAge;
  if (needsDocument && !person.documentType) missing.push('documentType');
  if (needsDocument && !person.documentNumber) missing.push('documentNumber');
  if (person.nationality && person.nationality !== policy.homeCountry && !person.address) {
    missing.push('address');
  }
  return missing;
}

/**
 * Everyone in the room: the main guest (from their profile, entry or not) first, then companions.
 * People the party counts but nobody has added yet count as missing; people listed beyond the
 * party (it was made smaller after they were added) count as extra.
 */
export function buildGuestBook(
  booking: Booking,
  guest: Guest,
  stored: StayGuest[],
  previous: IdentityFields | null,
  today: IsoDate,
  policy: Pick<HotelPolicy, 'homeCountry' | 'idDocumentMinAge'>,
): GuestBook {
  const primaryId = primaryStayGuestId(booking.id);
  const primary: StayGuest = stored.find((s) => s.id === primaryId) ?? {
    id: primaryId,
    bookingId: booking.id,
    guestId: guest.id,
    name: guest.name,
    ...emptyIdentity,
    registeredAt: null,
    createdAt: new Date(0).toISOString(),
  };
  const companions = stored
    .filter((s) => s.id !== primaryId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const view = (s: StayGuest, isPrimary: boolean): StayGuestView => ({
    ...s,
    ...(isPrimary && { name: guest.name, guestId: guest.id }),
    primary: isPrimary,
    missing: missingFields(s, today, policy),
  });
  const guests = [view(primary, true), ...companions.map((c) => view(c, false))];
  const partySize = booking.adults + booking.childAges.length;
  const incomplete = guests.filter((g) => g.missing.length > 0).length;
  return {
    guests,
    partySize,
    missing: incomplete + Math.max(0, partySize - guests.length),
    extra: Math.max(0, guests.length - partySize),
    previous,
  };
}

/** Throws unless the booking's guest book may change: anything but a cancelled booking. */
export function assertCanEditGuests(booking: Booking): void {
  if (booking.status === 'cancelled') {
    throw new DomainError('invalid_transition', "A cancelled booking's guests can't be changed");
  }
}

/** Throws unless the date of birth is in the past. */
export function assertValidIdentity(fields: Partial<IdentityFields>, today: IsoDate): void {
  if (fields.dateOfBirth && fields.dateOfBirth >= today) {
    throw new DomainError('invalid_input', 'The date of birth must be in the past');
  }
}

function identityOf(s: IdentityFields): IdentityFields {
  const { nationality, dateOfBirth, documentType, documentNumber, address } = s;
  return { nationality, dateOfBirth, documentType, documentNumber, address };
}

function hasIdentity(fields: Partial<IdentityFields>): boolean {
  return identityKeys.some((k) => fields[k] !== undefined);
}

/** Deletes the scan that values came from, if it belongs to this booking. True if it did. */
async function discardScan(r: Repositories, bookingId: string, scanId: string | undefined) {
  if (!scanId) return false;
  const scan = await r.idScans.get(scanId);
  if (scan?.bookingId !== bookingId) return false;
  await r.idScans.delete(scanId);
  return true;
}

export interface RegistrationDeps {
  repos: Repositories;
  policy: HotelPolicy;
  clock: () => Date;
  newId: (prefix: string) => string;
}

/**
 * The guest book: one entry per person in the room. Check-in doesn't wait for it; missing entries
 * stay flagged on the booking until someone records them. The audit log notes which fields changed,
 * never their values.
 */
export function createRegistrationService({ repos, policy, clock, newId }: RegistrationDeps) {
  async function load(r: Repositories, bookingId: string) {
    const booking = await r.bookings.getBooking(bookingId);
    if (!booking) throw new DomainError('not_found', `Booking ${bookingId} not found`);
    const guest = await r.guests.getGuest(booking.guestId);
    if (!guest) throw new DomainError('not_found', `Guest ${booking.guestId} not found`);
    return { booking, guest };
  }

  async function bookOf(r: Repositories, booking: Booking, guest: Guest): Promise<GuestBook> {
    const earlier = await r.stayGuests.latestRegistered(guest.id, booking.id);
    return buildGuestBook(
      booking,
      guest,
      await r.stayGuests.listByBooking(booking.id),
      earlier && identityOf(earlier),
      hotelToday(clock()),
      policy,
    );
  }

  /** The companion `body` would add, checked against the booking; nothing is saved. */
  async function planAdd(r: Repositories, bookingId: string, body: NewStayGuestBody) {
    const { booking, guest } = await load(r, bookingId);
    assertCanEditGuests(booking);
    const now = clock();
    const { scanId, ...fields } = body;
    assertValidIdentity(fields, hotelToday(now));
    const before = await bookOf(r, booking, guest);
    if (before.guests.length >= before.partySize) {
      throw new DomainError(
        'over_capacity',
        `The booking is for ${before.partySize} ${before.partySize === 1 ? 'guest' : 'guests'}; change the party to add another`,
      );
    }
    const added: StayGuest = {
      ...emptyIdentity,
      ...fields,
      id: newId('sg'),
      bookingId,
      guestId: null,
      registeredAt: hasIdentity(fields) ? now.toISOString() : null,
      createdAt: now.toISOString(),
    };
    return { booking, guest, added, fields, scanId };
  }

  /** The entry `patch` would leave, checked against the booking; nothing is saved. */
  async function planUpdate(
    r: Repositories,
    bookingId: string,
    stayGuestId: string,
    patch: StayGuestPatch,
  ) {
    const { booking, guest } = await load(r, bookingId);
    assertCanEditGuests(booking);
    const now = clock();
    const { scanId, ...fields } = patch;
    assertValidIdentity(fields, hotelToday(now));
    const current = (await bookOf(r, booking, guest)).guests.find((g) => g.id === stayGuestId);
    if (!current) {
      throw new DomainError('not_found', `Guest ${stayGuestId} not found on this booking`);
    }
    if (current.primary && fields.name !== undefined && fields.name !== guest.name) {
      throw new DomainError('invalid_input', "The main guest's name is changed on their profile");
    }
    const updated: StayGuest = {
      ...identityOf(current),
      id: current.id,
      bookingId,
      guestId: current.guestId,
      name: current.name,
      createdAt: current.createdAt,
      ...fields,
      registeredAt: hasIdentity(fields) ? now.toISOString() : current.registeredAt,
    };
    return { booking, guest, current, updated, fields, scanId };
  }

  /** The companion that would be taken off the booking; nothing is saved. */
  async function planRemove(r: Repositories, bookingId: string, stayGuestId: string) {
    const { booking, guest } = await load(r, bookingId);
    assertCanEditGuests(booking);
    if (stayGuestId === primaryStayGuestId(bookingId)) {
      throw new DomainError('invalid_input', "The main guest can't be removed");
    }
    const removed = (await r.stayGuests.listByBooking(bookingId)).find((s) => s.id === stayGuestId);
    if (!removed) {
      throw new DomainError('not_found', `Guest ${stayGuestId} not found on this booking`);
    }
    return { booking, guest, removed };
  }

  return {
    async getGuestBook(bookingId: string): Promise<GuestBook> {
      const { booking, guest } = await load(repos, bookingId);
      return bookOf(repos, booking, guest);
    },

    /** Checks an addition without saving it, e.g. for an agent proposal. */
    previewAdd: (bookingId: string, body: NewStayGuestBody) => planAdd(repos, bookingId, body),
    /** Checks a change without saving it, e.g. for an agent proposal. */
    previewUpdate: (bookingId: string, stayGuestId: string, patch: StayGuestPatch) =>
      planUpdate(repos, bookingId, stayGuestId, patch),
    /** Checks a removal without saving it, e.g. for an agent proposal. */
    previewRemove: (bookingId: string, stayGuestId: string) =>
      planRemove(repos, bookingId, stayGuestId),

    /** Adds a companion to the room, up to the party size, e.g. straight from an ID scan. */
    async addGuest(bookingId: string, body: NewStayGuestBody, actor: AuditActor) {
      return repos.transaction(async (tx) => {
        const { booking, guest, added, fields, scanId } = await planAdd(tx, bookingId, body);
        await tx.stayGuests.save(added);
        const scanned = await discardScan(tx, bookingId, scanId);
        await tx.audit.append({
          actor,
          action: 'booking.add_guest',
          subjectId: bookingId,
          payload: {
            stayGuestId: added.id,
            fields: identityKeys.filter((k) => fields[k]),
            ...(scanned && { scanned: true }),
          },
        });
        return bookOf(tx, booking, guest);
      });
    },

    /**
     * Changes a person's name or ID details. The main guest's name lives in their profile. Values
     * from one of the booking's scans (`scanId`) discard that scan in the same transaction.
     */
    async updateGuest(
      bookingId: string,
      stayGuestId: string,
      patch: StayGuestPatch,
      actor: AuditActor,
    ): Promise<GuestBook> {
      return repos.transaction(async (tx) => {
        const { booking, guest, updated, fields, scanId } = await planUpdate(
          tx,
          bookingId,
          stayGuestId,
          patch,
        );
        await tx.stayGuests.save(updated);
        const scanned = await discardScan(tx, bookingId, scanId);
        await tx.audit.append({
          actor,
          action: 'booking.update_guest',
          subjectId: bookingId,
          payload: {
            stayGuestId,
            fields: Object.keys(fields),
            ...(scanned && { scanned: true }),
          },
        });
        return bookOf(tx, booking, guest);
      });
    },

    /** Takes a companion off the booking. The main guest stays. */
    async removeGuest(bookingId: string, stayGuestId: string, actor: AuditActor) {
      return repos.transaction(async (tx) => {
        const { booking, guest } = await planRemove(tx, bookingId, stayGuestId);
        await tx.stayGuests.delete(stayGuestId);
        await tx.audit.append({
          actor,
          action: 'booking.remove_guest',
          subjectId: bookingId,
          payload: { stayGuestId },
        });
        return bookOf(tx, booking, guest);
      });
    },
  };
}

export type RegistrationService = ReturnType<typeof createRegistrationService>;
