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
  BookingPreview,
  DailyBrief,
  DayOverview,
  Guest,
  Health,
  Quote,
  RegistrationView,
  Room,
  RoomOption,
} from '@orbit/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app';

// PGlite migrates and seeds in setup hooks; with every test file running in parallel that can
// take longer than Vitest's 10 s default.
const DB_SETUP_TIMEOUT = 60_000;

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

beforeAll(() => handle.migrate(), DB_SETUP_TIMEOUT);
beforeEach(() => applySeed(handle.db, seed), DB_SETUP_TIMEOUT);
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
      body: { status: 'ok', ai: { configured: false, voice: false } },
    });
  });
});

describe('rooms and guests', () => {
  it('lists rooms and room types', async () => {
    expect((await get<Room[]>('/api/rooms')).body).toHaveLength(50);
    expect((await get<unknown[]>('/api/room-types')).body).toHaveLength(6);
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
  it('checks a guest in once registered, and logs both as user actions', async () => {
    const unregistered = await post<ApiError>(`/api/bookings/${arrival.id}/actions`, {
      action: 'check_in',
    });
    expect(unregistered.status).toBe(409);
    expect(unregistered.body.error.message).toMatch(/Register the guest/);
    const view = await get<RegistrationView>(`/api/bookings/${arrival.id}/registration`);
    expect(view.body.registration).toBeNull();
    const registered = await app.request(`/api/bookings/${arrival.id}/registration`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        nationality: 'cz',
        dateOfBirth: '1980-02-03',
        documentType: 'id_card',
        documentNumber: 'DEMO-123',
        address: '',
      }),
    });
    expect(registered.status).toBe(200);
    expect(await registered.json()).toMatchObject({ nationality: 'CZ', address: null });
    const res = await post<BookingDetail>(`/api/bookings/${arrival.id}/actions`, {
      action: 'check_in',
    });
    expect(res.status).toBe(200);
    expect(res.body.booking.status).toBe('checked_in');
    expect(res.body.allowedActions).toEqual(['check_out']);
    const log = await get<AuditLogEntry[]>(`/api/audit-log?subjectId=${arrival.id}`);
    expect(log.body.map((e) => [e.actor, e.action])).toEqual([
      ['user', 'booking.check_in'],
      ['user', 'booking.register'],
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

describe('POST /api/bookings/:id/reschedule', () => {
  it('moves a future booking two days later into a free room', async () => {
    const b = seed.bookings.find((x) => x.status === 'confirmed' && x.checkIn > today)!;
    const range = { checkIn: addDays(b.checkIn, 2), checkOut: addDays(b.checkOut, 2) };
    const target = seed.rooms.find(
      (r) =>
        fitsRoomType(
          seed.roomTypes.find((t) => t.id === r.roomTypeId)!,
          b,
          b.addons.extraBeds,
        ) && findConflicts(r.id, range, seed.bookings, now, b.id).length === 0,
    )!;
    const res = await post<BookingDetail>(`/api/bookings/${b.id}/reschedule`, {
      roomId: target.id,
      ...range,
    });
    expect(res.status).toBe(200);
    expect(res.body.booking).toMatchObject({ roomId: target.id, ...range });
  });

  it('returns 400 for a drop that changes nothing', async () => {
    const res = await post<ApiError>(`/api/bookings/${arrival.id}/reschedule`, {
      roomId: arrival.roomId,
      checkIn: arrival.checkIn,
      checkOut: arrival.checkOut,
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_input');
  });
});

describe('manual bookings', () => {
  const stay = { checkIn: '2026-11-02', checkOut: '2026-11-04', adults: 2, childAges: [] };
  const patch = <T>(path: string, body: unknown) => call<T>('PATCH', path, body);

  it('lists free rooms with prices and books one, confirmed', async () => {
    const options = await post<RoomOption[]>('/api/availability', stay);
    expect(options.status).toBe(200);
    const option = options.body[0]!;
    expect(option.quote.nights).toBe(2);
    expect(options.body.map((o) => o.quote.total)).toEqual(
      [...options.body.map((o) => o.quote.total)].sort((a, b) => a - b),
    );

    const created = await post<BookingDetail>('/api/bookings', {
      ...stay,
      roomId: option.roomId,
      guest: { name: 'Phone Guest', email: null, phone: null, language: 'cs' },
      source: 'phone',
      status: 'confirmed',
    });
    expect(created.status).toBe(201);
    expect(created.body.booking).toMatchObject({ status: 'confirmed', source: 'phone' });
    expect(created.body.booking.priceSnapshot?.total).toBe(option.quote.total);
    expect(created.body.guest.name).toBe('Phone Guest');

    const again = await post<RoomOption[]>('/api/availability', stay);
    expect(again.body.map((o) => o.roomId)).not.toContain(option.roomId);
  });

  it('quotes a stay without booking it', async () => {
    const { status, body } = await post<Quote>('/api/quote', { ...stay, roomTypeId: 'rt_double' });
    expect(status).toBe(200);
    expect(body.lines.length).toBeGreaterThan(0);
  });

  it('previews and saves an edit to party, add-ons and notes', async () => {
    const body = {
      adults: 1,
      notes: 'Arrives late',
      addons: { wellness: true, dogs: 0, extraBeds: 0 },
    };
    const preview = await post<BookingPreview>(`/api/bookings/${arrival.id}/preview`, body);
    expect(preview.body.booking).toMatchObject({ adults: 1, notes: 'Arrives late' });
    expect((await get<BookingDetail>(`/api/bookings/${arrival.id}`)).body.booking.notes).not.toBe(
      'Arrives late',
    );

    const saved = await patch<BookingDetail>(`/api/bookings/${arrival.id}`, body);
    expect(saved.status).toBe(200);
    expect(saved.body.booking).toMatchObject({ adults: 1, notes: 'Arrives late' });
    expect(saved.body.booking.priceSnapshot?.lines.map((l) => l.kind)).toContain('wellness');
  });

  it('rejects an edit the room cannot take', async () => {
    const { status, body } = await patch<ApiError>(`/api/bookings/${arrival.id}`, { adults: 9 });
    expect(status).toBe(422);
    expect(body.error.code).toBe('over_capacity');
  });
});

describe('guest records', () => {
  it('creates and edits a guest', async () => {
    const created = await post<Guest>('/api/guests', {
      name: 'Walk-in Guest',
      email: '',
      language: 'en',
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: 'Walk-in Guest', email: null });
    const edited = await call<Guest>('PATCH', `/api/guests/${created.body.id}`, {
      phone: '+420 000 000 000',
    });
    expect(edited.body.phone).toBe('+420 000 000 000');
  });

  it('refuses an email another guest has', async () => {
    const taken = seed.guests.find((g) => g.email)!;
    const { status } = await post('/api/guests', {
      name: 'Copy',
      email: taken.email!.toUpperCase(),
      language: 'en',
    });
    expect(status).toBe(409);
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

describe('GET /api/brief', () => {
  it('sums up today from the seed', async () => {
    const { status, body } = await get<DailyBrief>('/api/brief');
    expect(status).toBe(200);
    expect(body.date).toBe(today);
    expect(body.arrivals).toBeGreaterThan(0);
    expect(body.occupancy.total).toBe(seed.rooms.length);
    expect(body.unansweredMessages).toBe(seed.inquiries.length);
    expect(body.maintenance.map((t) => t.roomName)).toContain('203');
  });

  it('rejects an invalid date', async () => {
    expect((await get('/api/brief?date=tomorrow')).status).toBe(400);
  });
});

it('returns JSON 404 for unknown routes', async () => {
  expect((await get<ApiError>('/api/nothing')).body.error.code).toBe('not_found');
});
