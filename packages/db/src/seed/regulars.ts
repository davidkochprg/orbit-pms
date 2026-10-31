import { addDays } from '@orbit/domain';
import type { Booking, Guest, IsoDate } from '@orbit/shared';

const monthDay = (date: IsoDate) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });

/** What staff noted on earlier stays of a returning guest, newest stay last. */
interface History {
  stayNotes: (arrival: IsoDate) => string[];
  guestNotes: string | null;
}

const histories: History[] = [
  {
    stayNotes: (arrival) => [
      'Asked to move to a quieter room away from the road after the first night.',
      `Celebrating their wedding anniversary on ${monthDay(addDays(arrival, 1))}. Loved the bottle of local wine at turndown.`,
    ],
    guestNotes: null,
  },
  {
    stayNotes: () => ['Feather allergy: synthetic pillows and duvet, please.'],
    guestNotes: 'Prefers the ground floor.',
  },
  {
    stayNotes: () => [
      'Brought two e-bikes and kept them in the ski room overnight. Breakfast at 6:30 before the trails.',
    ],
    guestNotes: null,
  },
  {
    stayNotes: () => [
      'Vegetarian: asked for the vegetarian breakfast plate.',
      'Booked the sauna every evening and asked for extra towels.',
    ],
    guestNotes: null,
  },
];

/**
 * A few of today's and tomorrow's arrivals are regulars: their earlier stays carry the notes staff
 * wrote then, so Orbit has something to remember about them when they come back.
 */
export function rememberRegulars(
  bookings: Booking[],
  guests: Guest[],
  today: IsoDate,
): { bookings: Booking[]; guests: Guest[] } {
  // Today's and tomorrow's arrivals take turns, so both days have regulars.
  const on = (day: IsoDate) =>
    bookings
      .filter((b) => b.status === 'confirmed' && b.checkIn === day)
      .sort((a, b) => a.id.localeCompare(b.id));
  const todays = on(today);
  const tomorrows = on(addDays(today, 1));
  const arriving = Array.from({ length: Math.max(todays.length, tomorrows.length) }, (_, i) => [
    todays[i],
    tomorrows[i],
  ])
    .flat()
    .filter((b): b is Booking => b !== undefined);
  const notes = new Map<string, string>();
  const guestNotes = new Map<string, string>();
  const used = new Set<string>();
  let next = 0;
  for (const arrival of arriving) {
    const history = histories[next];
    if (!history) break;
    if (used.has(arrival.guestId)) continue;
    const earlier = bookings
      .filter(
        (b) => b.guestId === arrival.guestId && b.status === 'checked_out' && b.checkOut <= today,
      )
      .sort((a, b) => a.checkIn.localeCompare(b.checkIn));
    if (earlier.length === 0) continue;
    used.add(arrival.guestId);
    next++;
    const lines = history.stayNotes(arrival.checkIn);
    // The latest earlier stay gets the last note, the one before it the rest.
    const latest = earlier.at(-1)!;
    const before = earlier.length > 1 ? earlier.at(-2)! : latest;
    const add = (b: Booking, text: string) =>
      notes.set(b.id, [notes.get(b.id) ?? b.notes, text].filter(Boolean).join(' '));
    if (lines.length > 1) lines.slice(0, -1).forEach((l) => add(before, l));
    add(latest, lines.at(-1)!);
    if (history.guestNotes) guestNotes.set(arrival.guestId, history.guestNotes);
  }
  return {
    bookings: bookings.map((b) => (notes.has(b.id) ? { ...b, notes: notes.get(b.id)! } : b)),
    guests: guests.map((g) => (guestNotes.has(g.id) ? { ...g, notes: guestNotes.get(g.id)! } : g)),
  };
}
