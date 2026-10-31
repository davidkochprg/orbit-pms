import { amountsInText } from '@orbit/ai';
import { buildInquiryFixtures, evalRoomNames } from '@orbit/ai/evals';
import {
  assertValidPricing,
  buildFolio,
  assertValidProfile,
  blocksRoom,
  addDays,
  checkAvailability,
  planBlock,
  pricingConfig,
  rangesOverlap,
} from '@orbit/domain';
import {
  bookingSchema,
  guestSchema,
  hotelProfileSchema,
  inquirySchema,
  noteLinks,
  roomSchema,
  sameNoteTitle,
} from '@orbit/shared';
import { describe, expect, it } from 'vitest';
import { buildSeed } from './build';

const today = '2026-10-27';
const now = new Date('2026-10-27T08:00:00Z');
const seed = buildSeed(today, now, 'cz');

describe('buildSeed', () => {
  it('has fifty rooms of six types, including six apartments', () => {
    expect(seed.rooms).toHaveLength(50);
    expect(new Set(seed.rooms.map((r) => r.roomTypeId)).size).toBe(6);
    expect(seed.rooms.filter((r) => r.kind === 'apartment')).toHaveLength(6);
    expect(new Set(seed.rooms.map((r) => r.id)).size).toBe(50);
  });

  it('describes the demo hotel with a valid profile and no prices', () => {
    expect(hotelProfileSchema.parse(seed.hotelProfile)).toEqual(seed.hotelProfile);
    expect(() => assertValidProfile(seed.hotelProfile)).not.toThrow();
    const notes = seed.hotelProfile.entries;
    expect(new Set(notes.map((e) => e.category)).size).toBeGreaterThanOrEqual(5);
    expect(notes.every((e) => (e.tags?.length ?? 0) > 0)).toBe(true);
    // Every link names a note, so Knowledge can open it.
    const links = notes.flatMap((e) => noteLinks(e.details));
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(notes.some((e) => sameNoteTitle(e.title, link))).toBe(true);
    // Prices come from quote(); an amount here would bypass the draft price guard.
    expect(amountsInText(JSON.stringify(seed.hotelProfile))).toEqual([]);
  });

  it('stores the valid rates its bookings were priced with', () => {
    expect(seed.pricing).toEqual(pricingConfig);
    expect(() => assertValidPricing(seed.pricing)).not.toThrow();
  });

  it("settles every past stay and leaves today's departures something to pay", () => {
    const folio = (id: string) => {
      const b = seed.bookings.find((x) => x.id === id)!;
      return buildFolio(
        b,
        seed.charges.filter((c) => c.bookingId === id),
        seed.payments.filter((p) => p.bookingId === id),
        seed.pricing,
      );
    };
    for (const b of seed.bookings.filter((x) => x.status === 'checked_out')) {
      expect(folio(b.id).balance, b.id).toBe(0);
    }
    const leaving = seed.bookings.filter((b) => b.checkOut === today && b.status === 'checked_in');
    for (const b of leaving) expect(folio(b.id).balance, b.id).toBeGreaterThan(0);
    expect(seed.charges.length).toBeGreaterThan(50);
    expect(seed.payments.some((p) => p.note === 'Deposit' && p.paidOn <= today)).toBe(true);
  });

  it('bills only stays that have started, and never a hold or a cancellation', () => {
    const byId = new Map(seed.bookings.map((b) => [b.id, b]));
    for (const c of seed.charges) {
      const b = byId.get(c.bookingId)!;
      expect(['checked_in', 'checked_out']).toContain(b.status);
      expect(c.postedOn >= b.checkIn && c.postedOn < b.checkOut && c.postedOn <= today).toBe(true);
    }
    for (const p of seed.payments) {
      expect(p.amount).toBeGreaterThan(0);
      expect(['hold', 'cancelled']).not.toContain(byId.get(p.bookingId)!.status);
    }
  });

  it('puts everyone of a started stay in the guest book, with synthetic documents only', () => {
    const started = seed.bookings.filter(
      (b) => b.status === 'checked_in' || b.status === 'checked_out',
    );
    for (const b of started) {
      const entries = seed.stayGuests.filter((s) => s.bookingId === b.id);
      expect(entries).toHaveLength(b.adults + b.childAges.length);
      expect(entries[0]).toMatchObject({ id: `sg_${b.id}`, guestId: b.guestId });
    }
    const documents = seed.stayGuests.flatMap((s) => (s.documentNumber ? [s.documentNumber] : []));
    expect(documents.length).toBeGreaterThan(0);
    expect(documents.every((d) => d.startsWith('DEMO-'))).toBe(true);
    expect(seed.stayGuests.every((s) => s.dateOfBirth === null || s.dateOfBirth < today)).toBe(
      true,
    );
    const arrivals = seed.bookings.filter((b) => b.checkIn === today && b.status === 'confirmed');
    expect(seed.stayGuests.some((s) => arrivals.some((a) => a.id === s.bookingId))).toBe(false);
  });

  it('leaves some in-house companions without an ID to fill in later', () => {
    const inHouse = new Set(
      seed.bookings.filter((b) => b.status === 'checked_in').map((b) => b.id),
    );
    const late = seed.stayGuests.filter((s) => inHouse.has(s.bookingId) && s.registeredAt === null);
    expect(late.length).toBeGreaterThan(0);
    expect(late.every((s) => s.guestId === null)).toBe(true);
  });

  it('has a synthetic team with an active manager', () => {
    expect(seed.staff.filter((s) => s.active && s.role === 'manager').length).toBeGreaterThan(0);
    expect(seed.staff.every((s) => s.email === null || s.email.endsWith('@example.com'))).toBe(
      true,
    );
    expect(new Set(seed.staff.map((s) => s.id)).size).toBe(seed.staff.length);
  });

  it('fills about half the hotel on a typical night', () => {
    const night = seed.bookings.filter(
      (b) => b.status !== 'cancelled' && b.checkIn <= today && today < b.checkOut,
    );
    expect(night.length).toBeGreaterThanOrEqual(15);
    expect(night.length).toBeLessThanOrEqual(40);
  });

  it('matches the room names the housekeeping evals use', () => {
    expect(seed.rooms.map((r) => r.name).sort()).toEqual([...evalRoomNames].sort());
  });

  it('never puts children in a room type that takes none', () => {
    const noChildren = new Set(seed.roomTypes.filter((t) => t.maxChildren === 0).map((t) => t.id));
    for (const b of seed.bookings) {
      const room = seed.rooms.find((r) => r.id === b.roomId);
      if (room && noChildren.has(room.roomTypeId)) expect(b.childAges).toEqual([]);
    }
  });

  it('links each guest message about a reservation to an upcoming booking of the sender', () => {
    const messages = seed.inquiries.filter((i) => /reservation \d+/.test(i.subject ?? ''));
    expect(messages.length).toBeGreaterThan(0);
    for (const m of messages) {
      const booking = seed.bookings.find((b) => b.id === m.bookingId);
      expect(booking).toMatchObject({ source: 'ota', status: 'confirmed' });
      expect(seed.guests.find((g) => g.id === booking?.guestId)?.name).toBe(m.senderName);
    }
  });

  it('opens with a recent activity feed from staff and Orbit', () => {
    expect(seed.auditLog.length).toBeGreaterThan(10);
    expect(new Set(seed.auditLog.map((e) => e.actor))).toEqual(new Set(['user', 'agent']));
    const ids = new Set([...seed.bookings.map((b) => b.id), ...seed.rooms.map((r) => r.id)]);
    expect(seed.auditLog.every((e) => e.subjectId !== null && ids.has(e.subjectId))).toBe(true);
    expect(seed.auditLog.every((e) => e.createdAt <= now.toISOString())).toBe(true);
    // Every staff change names a seeded team member.
    const team = new Set(seed.staff.map((m) => m.id));
    const by = (e: (typeof seed.auditLog)[number]) => (e.payload as { by?: unknown }).by;
    expect(
      seed.auditLog.filter((e) => e.actor === 'user').every((e) => team.has(by(e) as string)),
    ).toBe(true);
  });

  it('has a few hundred bookings in the past, present and future', () => {
    expect(seed.bookings.length).toBeGreaterThanOrEqual(300);
    expect(seed.bookings.length).toBeLessThanOrEqual(1100);
    expect(seed.bookings.some((b) => b.status === 'checked_out')).toBe(true);
    expect(seed.bookings.some((b) => b.status === 'checked_in')).toBe(true);
    expect(seed.bookings.some((b) => b.status === 'hold')).toBe(true);
    expect(seed.bookings.some((b) => b.checkIn > today && b.status === 'confirmed')).toBe(true);
  });

  it('always has arrivals today, including one with children', () => {
    const arrivals = seed.bookings.filter((b) => b.checkIn === today && b.status === 'confirmed');
    expect(arrivals.length).toBeGreaterThanOrEqual(2);
    expect(arrivals.some((b) => b.childAges.length > 0)).toBe(true);
  });

  it('always has departures today, with dirty rooms and turnover tasks', () => {
    const departures = seed.bookings.filter(
      (b) => b.checkOut === today && b.status === 'checked_in',
    );
    expect(departures.length).toBeGreaterThanOrEqual(1);
    for (const d of departures) {
      expect(seed.rooms.find((r) => r.id === d.roomId)?.status).toBe('dirty');
      expect(
        seed.housekeepingTasks.some((t) => t.roomId === d.roomId && t.type === 'turnover'),
      ).toBe(true);
    }
  });

  it('never double-books a room', () => {
    const active = seed.bookings.filter((b) => blocksRoom(b, now));
    for (const a of active) {
      for (const b of active) {
        if (a.id !== b.id && a.roomId === b.roomId) expect(rangesOverlap(a, b)).toBe(false);
      }
    }
  });

  it('leaves a free room for every inquiry, and a block for a group', () => {
    for (const f of buildInquiryFixtures(today)) {
      const { checkIn, checkOut, adults, childAges, rooms } = f.expected;
      if (f.expected.kind !== 'booking_request' || !checkIn || !checkOut || !adults) continue;
      const ctx = { rooms: seed.rooms, roomTypes: seed.roomTypes, bookings: seed.bookings, now };
      const kind = f.expected.wishes.apartment ? { kind: 'apartment' as const } : {};
      if ((rooms ?? 1) > 1) {
        const free = checkAvailability(
          { checkIn, checkOut, adults: 1, childAges: [], ...kind },
          ctx,
        );
        const block = planBlock(
          { adults, childAges },
          rooms,
          free.map((r) => ({ roomId: r.room.id, roomType: r.roomType })),
        );
        expect(block, f.id).not.toBeNull();
        continue;
      }
      const available = checkAvailability({ checkIn, checkOut, adults, childAges, ...kind }, ctx);
      expect(available.length, f.id).toBeGreaterThan(0);
    }
  });

  it('makes a few arrivals regulars, with notes from their earlier stays', () => {
    const regulars = seed.bookings.filter((b) => {
      if (b.status !== 'confirmed' || (b.checkIn !== today && b.checkIn !== addDays(today, 1))) {
        return false;
      }
      return seed.bookings.some(
        (e) => e.guestId === b.guestId && e.status === 'checked_out' && e.notes?.includes('.'),
      );
    });
    expect(regulars.length).toBeGreaterThanOrEqual(3);
    expect(regulars.some((b) => b.checkIn === today)).toBe(true);
    expect(seed.bookings.some((b) => b.notes?.includes('wedding anniversary'))).toBe(true);
  });

  it('never puts one guest in two rooms at once', () => {
    for (const a of seed.bookings) {
      for (const b of seed.bookings) {
        if (a.id !== b.id && a.guestId === b.guestId) expect(rangesOverlap(a, b), a.id).toBe(false);
      }
    }
  });

  it('has a large pool of distinct synthetic guests', () => {
    expect(seed.guests.length).toBeGreaterThanOrEqual(200);
    expect(new Set(seed.guests.map((g) => g.name)).size).toBe(seed.guests.length);
    expect(new Set(seed.guests.map((g) => g.email)).size).toBe(seed.guests.length);
  });

  it('stores a price snapshot that matches each booking', () => {
    for (const b of seed.bookings) {
      expect(b.priceSnapshot?.checkIn).toBe(b.checkIn);
      expect(b.priceSnapshot?.total).toBeGreaterThan(0);
    }
  });

  it('produces records that pass the shared schemas', () => {
    for (const b of seed.bookings) bookingSchema.parse(b);
    for (const g of seed.guests) guestSchema.parse(g);
    for (const r of seed.rooms) roomSchema.parse(r);
    for (const i of seed.inquiries) inquirySchema.parse(i);
  });

  it('uses only example.com email addresses', () => {
    for (const g of seed.guests) expect(g.email).toMatch(/^[a-z.]+@example\.com$/);
  });

  it('is deterministic and shifts with today', () => {
    const later = buildSeed('2027-01-10', new Date('2027-01-10T08:00:00Z'), 'cz');
    // The event weekend falls on a Friday, so how many rooms it fills depends on the weekday.
    expect(Math.abs(later.bookings.length - seed.bookings.length)).toBeLessThanOrEqual(15);
    expect(buildSeed(today, now, 'cz')).toEqual(seed);
  });
});

describe('buildSeed room statuses', () => {
  it('marks rooms for today’s arrivals as inspected unless someone also leaves today', () => {
    const departing = new Set(
      seed.bookings
        .filter((b) => b.checkOut === today && b.status === 'checked_in')
        .map((b) => b.roomId),
    );
    const arrivals = seed.bookings.filter((b) => b.checkIn === today && b.status === 'confirmed');
    for (const a of arrivals) {
      const status = seed.rooms.find((r) => r.id === a.roomId)?.status;
      expect(status).toBe(departing.has(a.roomId) ? 'dirty' : 'inspected');
    }
  });
});

describe('buildSeed for the US demo lodge', () => {
  const us = buildSeed(today, now, 'us');

  it('prices per room in dollars, with taxes added on the bill', () => {
    expect(us.pricing).toMatchObject({ currency: 'USD', pricingBasis: 'per_room' });
    expect(us.pricing.tax.mode).toBe('exclusive');
    const priced = us.bookings.find((b) => b.priceSnapshot)!;
    expect(priced.priceSnapshot).toMatchObject({ currency: 'USD' });
    expect(priced.priceSnapshot!.lines[0]!.label).toMatch(/^Room, \d+ nights?/);
    const stayed = us.bookings.find((b) => b.status === 'checked_out')!;
    const folio = buildFolio(
      stayed,
      us.charges.filter((c) => c.bookingId === stayed.id),
      us.payments.filter((p) => p.bookingId === stayed.id),
      us.pricing,
    );
    expect(folio.lines.some((l) => l.kind === 'tax')).toBe(true);
    expect(folio.balance).toBe(0);
  });

  it('is an English-speaking US lodge with multinational guests', () => {
    expect(us.hotelProfile).toMatchObject({ country: 'US', language: 'en' });
    expect(us.staff.every((s) => s.language === 'en')).toBe(true);
    expect(new Set(us.guests.map((g) => g.language))).toEqual(new Set(['cs', 'de', 'en', 'pl']));
    const authors = us.inquiries.flatMap((i) => i.messages.map((m) => m.author)).filter(Boolean);
    expect(authors.every((a) => us.staff.some((s) => s.name === a))).toBe(true);
    expect(JSON.stringify(us.hotelProfile)).not.toMatch(/CZK|Prague|Czech/);
  });
});

describe('buildSeed events', () => {
  it('dates mock events ahead of today and nearly fills the big weekend', () => {
    expect(seed.events.map((e) => e.impact)).toEqual(['high', 'medium', 'low', 'medium']);
    expect(seed.events.every((e) => e.firstNight > today && e.lastNight >= e.firstNight)).toBe(
      true,
    );
    const big = seed.events[0]!;
    const sold = new Set(
      seed.bookings
        .filter(
          (b) =>
            b.status !== 'cancelled' && b.checkIn <= big.firstNight && big.firstNight < b.checkOut,
        )
        .map((b) => b.roomId),
    );
    expect(sold.size / seed.rooms.length).toBeGreaterThanOrEqual(0.9);
  });
});
