import { pricingConfig } from '@orbit/domain';
import { applySeed, buildSeed, createDb, createRepositories } from '@orbit/db';
import type { ApiError, Booking, Guest, Health, Room } from '@orbit/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app';

const handle = createDb('memory://');
const seed = buildSeed('2026-10-27', new Date('2026-10-27T08:00:00Z'), pricingConfig);
const app = createApp({ repos: createRepositories(handle.db), aiConfigured: false });

beforeAll(async () => {
  await handle.migrate();
  await applySeed(handle.db, seed);
});

afterAll(() => handle.close());

async function get<T>(path: string): Promise<{ status: number; body: T }> {
  const res = await app.request(path);
  return { status: res.status, body: (await res.json()) as T };
}

describe('GET /health', () => {
  it('reports ok and whether AI is configured', async () => {
    expect(await get<Health>('/health')).toEqual({
      status: 200,
      body: { status: 'ok', ai: { configured: false } },
    });
  });
});

describe('rooms', () => {
  it('lists rooms and room types', async () => {
    expect((await get<Room[]>('/api/rooms')).body).toHaveLength(12);
    expect((await get<unknown[]>('/api/room-types')).body).toHaveLength(3);
  });

  it('returns 404 for an unknown room', async () => {
    const res = await get<ApiError>('/api/rooms/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('not_found');
  });
});

describe('bookings', () => {
  it('lists all bookings', async () => {
    expect((await get<Booking[]>('/api/bookings')).body).toHaveLength(seed.bookings.length);
  });

  it('filters by date range and status', async () => {
    const { body } = await get<Booking[]>(
      '/api/bookings?from=2026-10-27&to=2026-10-28&status=confirmed,checked_in',
    );
    expect(body.length).toBeGreaterThan(0);
    for (const b of body) {
      expect(['confirmed', 'checked_in']).toContain(b.status);
      expect(b.checkIn <= '2026-10-27' && b.checkOut > '2026-10-27').toBe(true);
    }
  });

  it('rejects an invalid query', async () => {
    expect((await get('/api/bookings?from=27.10.2026')).status).toBe(400);
    expect((await get('/api/bookings?status=pending')).status).toBe(400);
  });

  it('gets one booking with its price snapshot', async () => {
    const first = seed.bookings[0]!;
    const { body } = await get<Booking>(`/api/bookings/${first.id}`);
    expect(body).toEqual(first);
    expect(body.priceSnapshot?.lines.length).toBeGreaterThan(0);
  });
});

describe('guests', () => {
  it('lists and gets guests', async () => {
    expect((await get<Guest[]>('/api/guests')).body).toHaveLength(seed.guests.length);
    const g = seed.guests[0]!;
    expect((await get<Guest>(`/api/guests/${g.id}`)).body).toEqual(g);
    expect((await get('/api/guests/nope')).status).toBe(404);
  });
});

it('returns JSON 404 for unknown routes', async () => {
  expect((await get<ApiError>('/api/nothing')).body.error.code).toBe('not_found');
});
