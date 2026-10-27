import { amountsInText } from '@orbit/ai';
import { buildInquiryFixtures, evalRoomNames } from '@orbit/ai/evals';
import {
  assertValidProfile,
  blocksRoom,
  checkAvailability,
  pricingConfig,
  rangesOverlap,
} from '@orbit/domain';
import {
  bookingSchema,
  guestSchema,
  hotelProfileSchema,
  inquirySchema,
  roomSchema,
} from '@orbit/shared';
import { describe, expect, it } from 'vitest';
import { buildSeed } from './build';

const today = '2026-10-27';
const now = new Date('2026-10-27T08:00:00Z');
const seed = buildSeed(today, now, pricingConfig);

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
    for (const category of ['policy', 'amenity', 'info']) {
      expect(seed.hotelProfile.entries.some((e) => e.category === category)).toBe(true);
    }
    // Prices come from quote(); an amount here would bypass the draft price guard.
    expect(amountsInText(JSON.stringify(seed.hotelProfile))).toEqual([]);
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

  it('has a few hundred bookings in the past, present and future', () => {
    expect(seed.bookings.length).toBeGreaterThanOrEqual(300);
    expect(seed.bookings.length).toBeLessThanOrEqual(600);
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

  it('leaves a free room for every inquiry', () => {
    for (const f of buildInquiryFixtures(today)) {
      const { checkIn, checkOut, adults } = f.expected;
      if (f.expected.kind !== 'booking_request' || !checkIn || !checkOut || !adults) continue;
      const available = checkAvailability(
        {
          checkIn,
          checkOut,
          adults,
          childAges: f.expected.childAges,
          ...(f.expected.wishes.apartment ? { kind: 'apartment' as const } : {}),
        },
        { rooms: seed.rooms, roomTypes: seed.roomTypes, bookings: seed.bookings, now },
      );
      expect(available.length, f.id).toBeGreaterThan(0);
    }
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
    const later = buildSeed('2027-01-10', new Date('2027-01-10T08:00:00Z'), pricingConfig);
    expect(later.bookings.length).toBe(seed.bookings.length);
    expect(buildSeed(today, now, pricingConfig)).toEqual(seed);
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
