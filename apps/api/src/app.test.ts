import {
  addDays,
  blocksRoom,
  findConflicts,
  fitsRoomType,
  pricingConfig,
  rangesOverlap,
} from '@orbit/domain';
import { applySeed, buildSeed, createDb, createRepositories, createUsageStore } from '@orbit/db';
import type {
  ApiError,
  AuditLogEntry,
  Booking,
  BookingDetail,
  DayOverview,
  Guest,
  Health,
  Room,
} from '@orbit/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app';

const today = '2026-10-27';
const now = new Date('2026-10-27T08:00:00Z');
const handle = createDb('memory://');
const seed = buildSeed(today, now, pricingConfig);
const app = createApp({
  repos: createRepositories(handle.db),
  ai: null,
  usage: createUsageStore(handle.db),
  clock: () => now,
});

beforeAll(() => handle.migrate());
beforeEach(() => applySeed(handle.db, seed));
afterAll(() => handle.close());

async function call<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: T }> {
  const res = await app.request(path, {
    method,
    ...(body !== undefined && {
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  });
  return { status: res.status, body: (await res.json()) as T };
}
const get = <T>(path: string) => call<T>('GET', path);
const post = <T>(path: string, body: unknown) => call<T>('POST', path, body);

const arrival = seed.bookings.find((b) => b.checkIn === today && b.status === 'confirmed')!;
const departure = seed.bookings.find((b) => b.checkOut === today && b.status === 'checked_in')!;
const hold = seed.bookings.find((b) => b.status === 'hold')!;

describe('GET /health', () => {
  it('reports ok and whether AI is configured', async () => {
    expect(await get<Health>('/health')).toEqual({
      status: 200,
      body: { status: 'ok', ai: { configured: false } },
    });
  });
});

describe('rooms and guests', () => {
  it('lists rooms and room types', async () => {
    expect((await get<Room[]>('/api/rooms')).body).toHaveLength(12);
    expect((await get<unknown[]>('/api/room-types')).body).toHaveLength(3);
    expect((await get<ApiError>('/api/rooms/nope')).status).toBe(404);
  });

  it('lists and gets guests', async () => {
    expect((await get<Guest[]>('/api/guests')).body).toHaveLength(seed.guests.length);
    const g = seed.guests[0]!;
    expect((await get<Guest>(`/api/guests/${g.id}`)).body).toEqual(g);
    expect((await get('/api/guests/nope')).status).toBe(404);
  });
});

describe('GET /api/bookings', () => {
  it('lists all bookings', async () => {
    expect((await get<Booking[]>('/api/bookings')).body).toHaveLength(seed.bookings.length);
  });

  it('filters by date range and status', async () => {
    const { body } = await get<Booking[]>(
      `/api/bookings?from=${today}&to=2026-10-28&status=confirmed,checked_in`,
    );
    expect(body.length).toBeGreaterThan(0);
    for (const b of body) {
      expect(['confirmed', 'checked_in']).toContain(b.status);
      expect(b.checkIn <= today && b.checkOut > today).toBe(true);
    }
  });

  it('rejects an invalid query', async () => {
    const res = await get<ApiError>('/api/bookings?from=27.10.2026');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_query');
    expect((await get('/api/bookings?status=pending')).status).toBe(400);
  });
});

describe('GET /api/bookings/:id', () => {
  it('returns the booking with guest, room and allowed actions', async () => {
    const { body } = await get<BookingDetail>(`/api/bookings/${arrival.id}`);
    expect(body.booking).toEqual(arrival);
    expect(body.guest.id).toBe(arrival.guestId);
    expect(body.room.id).toBe(arrival.roomId);
    expect(body.allowedActions).toEqual(['check_in', 'cancel']);
  });

  it('returns 404 for an unknown booking', async () => {
    const res = await get<ApiError>('/api/bookings/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('not_found');
  });
});

describe('POST /api/bookings/:id/actions', () => {
  it('checks a guest in and logs it as a user action', async () => {
    const res = await post<BookingDetail>(`/api/bookings/${arrival.id}/actions`, {
      action: 'check_in',
    });
    expect(res.status).toBe(200);
    expect(res.body.booking.status).toBe('checked_in');
    expect(res.body.allowedActions).toEqual(['check_out']);
    const log = await get<AuditLogEntry[]>(`/api/audit-log?subjectId=${arrival.id}`);
    expect(log.body).toEqual([
      expect.objectContaining({ actor: 'user', action: 'booking.check_in', subjectId: arrival.id }),
    ]);
  });

  it('checks a guest out and marks the room dirty', async () => {
    await post(`/api/bookings/${departure.id}/actions`, { action: 'check_out' });
    expect((await get<Room>(`/api/rooms/${departure.roomId}`)).body.status).toBe('dirty');
  });

  it('confirms a hold', async () => {
    const res = await post<BookingDetail>(`/api/bookings/${hold.id}/actions`, {
      action: 'confirm',
    });
    expect(res.body.booking).toMatchObject({ status: 'confirmed', holdExpiresAt: null });
  });

  it('returns 409 for a transition that is not allowed', async () => {
    const res = await post<ApiError>(`/api/bookings/${departure.id}/actions`, { action: 'cancel' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('invalid_transition');
  });

  it('returns 400 for an unknown action or malformed JSON', async () => {
    const unknown = await post<ApiError>(`/api/bookings/${arrival.id}/actions`, {
      action: 'teleport',
    });
    expect(unknown.status).toBe(400);
    expect(unknown.body.error.code).toBe('invalid_json');
    expect((await post(`/api/bookings/${arrival.id}/actions`, '{not json')).status).toBe(400);
  });
});

describe('POST /api/bookings/:id/move', () => {
  const blocking = seed.bookings.filter((b) => blocksRoom(b, now) && b.status !== 'checked_in');
  const rooms = new Map(seed.rooms.map((r) => [r.id, r]));
  const types = new Map(seed.roomTypes.map((t) => [t.id, t]));
  const fits = (b: Booking, roomId: string) =>
    fitsRoomType(types.get(rooms.get(roomId)!.roomTypeId)!, b, b.addons.extraBeds);

  it('moves a booking to a free room and keeps the agreed price', async () => {
    const [b, target] = blocking.flatMap((b) =>
      seed.rooms
        .filter((r) => r.id !== b.roomId && fits(b, r.id))
        .filter((r) => findConflicts(r.id, b, seed.bookings, now).length === 0)
        .map((r) => [b, r] as const),
    )[0]!;
    const res = await post<BookingDetail>(`/api/bookings/${b.id}/move`, { roomId: target.id });
    expect(res.status).toBe(200);
    expect(res.body.booking.roomId).toBe(target.id);
    expect(res.body.booking.priceSnapshot).toEqual(b.priceSnapshot);
  });

  it('returns 409 when the target room is taken', async () => {
    const [b, other] = blocking.flatMap((b) =>
      seed.bookings
        .filter(
          (o) =>
            o.roomId !== b.roomId && blocksRoom(o, now) && rangesOverlap(o, b) && fits(b, o.roomId),
        )
        .map((o) => [b, o] as const),
    )[0]!;
    const res = await post<ApiError>(`/api/bookings/${b.id}/move`, { roomId: other.roomId });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('conflict');
  });

  it('returns 404 for an unknown room', async () => {
    expect((await post(`/api/bookings/${arrival.id}/move`, { roomId: 'nope' })).status).toBe(404);
  });
});

describe('POST /api/bookings/:id/dates', () => {
  it('extends a stay by one night and re-prices it', async () => {
    const b = seed.bookings.find(
      (b) =>
        b.status === 'confirmed' &&
        findConflicts(
          b.roomId,
          { checkIn: b.checkOut, checkOut: addDays(b.checkOut, 1) },
          seed.bookings,
          now,
        ).length === 0,
    )!;
    const res = await post<BookingDetail>(`/api/bookings/${b.id}/dates`, {
      checkIn: b.checkIn,
      checkOut: addDays(b.checkOut, 1),
    });
    expect(res.status).toBe(200);
    expect(res.body.booking.priceSnapshot?.nights).toBe(b.priceSnapshot!.nights + 1);
    expect(res.body.booking.priceSnapshot!.total).toBeGreaterThan(b.priceSnapshot!.total);
  });

  it('returns 400 for a zero-night range', async () => {
    const res = await post<ApiError>(`/api/bookings/${arrival.id}/dates`, {
      checkIn: arrival.checkIn,
      checkOut: arrival.checkIn,
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_date_range');
  });
});

describe('GET /api/day', () => {
  it('returns today’s arrivals, departures and in-house guests with names', async () => {
    const { body } = await get<DayOverview>('/api/day');
    expect(body.date).toBe(today);
    expect(body.arrivals.map((s) => s.booking.id)).toContain(arrival.id);
    expect(body.departures.map((s) => s.booking.id)).toContain(departure.id);
    expect(body.arrivals[0]?.guestName).toBeTruthy();
    expect(body.arrivals[0]?.roomName).toBeTruthy();
  });

  it('accepts another date', async () => {
    expect((await get<DayOverview>('/api/day?date=2026-11-01')).body.date).toBe('2026-11-01');
    expect((await get('/api/day?date=tomorrow')).status).toBe(400);
  });
});

it('returns JSON 404 for unknown routes', async () => {
  expect((await get<ApiError>('/api/nothing')).body.error.code).toBe('not_found');
});
