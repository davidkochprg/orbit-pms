import {
  type IdDocumentReading,
  type IdScan,
  type IdScanPhoneView,
  type IdScanResult,
  isoDateSchema,
  type IsoDate,
} from '@orbit/shared';
import { hotelToday } from './dates';
import { DomainError } from './errors';
import type { HotelPolicy } from './policy';
import { assertCanEditGuests, primaryStayGuestId } from './registration';
import type { Repositories } from './repositories';

const unreadable =
  "Couldn't read an ID in the photo. Take it again with the whole document in view and no glare.";

/**
 * How long a photo may be read before it counts as failed. A read takes a few seconds; one still
 * going after this was cut off (e.g. the server stopped mid-request) and would otherwise block
 * retakes until the link expired.
 */
export const ID_SCAN_READ_TIMEOUT_MS = 90_000;

const tooSlow = 'Reading the photo took too long. Take it again.';

/** A scan as it stands at `now`: a read that ran past the timeout has failed. */
export function settleScan(scan: IdScan, now: Date): IdScan {
  if (scan.status !== 'reading') return scan;
  const since = scan.readingSince ? new Date(scan.readingSince).getTime() : 0;
  if (now.getTime() - since <= ID_SCAN_READ_TIMEOUT_MS) return scan;
  return { ...scan, status: 'failed', error: tooSlow, readingSince: null };
}

function isoDate(value: string | null): IsoDate | null {
  return value !== null && isoDateSchema.safeParse(value).success ? value : null;
}

/** "ANNA MARIA MÜLLER-LÜDENSCHEID" → "Anna Maria Müller-Lüdenscheid"; mixed case is kept. */
export function tidyName(raw: string): string {
  const name = raw.trim().replace(/\s+/g, ' ');
  if (name !== name.toLocaleUpperCase()) return name;
  return name
    .toLocaleLowerCase()
    .replace(/(^|[\s'-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toLocaleUpperCase());
}

/**
 * Turns what the model read into values staff can review. Anything malformed is dropped rather
 * than guessed, and an expired document or a birth date that can't be right is flagged.
 */
export function checkReading(reading: IdDocumentReading, today: IsoDate): IdScanResult {
  const warnings: string[] = [];
  const nationality = reading.nationality?.trim().toUpperCase() ?? null;
  const dateOfBirth = isoDate(reading.dateOfBirth);
  const expiresOn = isoDate(reading.expiresOn);
  const documentNumber = reading.documentNumber?.replace(/\s+/g, '').toUpperCase() ?? null;
  const address = reading.address?.trim().replace(/\s+/g, ' ').slice(0, 200) || null;
  const name = reading.fullName ? tidyName(reading.fullName).slice(0, 120) : null;

  if (dateOfBirth && dateOfBirth >= today) warnings.push('The date of birth is not in the past.');
  if (expiresOn && expiresOn < today) warnings.push(`The document expired on ${expiresOn}.`);
  if (reading.documentType === 'other') {
    warnings.push('This is not an ID card or passport. Ask for one of those.');
  }

  return {
    name,
    nationality: nationality && /^[A-Z]{2}$/.test(nationality) ? nationality : null,
    dateOfBirth: dateOfBirth && dateOfBirth < today ? dateOfBirth : null,
    documentType:
      reading.documentType === 'id_card' || reading.documentType === 'passport'
        ? reading.documentType
        : null,
    documentNumber:
      documentNumber && documentNumber.length >= 3 && documentNumber.length <= 30
        ? documentNumber
        : null,
    address,
    expiresOn,
    warnings,
  };
}

export interface IdScanDeps {
  repos: Repositories;
  policy: Pick<HotelPolicy, 'idScanMinutes'>;
  clock: () => Date;
  /** An unguessable token; it is the only key to the scan link. */
  newToken: () => string;
}

/**
 * Phone ID scans. The desk opens a scan for one person (or a companion still to add) and shows
 * its link as a QR code; the phone uploads a photo, the API has the vision model read it, and the
 * desk polls for the result to review. Nothing is saved to the guest book until staff save it.
 */
export function createIdScanService({ repos, policy, clock, newToken }: IdScanDeps) {
  /** A scan that is still open, as it stands now, or not_found. */
  async function open(id: string): Promise<IdScan> {
    const scan = await repos.idScans.get(id);
    const now = clock();
    if (!scan || scan.expiresAt <= now.toISOString()) {
      throw new DomainError('not_found', 'This scan link has expired. Open a new one at the desk.');
    }
    return settleScan(scan, now);
  }

  return {
    async start(bookingId: string, stayGuestId: string | null): Promise<IdScan> {
      const booking = await repos.bookings.getBooking(bookingId);
      if (!booking) throw new DomainError('not_found', `Booking ${bookingId} not found`);
      assertCanEditGuests(booking);
      if (stayGuestId && stayGuestId !== primaryStayGuestId(bookingId)) {
        const stored = await repos.stayGuests.listByBooking(bookingId);
        if (!stored.some((s) => s.id === stayGuestId)) {
          throw new DomainError('not_found', `Guest ${stayGuestId} not found on this booking`);
        }
      }
      const now = clock();
      await repos.idScans.deleteExpired(now.toISOString());
      const scan: IdScan = {
        id: newToken(),
        bookingId,
        stayGuestId,
        status: 'waiting',
        result: null,
        error: null,
        readingSince: null,
        createdAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + policy.idScanMinutes * 60_000).toISOString(),
      };
      await repos.idScans.save(scan);
      return scan;
    },

    /** The scan with its result, for the desk that opened it. */
    async getForDesk(bookingId: string, id: string): Promise<IdScan> {
      const scan = await open(id);
      if (scan.bookingId !== bookingId) throw new DomainError('not_found', 'Scan not found');
      return scan;
    },

    /** What the phone may see: the first name and room, never the result. */
    async getForPhone(id: string): Promise<IdScanPhoneView> {
      const scan = await open(id);
      const booking = await repos.bookings.getBooking(scan.bookingId);
      const room = booking && (await repos.rooms.getRoom(booking.roomId));
      let name: string | null = null;
      if (booking && scan.stayGuestId === primaryStayGuestId(booking.id)) {
        name = (await repos.guests.getGuest(booking.guestId))?.name ?? null;
      } else if (scan.stayGuestId) {
        const stored = await repos.stayGuests.listByBooking(scan.bookingId);
        name = stored.find((s) => s.id === scan.stayGuestId)?.name ?? null;
      }
      return {
        status: scan.status,
        firstName: name?.split(' ')[0] ?? null,
        roomName: room?.name ?? '',
        error: scan.error,
        expiresAt: scan.expiresAt,
      };
    },

    /**
     * Marks a photo as being read. A retake is fine; two uploads at once are not, unless the
     * earlier read was cut off.
     */
    async beginReading(id: string): Promise<void> {
      const scan = await open(id);
      if (scan.status === 'reading') {
        throw new DomainError('conflict', 'A photo is already being read. Wait a moment.');
      }
      await repos.idScans.save({
        ...scan,
        status: 'reading',
        result: null,
        error: null,
        readingSince: clock().toISOString(),
      });
    },

    async complete(id: string, reading: IdDocumentReading): Promise<IdScan> {
      const scan = await open(id);
      const done: IdScan = reading.readable
        ? {
            ...scan,
            status: 'done',
            result: checkReading(reading, hotelToday(clock())),
            error: null,
            readingSince: null,
          }
        : { ...scan, status: 'failed', result: null, error: unreadable, readingSince: null };
      await repos.idScans.save(done);
      return done;
    },

    async fail(id: string, error: string): Promise<void> {
      const scan = await open(id);
      await repos.idScans.save({
        ...scan,
        status: 'failed',
        result: null,
        error,
        readingSince: null,
      });
    },
  };
}

export type IdScanService = ReturnType<typeof createIdScanService>;
