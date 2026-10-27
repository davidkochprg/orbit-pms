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
  Booking,
  BookingSource,
  Guest,
  HousekeepingTask,
  Inquiry,
  IsoDate,
  Room,
  RoomType,
} from '@orbit/shared';
import { seedGuests, seedRooms, seedRoomTypes } from './catalog';
import { createRandom } from './random';

export interface SeedData {
  roomTypes: RoomType[];
  rooms: Room[];
  guests: Guest[];
  bookings: Booking[];
  inquiries: Inquiry[];
  housekeepingTasks: HousekeepingTask[];
}

interface Draft {
  roomId: string;
  checkIn: IsoDate;
  checkOut: IsoDate;
  /** Anchors make sure the demo always has arrivals and departures today. They are never removed. */
  anchor?: boolean;
  adults?: number;
  childAges?: number[];
}

const WINDOW_START = -21;
const WINDOW_END = 45;
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
    },
    { roomId: 'rm_102', checkIn: addDays(today, -3), checkOut: today, anchor: true },
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
export function buildSeed(today: IsoDate, now: Date, pricing: PricingConfig): SeedData {
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
      notes: addons.dogs > 0 ? 'Travelling with a dog.' : null,
    });
  }

  // Every inquiry must be bookable, so the hero flow works on any day. Free up a room if needed.
  const kept = makeInquiriesBookable(bookings, inquiryFixtures, sorted, now);

  const inquiries: Inquiry[] = inquiryFixtures.map((f) => ({
    id: f.id,
    rawText: f.rawText,
    channel: f.channel,
    partner: f.partner,
    subject: f.subject,
    senderName: f.senderName,
    senderAddress: f.senderAddress,
    receivedAt: new Date(now.getTime() - f.receivedHoursAgo * 3600_000).toISOString(),
    parsed: null,
    suggestion: null,
    reply: null,
    status: 'new',
    bookingId: null,
    processedAt: null,
    processingError: null,
  }));

  const departingToday = new Set(
    kept.filter((b) => b.checkOut === today && b.status === 'checked_in').map((b) => b.roomId),
  );
  const arrivingToday = new Set(
    kept.filter((b) => b.checkIn === today && b.status === 'confirmed').map((b) => b.roomId),
  );
  const inHouse = kept.filter((b) => b.status === 'checked_in' && b.checkOut > today);
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
  const housekeepingTasks: HousekeepingTask[] = [
    ...[...departingToday].map((roomId) => ({ roomId, type: 'turnover' as const, notes: null })),
    ...inHouse.map((b) => ({ roomId: b.roomId, type: 'stayover' as const, notes: null })),
    { roomId: 'rm_203', type: 'maintenance' as const, notes: 'Bathroom tap is dripping.' },
  ].map((t, i) => ({
    id: `hk_${String(i + 1).padStart(3, '0')}`,
    status: 'open',
    createdAt,
    ...t,
  }));

  return {
    roomTypes: seedRoomTypes,
    rooms,
    guests: seedGuests,
    bookings: kept,
    inquiries,
    housekeepingTasks,
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
    const ctx = { rooms: seedRooms, roomTypes: seedRoomTypes, bookings: result, now };
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
