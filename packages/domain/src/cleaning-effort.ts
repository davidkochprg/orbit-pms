import type {
  Booking,
  CleaningEffort,
  Guest,
  Inquiry,
  RoomOccupancy,
  StayReading,
} from '@orbit/shared';
import { nightsBetween } from './dates';

/** A stay this many nights or longer leaves the room needing a deeper clean. */
export const LONG_STAY_NIGHTS = 7;
/** The latest guest messages the model reads per stay, each cut to `MAX_MESSAGE_CHARS`. */
const MAX_MESSAGES = 5;
const MAX_MESSAGE_CHARS = 600;
const MAX_CUES = 4;
const MAX_CUE_CHARS = 24;
const MAX_PREPARE = 3;

/**
 * The text the model reads about a stay for housekeeping: the booking's and the guest's notes and
 * the guest's own latest messages about the booking. Empty when there is nothing to read.
 */
export function staySource(
  booking: Booking,
  guest: Guest | undefined,
  inquiries: Inquiry[],
): string {
  const messages = inquiries
    .filter((i) => i.bookingId === booking.id)
    .flatMap((i) => i.messages)
    .filter((m) => m.direction === 'in' && m.body.trim())
    .sort((a, b) => a.sentAt.localeCompare(b.sentAt))
    .slice(-MAX_MESSAGES)
    .map((m) => `- ${m.body.trim().slice(0, MAX_MESSAGE_CHARS)}`);
  const parts = [
    booking.notes?.trim() ? `Booking notes: ${booking.notes.trim()}` : null,
    guest?.notes?.trim() ? `Guest notes: ${guest.notes.trim()}` : null,
    messages.length > 0 ? `Guest messages:\n${messages.join('\n')}` : null,
  ];
  return parts.filter((p) => p !== null).join('\n');
}

/** A cue short enough for a card: trimmed, capitalised, cut at a word. Empty if blank. */
function cue(text: string): string {
  const trimmed = text
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.!]+$/, '');
  if (!trimmed) return '';
  const cut =
    trimmed.length <= MAX_CUE_CHARS
      ? trimmed
      : trimmed.slice(0, MAX_CUE_CHARS + 1).replace(/\s+\S*$/, '') ||
        trimmed.slice(0, MAX_CUE_CHARS);
  return cut.charAt(0).toUpperCase() + cut.slice(1);
}

/** Keeps what the model read within what a card can show. */
export function normalizeStayReading(reading: StayReading): StayReading {
  const reason = reading.messReason ? cue(reading.messReason) : '';
  return {
    bookingId: reading.bookingId,
    pets: reading.pets,
    mess: reading.mess,
    messReason: reading.mess === 'usual' || !reason ? null : reason,
    prepare: [...new Set(reading.prepare.map(cue).filter(Boolean))].slice(0, MAX_PREPARE),
  };
}

export interface EffortInput {
  occupancy: RoomOccupancy;
  /** The stay whose room is cleaned today: the guest leaving, or staying over. */
  stay: Booking | null;
  /** The stay arriving today, whose room is set up for them. */
  arrival: Booking | null;
  /** What the model read from stays' notes, by booking ID. */
  readings: ReadonlyMap<string, StayReading>;
}

export interface Effort {
  effort: CleaningEffort | null;
  /** Why, in a few words each, e.g. "Dog", "2 kids", "Cot". */
  cues: string[];
}

/**
 * How much work a room is today, in points: a departure 2, a stayover 1, an arrival into an empty
 * room 0. The stay being cleaned adds 2 for dogs, 1 per child up to 2, 1 for a long stay that
 * leaves, and 1 or 2 for extra mess its notes mention; an arrival adds 1 for anything to set up.
 * Under 2 is light, 4 or more heavy. Null for a vacant room.
 */
export function cleaningEffort({ occupancy, stay, arrival, readings }: EffortInput): Effort {
  if (occupancy === 'vacant') return { effort: null, cues: [] };
  const cues: string[] = [];
  let points = occupancy === 'staying' ? 1 : occupancy === 'arriving' ? 0 : 2;

  if (stay) {
    const read = readings.get(stay.id);
    const dogs = Math.max(stay.addons.dogs, read?.pets ? 1 : 0);
    if (dogs > 0) {
      points += 2;
      cues.push(dogs === 1 ? 'Dog' : `${dogs} dogs`);
    }
    const kids = stay.childAges.length;
    if (kids > 0) {
      points += Math.min(kids, 2);
      cues.push(kids === 1 ? '1 kid' : `${kids} kids`);
    }
    if (occupancy !== 'staying' && nightsBetween(stay.checkIn, stay.checkOut) >= LONG_STAY_NIGHTS) {
      points += 1;
      cues.push('Long stay');
    }
    if (read && read.mess !== 'usual') {
      points += read.mess === 'more' ? 1 : 2;
      cues.push(read.messReason ?? 'Extra mess');
    }
  }

  if (arrival) {
    const prepare = [
      ...(arrival.addons.extraBeds > 0 ? ['Extra bed'] : []),
      ...(readings.get(arrival.id)?.prepare ?? []),
    ];
    if (prepare.length > 0) {
      points += 1;
      cues.push(...prepare);
    }
  }

  const effort: CleaningEffort = points >= 4 ? 'heavy' : points >= 2 ? 'standard' : 'light';
  const unique = [...new Set(cues.map(cue).filter(Boolean))];
  return { effort, cues: unique.slice(0, MAX_CUES) };
}

export const effortRank: Record<CleaningEffort, number> = { light: 0, standard: 1, heavy: 2 };
