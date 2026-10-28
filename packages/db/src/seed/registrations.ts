import { addDays, primaryStayGuestId } from '@orbit/domain';
import type { Booking, Guest, IdentityFields, IsoDate, Language, StayGuest } from '@orbit/shared';
import { createRandom } from './random';

const nationality: Record<Language, string> = { cs: 'CZ', de: 'DE', pl: 'PL', en: 'GB' };

/** Synthetic first names for companions, who share the main guest's surname. */
const companionNames: Record<Language, string[]> = {
  cs: ['Eva', 'Petr', 'Klára', 'Ondřej', 'Bára', 'Matěj'],
  de: ['Lena', 'Jonas', 'Mia', 'Felix', 'Emma', 'Paul'],
  pl: ['Zofia', 'Jakub', 'Maja', 'Kacper', 'Lena', 'Antoni'],
  en: ['Grace', 'Oliver', 'Ella', 'Harry', 'Ivy', 'Jack'],
};

/**
 * Guest-book entries for stays that have started: the main guest and their companions. Everything
 * is synthetic: document numbers start with DEMO and addresses are placeholders. Some in-house
 * rooms still miss a companion's ID, as happens with late arrivals, so the reminder has something
 * to show. Upcoming stays are left for check-in, where a returning guest's earlier entry prefills
 * the form.
 */
export function buildStayGuests(bookings: Booking[], guests: Guest[], today: IsoDate): StayGuest[] {
  const random = createRandom(11);
  const byId = new Map(guests.map((g) => [g.id, g]));
  // One identity per guest, reused for each of their stays.
  const identity = new Map<string, IdentityFields>();

  function person(country: string, dateOfBirth: IsoDate, adult: boolean): IdentityFields {
    return {
      nationality: country,
      dateOfBirth,
      documentType: !adult
        ? null
        : country === 'CZ'
          ? 'id_card'
          : random.pick(['id_card', 'passport']),
      documentNumber: adult ? `DEMO-${String(random.int(100000, 999999))}` : null,
      address: country === 'CZ' ? null : `Sample Street ${random.int(1, 99)}, ${country}`,
    };
  }

  return bookings
    .filter((b) => b.status === 'checked_in' || b.status === 'checked_out')
    .flatMap((b, i) => {
      const guest = byId.get(b.guestId);
      const language = guest?.language ?? 'en';
      const country = nationality[language];
      const registeredAt = `${b.checkIn < today ? b.checkIn : today}T14:00:00.000Z`;
      let main = identity.get(b.guestId);
      if (!main) {
        main = person(country, addDays('1950-01-01', random.int(0, 365 * 50)), true);
        identity.set(b.guestId, main);
      }
      const surname = guest?.name.split(' ').at(-1) ?? 'Example';
      const entries: StayGuest[] = [
        {
          id: primaryStayGuestId(b.id),
          bookingId: b.id,
          guestId: b.guestId,
          name: guest?.name ?? 'Demo Guest',
          ...main,
          registeredAt,
          createdAt: registeredAt,
        },
      ];
      const companions = [
        ...Array.from({ length: b.adults - 1 }, () => ({ adult: true, age: random.int(20, 70) })),
        ...b.childAges.map((age) => ({ adult: false, age })),
      ];
      // Every third room in house is still missing its last companion's ID.
      const lateId = b.status === 'checked_in' && i % 3 === 0 && companions.length > 0;
      companions.forEach(({ adult, age }, n) => {
        const name = `${companionNames[language][(i + n) % 6]} ${surname}`;
        const born = addDays(today, -(age * 365 + random.int(30, 330)));
        const missing = lateId && n === companions.length - 1;
        const fields: IdentityFields = missing
          ? {
              nationality: null,
              dateOfBirth: null,
              documentType: null,
              documentNumber: null,
              address: null,
            }
          : person(country, born, adult || age >= 15);
        entries.push({
          id: `sg_${b.id}_${n + 1}`,
          bookingId: b.id,
          guestId: null,
          name,
          ...fields,
          registeredAt: missing ? null : registeredAt,
          createdAt: `${registeredAt.slice(0, 11)}14:0${Math.min(n + 1, 9)}:00.000Z`,
        });
      });
      return entries;
    });
}
