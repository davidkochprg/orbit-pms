import { applySeed, buildSeed, createDb, createRepositories, createUsageStore } from '@orbit/db';
import type { Booking, KnockOn } from '@orbit/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app';

// PGlite migrates and seeds in setup hooks; with every test file running in parallel that can
// take longer than Vitest's 10 s default.
const DB_SETUP_TIMEOUT = 60_000;

const today = '2026-10-27';
const now = new Date('2026-10-27T08:00:00Z');
const handle = createDb('memory://');
const seed = buildSeed(today, now, 'cz');
const repos = createRepositories(handle.db);
const app = createApp({ repos, ai: null, usage: createUsageStore(handle.db), clock: () => now });

async function call<T>(method: string, path: string, body?: unknown) {
  const res = await app.request(path, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
  return { status: res.status, body: (await res.json()) as T };
}

beforeAll(() => handle.migrate(), DB_SETUP_TIMEOUT);
beforeEach(() => applySeed(handle.db, seed), DB_SETUP_TIMEOUT);
afterAll(() => handle.close());

describe('knock-ons', () => {
  it('offers to move the stays out of a room that goes out of order, and moves them', async () => {
    // A confirmed stay arriving later this week, in a room that is in service.
    const stay = seed.bookings.find(
      (b) =>
        b.status === 'confirmed' &&
        b.checkIn > today &&
        b.checkIn < '2026-11-03' &&
        seed.rooms.find((r) => r.id === b.roomId)?.status !== 'out_of_order',
    )!;
    const before = await call<KnockOn[]>('GET', '/api/knock-ons');
    expect(before.body.some((k) => k.kind === 'relocate' && k.roomId === stay.roomId)).toBe(false);

    await call('POST', `/api/rooms/${stay.roomId}/status`, { status: 'out_of_order' });
    const { body } = await call<KnockOn[]>('GET', '/api/knock-ons');
    const knockOn = body.find((k) => k.kind === 'relocate' && k.roomId === stay.roomId);
    expect(knockOn).toBeDefined();
    const move = knockOn!.kind === 'relocate' ? knockOn!.moves : [];
    const ours = move.find((m) => m.bookingId === stay.id)!;
    expect(ours.toRoomId).not.toBeNull();

    const moved = await call<Booking[]>('POST', '/api/knock-ons/relocate', {
      moves: [{ bookingId: stay.id, roomId: ours.toRoomId }],
    });
    expect(moved.status).toBe(200);
    expect(moved.body[0]).toMatchObject({ id: stay.id, roomId: ours.toRoomId });
  });

  it('refuses an empty move list', async () => {
    expect((await call('POST', '/api/knock-ons/relocate', { moves: [] })).status).toBe(400);
  });
});
