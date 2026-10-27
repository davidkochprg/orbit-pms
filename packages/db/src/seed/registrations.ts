import { addDays } from '@orbit/domain';
import type { Booking, Guest, IsoDate, Language, Registration } from '@orbit/shared';
import { createRandom } from './random';

const nationality: Record<Language, string> = { cs: 'CZ', de: 'DE', pl: 'PL', en: 'GB' };

/**
 * Guest-book entries for stays that have started. Everything is synthetic: document numbers
 * start with DEMO and addresses are placeholders. Upcoming stays are left for check-in, where a
 * returning guest's earlier entry prefills the form.
 */
export function buildRegistrations(
  bookings: Booking[],
  guests: Guest[],
  today: IsoDate,
): Registration[] {
  const random = createRandom(11);
  const byId = new Map(guests.map((g) => [g.id, g]));
  // One identity per guest, reused for each of their stays.
  const identity = new Map<string, Omit<Registration, 'bookingId' | 'guestId' | 'registeredAt'>>();

  return bookings
    .filter((b) => b.status === 'checked_in' || b.status === 'checked_out')
    .map((b) => {
      const guest = byId.get(b.guestId);
      const country = nationality[guest?.language ?? 'en'];
      let person = identity.get(b.guestId);
      if (!person) {
        person = {
          nationality: country,
          dateOfBirth: addDays('1950-01-01', random.int(0, 365 * 50)),
          documentType: country === 'CZ' ? 'id_card' : random.pick(['id_card', 'passport']),
          documentNumber: `DEMO-${String(random.int(100000, 999999))}`,
          address: country === 'CZ' ? null : `Sample Street ${random.int(1, 99)}, ${country}`,
        };
        identity.set(b.guestId, person);
      }
      return {
        ...person,
        bookingId: b.id,
        guestId: b.guestId,
        registeredAt: `${b.checkIn < today ? b.checkIn : today}T14:00:00.000Z`,
      };
    });
}
