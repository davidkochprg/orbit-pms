import { pricingConfig } from '@orbit/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb } from './client';
import { createRepositories } from './repositories';
import { applySeed, buildSeed } from './seed';

const handle = createDb('memory://');
const repos = createRepositories(handle.db);
const seed = buildSeed('2026-10-27', new Date('2026-10-27T08:00:00Z'), pricingConfig);

beforeAll(async () => {
  await handle.migrate();
  await applySeed(handle.db, seed);
});

afterAll(() => handle.close());

describe('repositories (PGlite)', () => {
  it('round-trips rooms and room types', async () => {
    expect(await repos.rooms.listRooms()).toHaveLength(12);
    expect(await repos.rooms.listRoomTypes()).toHaveLength(3);
    expect(await repos.rooms.getRoom('rm_a1')).toMatchObject({ name: 'A1', kind: 'apartment' });
    expect(await repos.rooms.getRoom('nope')).toBeNull();
  });

  it('round-trips bookings exactly', async () => {
    const all = await repos.bookings.listBookings();
    expect(all).toHaveLength(seed.bookings.length);
    const first = seed.bookings[0];
    expect(first).toBeDefined();
    expect(await repos.bookings.getBooking(first!.id)).toEqual(first);
  });

  it('filters bookings by overlapping date range', async () => {
    const inHouse = await repos.bookings.listBookings({ from: '2026-10-27', to: '2026-10-28' });
    expect(inHouse.length).toBeGreaterThan(0);
    for (const b of inHouse) {
      expect(b.checkIn <= '2026-10-27' && b.checkOut > '2026-10-27').toBe(true);
    }
  });

  it('filters bookings by status and guest', async () => {
    const holds = await repos.bookings.listBookings({ status: ['hold'] });
    expect(holds.every((b) => b.status === 'hold')).toBe(true);
    const guestId = seed.bookings[0]!.guestId;
    const history = await repos.bookings.listBookings({ guestId });
    expect(history.every((b) => b.guestId === guestId)).toBe(true);
  });

  it('round-trips guests', async () => {
    const guests = await repos.guests.listGuests();
    expect(guests).toHaveLength(seed.guests.length);
    expect(await repos.guests.getGuest(seed.guests[0]!.id)).toEqual(seed.guests[0]);
  });

  it('can be reseeded in place', async () => {
    await applySeed(handle.db, seed);
    expect(await repos.bookings.listBookings()).toHaveLength(seed.bookings.length);
  });
});
