import { buildInquiryFixtures } from '@orbit/ai/evals';
import {
  addDays,
  blocksRoom,
  checkAvailability,
  type PricingConfig,
  quote,
  rangesOverlap,
} from '@orbit/domain';
import type {
  AuditLogEntry,
  Booking,
  BookingSource,
  Charge,
  Contact,
  Guest,
  HotelProfile,
  HousekeepingTask,
  Inquiry,
  IsoDate,
  LocalEvent,
  Payment,
  QuoteAddons,
  StayGuest,
  Room,
  RoomType,
  StaffMember,
} from '@orbit/shared';
import { buildActivity } from './activity';
import { buildBilling } from './billing';
import { seedGuests, seedRooms } from './catalog';
import { buildContacts } from './contacts';
import { buildConversations } from './conversations';
import { buildEvents } from './events';
import { regionSeeds, type SeedRegion } from './regions';
import { buildStayGuests } from './registrations';
import { createRandom } from './random';

export interface SeedData {
  roomTypes: RoomType[];
  rooms: Room[];
  guests: Guest[];
  bookings: Booking[];
  inquiries: Inquiry[];
  housekeepingTasks: HousekeepingTask[];
  hotelProfile: HotelProfile;
  /** The rates the seed's bookings were priced with. */
  pricing: PricingConfig;
  staff: StaffMember[];
  charges: Charge[];
  payments: Payment[];
  stayGuests: StayGuest[];
  /** The recent activity feed. */
  auditLog: AuditLogEntry[];
  /** Mock local events behind suggested rates. */
  events: LocalEvent[];
  contacts: Contact[];
}

/** Share of rooms the seed books for the biggest event, leaving a few free for inbox requests. */
const EVENT_FILL = 0.98;

interface Draft {
  roomId: string;
  checkIn: IsoDate;
  checkOut: IsoDate;
  /** Anchors make sure the demo always has arrivals and departures today. They are never removed. */
  anchor?: boolean;
  adults?: number;
  childAges?: number[];
  addons?: Partial<QuoteAddons>;
  notes?: string;
}

// Two months back, so a report and the period before it both have stays to compare.
const WINDOW_START = -63;
const WINDOW_END = 75;
const sources: BookingSource[] = ['email', 'email', 'phone', 'web', 'web', 'ota', 'walk_in'];

/** Stays that start or end today, so the dashboard and tape chart are never empty. */
function anchors(today: IsoDate): Draft[] {
  return [
    {
      roomId: 'rm_104',
      checkIn: today,
      checkOut: addDays(today, 3),
      anchor: true,
      adults: 2,
      childAges: [5, 9],
    },
    {
      roomId: 'rm_201',
      checkIn: today,
      checkOut: addDays(today, 2),
      anchor: true,
      adults: 2,
      childAges: [],
    },
    {
      roomId: 'rm_a2',
      checkIn: today,
      checkOut: addDays(today, 5),
      anchor: true,
      adults: 2,
      childAges: [2, 7],
      notes: 'Cot for our 2-year-old, please.',
    },
    // Two departures housekeeping should tell apart: a short work trip, and a family with a dog
    // back from the trails.
    {
      roomId: 'rm_102',
      checkIn: addDays(today, -2),
      checkOut: today,
      anchor: true,
      adults: 1,
      childAges: [],
      notes: 'Business trip. Invoice to the company.',
    },
    {
      roomId: 'rm_a4',
      checkIn: addDays(today, -5),
      checkOut: today,
      anchor: true,
      adults: 2,
      childAges: [3, 6],
      addons: { dogs: 1 },
      notes: 'Hiking holiday with our dog. Asked where to rinse muddy boots.',
    },
    { roomId: 'rm_205', checkIn: addDays(today, -4), checkOut: today, anchor: true },
    { roomId: 'rm_202', checkIn: addDays(today, -2), checkOut: addDays(today, 2), anchor: true },
  ];
}

function overlapsAny(draft: Draft, drafts: Draft[]): boolean {
  return drafts.some((d) => d.roomId === draft.roomId && rangesOverlap(d, draft));
}

/**
 * Builds the demo data set relative to `today`: rooms, synthetic guests, about 440 bookings across
 * past, present and future, and ten open inquiries that each have at least one free room.
 * Deterministic for a given `today`.
 */
export function buildSeed(today: IsoDate, now: Date, region: SeedRegion = 'us'): SeedData {
  const { pricing, roomTypes: seedRoomTypes, hotelProfile, staff, extras } = regionSeeds[region];
  const random = createRandom(42);
  const roomTypes = new Map(seedRoomTypes.map((t) => [t.id, t]));
  const drafts: Draft[] = anchors(today);

  for (const room of seedRooms) {
    let cursor = addDays(today, WINDOW_START + random.int(0, 6));
    while (cursor < addDays(today, WINDOW_END)) {
      const draft = {
        roomId: room.id,
        checkIn: cursor,
        checkOut: addDays(cursor, random.int(2, 5)),
      };
      if (!overlapsAny(draft, drafts)) drafts.push(draft);
      cursor = addDays(draft.checkOut, random.chance(0.2) ? 0 : random.int(1, 9));
    }
  }

  // The big event weekend fills up, as it would: book free rooms night by night until each night
  // is nearly full, keeping a guest on for the next night where the room is free then too.
  const events = buildEvents(today, region);
  const big = events.find((e) => e.impact === 'high');
  if (big) {
    const target = Math.round(seedRooms.length * EVENT_FILL);
    const holds = (roomId: string, night: IsoDate) =>
      drafts.some((d) => d.roomId === roomId && d.checkIn <= night && night < d.checkOut);
    const sold = (night: IsoDate) => seedRooms.filter((r) => holds(r.id, night)).length;
    for (let night = big.firstNight; night <= big.lastNight; night = addDays(night, 1)) {
      for (const room of seedRooms) {
        if (sold(night) >= target) break;
        if (holds(room.id, night)) continue;
        let checkOut = addDays(night, 1);
        while (checkOut <= big.lastNight && !holds(room.id, checkOut) && sold(checkOut) < target) {
          checkOut = addDays(checkOut, 1);
        }
        // Anchored, so no random cancellation or freed room undoes the sell-out.
        drafts.push({ roomId: room.id, checkIn: night, checkOut, anchor: true });
      }
    }
  }

  const inquiryFixtures = buildInquiryFixtures(today);
  const bookings: Booking[] = [];
  const sorted = drafts.sort(
    (a, b) => a.checkIn.localeCompare(b.checkIn) || a.roomId.localeCompare(b.roomId),
  );

  const stays = new Map<string, Draft[]>();
  for (const [i, draft] of sorted.entries()) {
    const room = seedRooms.find((r) => r.id === draft.roomId);
    const roomType = room && roomTypes.get(room.roomTypeId);
    if (!room || !roomType) throw new Error(`Unknown room ${draft.roomId}`);

    const adults = draft.adults ?? random.int(roomType.maxAdults > 2 ? 2 : 1, roomType.maxAdults);
    const childAges =
      draft.childAges ??
      Array.from(
        {
          length:
            roomType.maxChildren > 0 && random.chance(roomType.maxChildren > 1 ? 0.7 : 0.15)
              ? random.int(1, roomType.maxChildren)
              : 0,
        },
        () => random.int(0, 15),
      );
    const addons = {
      wellness: random.chance(0.4),
      dogs: room.kind === 'apartment' && random.chance(0.3) ? 1 : 0,
      extraBeds: 0,
      ...draft.addons,
    };
    // One guest is never in two rooms at once.
    const guest = pickFreeGuest(random, stays, draft);
    stays.set(guest.id, [...(stays.get(guest.id) ?? []), draft]);

    let status: Booking['status'];
    let holdExpiresAt: string | null = null;
    if (draft.checkOut < today) status = random.chance(0.08) ? 'cancelled' : 'checked_out';
    else if (draft.checkIn < today) status = 'checked_in';
    else if (draft.anchor) status = 'confirmed';
    else if (random.chance(0.08)) {
      status = 'hold';
      holdExpiresAt = new Date(now.getTime() + 48 * 3600_000).toISOString();
    } else status = random.chance(0.06) ? 'cancelled' : 'confirmed';

    bookings.push({
      id: `bk_${String(i + 1).padStart(3, '0')}`,
      guestId: guest.id,
      roomId: room.id,
      checkIn: draft.checkIn,
      checkOut: draft.checkOut,
      adults,
      childAges,
      status,
      holdExpiresAt,
      source: random.pick(sources),
      addons,
      priceSnapshot: quote({ ...draft, roomType, adults, childAges, addons }, pricing),
      notes: draft.notes ?? (addons.dogs > 0 ? 'Travelling with a dog.' : null),
    });
  }

  // Every inquiry must be bookable, so the hero flow works on any day. Free up a room if needed.
  const kept = makeInquiriesBookable(bookings, inquiryFixtures, sorted, seedRoomTypes, now);

  // Guest messages about a reservation belong to one: each gets an upcoming OTA booking, made the
  // sender's, so the inbox opens that booking instead of offering to create one.
  const {
    bookings: linked,
    guests,
    links,
  } = linkReservationMessages(kept, seedGuests, inquiryFixtures, today);
  const inquiries: Inquiry[] = inquiryFixtures.map((f) => {
    const receivedAt = new Date(now.getTime() - f.receivedHoursAgo * 3600_000).toISOString();
    return {
      id: f.id,
      channel: f.channel,
      partner: f.partner,
      subject: f.subject,
      senderName: f.senderName,
      senderAddress: f.senderAddress,
      receivedAt,
      lastMessageAt: receivedAt,
      messages: [
        {
          id: `msg_${f.id}`,
          inquiryId: f.id,
          direction: 'in',
          body: f.rawText,
          sentAt: receivedAt,
          author: null,
          translation: null,
        },
      ],
      unread: true,
      archivedAt: null,
      parsed: null,
      suggestion: null,
      status: 'new',
      bookingId: links.get(f.id) ?? null,
      processedAt: null,
      processingError: null,
    };
  });

  const departingToday = new Set(
    linked.filter((b) => b.checkOut === today && b.status === 'checked_in').map((b) => b.roomId),
  );
  const arrivingToday = new Set(
    linked.filter((b) => b.checkIn === today && b.status === 'confirmed').map((b) => b.roomId),
  );
  const inHouse = linked.filter((b) => b.status === 'checked_in' && b.checkOut > today);
  // Departed rooms still need cleaning; rooms for today's arrivals are ready and inspected.
  const rooms = seedRooms.map((r) => ({
    ...r,
    status: departingToday.has(r.id)
      ? ('dirty' as const)
      : arrivingToday.has(r.id)
        ? ('inspected' as const)
        : r.status,
  }));

  const createdAt = now.toISOString();
  const cleaning = { trade: null, contactId: null, status: 'open' as const };
  const housekeepingTasks: HousekeepingTask[] = [
    ...[...departingToday].map((roomId) => ({
      roomId,
      type: 'turnover' as const,
      notes: null,
      ...cleaning,
    })),
    ...inHouse.map((b) => ({
      roomId: b.roomId,
      type: 'stayover' as const,
      notes: null,
      ...cleaning,
    })),
    // Nobody asked yet: Orbit suggests the plumber.
    {
      roomId: 'rm_203',
      type: 'maintenance' as const,
      notes: 'Bathroom tap is dripping.',
      trade: 'plumbing' as const,
      contactId: null,
      status: 'open' as const,
    },
    {
      roomId: 'rm_305',
      type: 'maintenance' as const,
      notes: 'Ceiling light flickers.',
      trade: 'electrical' as const,
      contactId: 'ct_electric',
      status: 'in_progress' as const,
    },
  ].map((t, i) => ({
    id: `hk_${String(i + 1).padStart(3, '0')}`,
    createdAt,
    ...t,
  }));

  const billing = buildBilling(linked, today, pricing, extras);
  return {
    roomTypes: seedRoomTypes,
    rooms,
    guests,
    bookings: linked,
    inquiries: [
      ...inquiries,
      ...buildConversations(linked, guests, staff, hotelProfile, today, now),
    ],
    housekeepingTasks,
    hotelProfile,
    pricing,
    staff,
    ...billing,
    stayGuests: buildStayGuests(linked, guests, today),
    auditLog: buildActivity(linked, rooms, billing.payments, housekeepingTasks, today, now),
    events,
    contacts: buildContacts(region),
  };
}

function pickFreeGuest(
  random: ReturnType<typeof createRandom>,
  stays: Map<string, Draft[]>,
  draft: Draft,
): Guest {
  for (let attempt = 0; attempt < 1000; attempt++) {
    const guest = random.pick(seedGuests);
    if (!(stays.get(guest.id) ?? []).some((s) => rangesOverlap(s, draft))) return guest;
  }
  throw new Error(`No free guest for ${draft.roomId} from ${draft.checkIn}`);
}

function makeInquiriesBookable(
  bookings: Booking[],
  fixtures: ReturnType<typeof buildInquiryFixtures>,
  drafts: Draft[],
  roomTypes: RoomType[],
  now: Date,
): Booking[] {
  const anchored = new Set(drafts.filter((d) => d.anchor).map((d) => `${d.roomId}:${d.checkIn}`));
  let result = bookings;

  for (const f of fixtures) {
    const { checkIn, checkOut, adults } = f.expected;
    if (f.expected.kind !== 'booking_request' || !checkIn || !checkOut || !adults) continue;
    const query = {
      checkIn,
      checkOut,
      adults,
      childAges: f.expected.childAges,
      ...(f.expected.wishes.apartment ? { kind: 'apartment' as const } : {}),
    };
    const ctx = { rooms: seedRooms, roomTypes, bookings: result, now };
    if (checkAvailability(query, ctx).length > 0) continue;

    const candidates = checkAvailability(query, { ...ctx, bookings: [] });
    const room = candidates.find(({ room }) =>
      result.every(
        (b) =>
          b.roomId !== room.id ||
          !blocksRoom(b, now) ||
          !rangesOverlap(b, query) ||
          !anchored.has(`${b.roomId}:${b.checkIn}`),
      ),
    )?.room;
    if (!room) throw new Error(`No room can be freed for inquiry ${f.id}`);
    result = result.filter(
      (b) => b.roomId !== room.id || !blocksRoom(b, now) || !rangesOverlap(b, query),
    );
  }
  return result;
}

/**
 * Links each "Guest message about reservation …" to an upcoming OTA booking in the next two weeks
 * and makes the sender its guest. The booking the seeded Booking.com conversation uses is left out.
 */
function linkReservationMessages(
  bookings: Booking[],
  guests: Guest[],
  fixtures: ReturnType<typeof buildInquiryFixtures>,
  today: IsoDate,
): { bookings: Booking[]; guests: Guest[]; links: Map<string, string> } {
  const guestOf = (b: Booking) => guests.find((g) => g.id === b.guestId);
  const taken = bookings.find(
    (b) =>
      b.source === 'ota' &&
      b.status === 'confirmed' &&
      b.checkIn > today &&
      guestOf(b)?.language === 'de',
  );
  const candidates = bookings.filter(
    (b) =>
      b !== taken &&
      b.source === 'ota' &&
      b.status === 'confirmed' &&
      b.checkIn > today &&
      b.checkIn <= addDays(today, 14),
  );
  const links = new Map<string, string>();
  const senders: Guest[] = [];
  const owner = new Map<string, string>();
  for (const f of fixtures) {
    if (!f.partner || !/reservation \d+/.test(f.subject ?? '')) continue;
    const name = f.senderName ?? f.expected.guestName;
    // A sender who is already a guest keeps their own stays; only new names get a booking.
    if (!name || guests.some((g) => g.name === name)) continue;
    const booking = candidates.shift();
    if (!booking) break;
    const id = `gst_${f.id}`;
    senders.push({
      id,
      name,
      email: `${name
        .normalize('NFD')
        .replace(/[^a-zA-Z ]/g, '')
        .trim()
        .toLowerCase()
        .replace(/ +/g, '.')}@example.com`,
      phone: null,
      language: f.expected.language,
      notes: null,
    });
    owner.set(booking.id, id);
    links.set(f.id, booking.id);
  }
  return {
    bookings: bookings.map((b) => (owner.has(b.id) ? { ...b, guestId: owner.get(b.id)! } : b)),
    guests: [...guests, ...senders],
    links,
  };
}
