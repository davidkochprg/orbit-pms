import type {
  Booking,
  Guest,
  GuestMemory,
  GuestMemoryItem,
  Inquiry,
  IsoDate,
  Room,
  RoomType,
} from '@orbit/shared';
import { DomainError } from './errors';
import { hotelToday } from './dates';
import type { Repositories } from './repositories';
import { normalizeText } from './text';

/** At most this many of the guest's own messages are read, newest first. */
const MAX_MESSAGES = 6;
const MAX_MESSAGE_LENGTH = 600;

/** Stays that ended, whether they came or not, oldest first. */
export function pastStays(bookings: Booking[], today: IsoDate): Booking[] {
  return bookings
    .filter((b) => b.checkOut <= today && b.status === 'checked_out')
    .sort((a, b) => a.checkIn.localeCompare(b.checkIn));
}

const party = (b: Booking) =>
  [
    `${b.adults} adult${b.adults === 1 ? '' : 's'}`,
    b.childAges.length > 0 ? `children aged ${b.childAges.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join(' and ');

/**
 * Everything about a guest worth remembering for a next stay, as text for the model: the notes
 * on their profile, their earlier stays with any notes, and what they wrote to the hotel. Null
 * when there is nothing to read: no profile notes, no notes on earlier stays and no messages.
 */
export function guestMemorySource({
  guest,
  bookings,
  inquiries,
  rooms,
  roomTypes,
  today,
}: {
  guest: Guest;
  bookings: Booking[];
  inquiries: Inquiry[];
  rooms: Room[];
  roomTypes: RoomType[];
  today: IsoDate;
}): string | null {
  const ids = new Set(bookings.map((b) => b.id));
  const email = guest.email && normalizeText(guest.email);
  const messages = inquiries
    .filter(
      (i) =>
        (i.bookingId && ids.has(i.bookingId)) ||
        (email && i.senderAddress && normalizeText(i.senderAddress) === email),
    )
    .flatMap((i) => i.messages.filter((m) => m.direction === 'in'))
    .sort((a, b) => b.sentAt.localeCompare(a.sentAt))
    .slice(0, MAX_MESSAGES);
  // The stay at hand shows its own notes; memory is what came before.
  const stays = pastStays(bookings, today);
  const noted = stays.filter((b) => b.notes?.trim());
  if (!guest.notes?.trim() && noted.length === 0 && messages.length === 0) return null;

  const stayLine = (b: Booking) => {
    const room = rooms.find((r) => r.id === b.roomId);
    const type = room && roomTypes.find((t) => t.id === room.roomTypeId);
    const extras = [
      b.addons.wellness && 'wellness',
      b.addons.dogs > 0 && 'a dog',
      b.addons.extraBeds > 0 && 'an extra bed',
    ].filter(Boolean);
    return `- ${b.checkIn} to ${b.checkOut}, ${type?.name ?? 'room'} ${room?.name ?? ''}, ${party(b)}${extras.length > 0 ? `, with ${extras.join(' and ')}` : ''}${b.notes?.trim() ? `. Notes: ${b.notes.trim()}` : ''}`;
  };
  return [
    `Guest: ${guest.name}`,
    `Profile notes: ${guest.notes?.trim() || 'none'}`,
    `Earlier stays (${stays.length}):`,
    ...(stays.length > 0 ? stays.map(stayLine) : ['- none']),
    'What they wrote to the hotel, newest first:',
    ...(messages.length > 0
      ? messages.map(
          (m) =>
            `- ${m.sentAt.slice(0, 10)}: "${m.body.replace(/\s+/g, ' ').slice(0, MAX_MESSAGE_LENGTH)}"`,
        )
      : ['- nothing']),
  ].join('\n');
}

/**
 * What Orbit remembers about guests: read by the model from each guest's history, kept with the
 * text it was read from, so an unchanged history is never read twice.
 */
export function createGuestMemoryService({
  repos,
  clock,
}: {
  repos: Repositories;
  clock: () => Date;
}) {
  async function history(guestId: string) {
    const guest = await repos.guests.getGuest(guestId);
    if (!guest) throw new DomainError('not_found', `Guest ${guestId} not found`);
    const [bookings, inquiries, rooms, roomTypes, saved] = await Promise.all([
      repos.bookings.listBookings({ guestId }),
      repos.inquiries.listInquiries(),
      repos.rooms.listRooms(),
      repos.rooms.listRoomTypes(),
      repos.guestMemories.get(guestId),
    ]);
    const today = hotelToday(clock());
    const source = guestMemorySource({ guest, bookings, inquiries, rooms, roomTypes, today });
    const memory: GuestMemory = {
      guestId,
      pastStays: pastStays(bookings, today).length,
      items: source && saved ? saved.items : [],
      current: source === null || saved?.source === source,
      hasHistory: source !== null,
      readAt: source && saved ? saved.readAt : null,
    };
    return { memory, source };
  }

  return {
    /** What is remembered now; `current` is false when the history changed since. */
    get: async (guestId: string) => (await history(guestId)).memory,
    /** The text to read, when the memory isn't current; null when there is nothing new. */
    async sourceToRead(guestId: string): Promise<string | null> {
      const { memory, source } = await history(guestId);
      return memory.current ? null : source;
    },
    /** Keeps what was read from `source`. */
    async save(guestId: string, source: string, items: GuestMemoryItem[]): Promise<GuestMemory> {
      await repos.guestMemories.save({
        guestId,
        items,
        source,
        readAt: clock().toISOString(),
      });
      return (await history(guestId)).memory;
    },
  };
}

export type GuestMemoryService = ReturnType<typeof createGuestMemoryService>;
