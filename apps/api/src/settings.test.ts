import { pricingConfig } from '@orbit/domain';
import { applySeed, buildSeed, createDb, createRepositories, createUsageStore } from '@orbit/db';
import type {
  ApiError,
  AuditLogEntry,
  HotelProfile,
  PricingConfig,
  Quote,
  Room,
  RoomType,
  StaffMember,
} from '@orbit/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app';

// PGlite migrates and seeds in setup hooks; with every test file running in parallel that can
// take longer than Vitest's 10 s default.
const DB_SETUP_TIMEOUT = 60_000;

const now = new Date('2026-10-27T08:00:00Z');
const handle = createDb('memory://');
const seed = buildSeed('2026-10-27', now, pricingConfig);
const app = createApp({
  repos: createRepositories(handle.db),
  ai: null,
  usage: createUsageStore(handle.db),
  clock: () => now,
});

beforeAll(() => handle.migrate(), DB_SETUP_TIMEOUT);
beforeEach(() => applySeed(handle.db, seed), DB_SETUP_TIMEOUT);
afterAll(() => handle.close());

const manager = seed.staff.find((s) => s.active && s.role === 'manager')!;
const receptionist = seed.staff.find((s) => s.active && s.role === 'receptionist')!;
const former = seed.staff.find((s) => !s.active)!;

async function call<T>(method: string, path: string, body?: unknown, staffId?: string) {
  const res = await app.request(path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(staffId && { 'x-staff-id': staffId }),
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
  return { status: res.status, body: (await res.json()) as T };
}

describe('hotel profile', () => {
  it('returns the seeded profile', async () => {
    const { status, body } = await call<HotelProfile>('GET', '/api/settings/profile');
    expect(status).toBe(200);
    expect(body).toEqual(seed.hotelProfile);
  });

  it('lets a manager save it and records who did', async () => {
    const updated = { ...seed.hotelProfile, name: 'Renamed Lodge', phone: '' };
    const { status, body } = await call<HotelProfile>(
      'PUT',
      '/api/settings/profile',
      updated,
      manager.id,
    );
    expect(status).toBe(200);
    expect(body).toMatchObject({ name: 'Renamed Lodge', phone: null });
    expect((await call<HotelProfile>('GET', '/api/settings/profile')).body.name).toBe(
      'Renamed Lodge',
    );
    const audit = await call<AuditLogEntry[]>('GET', '/api/audit-log?limit=1');
    expect(audit.body[0]).toMatchObject({
      action: 'settings.profile',
      payload: { by: manager.id, changed: ['name'] },
    });
  });

  it('refuses everyone else with 403', async () => {
    const updated = { ...seed.hotelProfile, name: 'Hijacked' };
    for (const staffId of [receptionist.id, former.id, undefined]) {
      const { status, body } = await call<ApiError>(
        'PUT',
        '/api/settings/profile',
        updated,
        staffId,
      );
      expect(status).toBe(403);
      expect(body.error.code).toBe('forbidden');
    }
  });

  it('validates the body and the profile rules', async () => {
    const badTime = await call<ApiError>(
      'PUT',
      '/api/settings/profile',
      { ...seed.hotelProfile, checkInFrom: '3pm' },
      manager.id,
    );
    expect(badTime.status).toBe(400);
    const lateCheckout = await call<ApiError>(
      'PUT',
      '/api/settings/profile',
      { ...seed.hotelProfile, checkOutBy: '16:00' },
      manager.id,
    );
    expect(lateCheckout).toMatchObject({ status: 400, body: { error: { code: 'invalid_input' } } });
  });
});

describe('staff', () => {
  it('lists the team, active members first', async () => {
    const { body } = await call<StaffMember[]>('GET', '/api/staff');
    expect(body).toHaveLength(seed.staff.length);
    expect(body.at(-1)).toEqual(former);
  });

  it('lets a manager add and change members', async () => {
    const created = await call<StaffMember>(
      'POST',
      '/api/staff',
      { name: 'New Housekeeper', email: 'new.hk@example.com', role: 'housekeeping' },
      manager.id,
    );
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: 'New Housekeeper', active: true });

    const changed = await call<StaffMember>(
      'PATCH',
      `/api/staff/${created.body.id}`,
      { role: 'receptionist', active: false },
      manager.id,
    );
    expect(changed).toMatchObject({ status: 200, body: { role: 'receptionist', active: false } });
  });

  it('refuses non-managers, duplicate emails and removing the last manager', async () => {
    expect(
      (await call('POST', '/api/staff', { name: 'X', role: 'manager' }, receptionist.id)).status,
    ).toBe(403);
    expect(
      (
        await call(
          'POST',
          '/api/staff',
          { name: 'Copy', email: receptionist.email, role: 'receptionist' },
          manager.id,
        )
      ).status,
    ).toBe(409);
    const { status, body } = await call<ApiError>(
      'PATCH',
      `/api/staff/${manager.id}`,
      { role: 'receptionist' },
      manager.id,
    );
    expect(status).toBe(400);
    expect(body.error.message).toMatch(/at least one active manager/);
  });
});

describe('rates', () => {
  it('returns the seeded rates', async () => {
    const { status, body } = await call<PricingConfig>('GET', '/api/settings/pricing');
    expect(status).toBe(200);
    expect(body).toEqual(seed.pricing);
  });

  it('prices new quotes with rates a manager saved', async () => {
    const stay = {
      roomTypeId: 'rt_apartment',
      checkIn: '2026-11-10',
      checkOut: '2026-11-12',
      adults: 2,
      childAges: [],
      addons: { wellness: false, dogs: 1, extraBeds: 0 },
    };
    const before = await call<Quote>('POST', '/api/quote', stay);
    const updated = { ...seed.pricing, dog: { perNight: seed.pricing.dog.perNight + 50 } };
    const saved = await call<PricingConfig>('PUT', '/api/settings/pricing', updated, manager.id);
    expect(saved.status).toBe(200);
    const after = await call<Quote>('POST', '/api/quote', stay);
    expect(after.body.total - before.body.total).toBe(100);
  });

  it('rejects invalid rates with 400 and refuses non-managers with 403', async () => {
    const bad = {
      ...seed.pricing,
      seasons: [{ name: 'x', from: '02-30', to: '03-01', multiplier: 1 }],
    };
    expect((await call('PUT', '/api/settings/pricing', bad, manager.id)).status).toBe(400);
    expect((await call('PUT', '/api/settings/pricing', seed.pricing, receptionist.id)).status).toBe(
      403,
    );
  });
});

describe('room types and rooms', () => {
  const typeBody = {
    name: 'Loft',
    maxAdults: 2,
    maxChildren: 0,
    basePrice: 1800,
    description: 'Synthetic test type.',
  };

  it('lets a manager add a room type and a room in it', async () => {
    const type = await call<RoomType>('POST', '/api/room-types', typeBody, manager.id);
    expect(type.status).toBe(201);
    const room = await call<Room>(
      'POST',
      '/api/rooms',
      { name: 'L1', roomTypeId: type.body.id, kind: 'room', floor: 5 },
      manager.id,
    );
    expect(room.status).toBe(201);
    expect(room.body).toMatchObject({ name: 'L1', status: 'clean' });
    const rooms = await call<Room[]>('GET', '/api/rooms');
    expect(rooms.body.map((r) => r.name)).toContain('L1');
  });

  it('edits a room type and a room', async () => {
    const type = await call<RoomType>(
      'PUT',
      '/api/room-types/rt_double',
      { ...typeBody, name: 'Double room' },
      manager.id,
    );
    expect(type.body).toMatchObject({ id: 'rt_double', basePrice: 1800 });
    const room = await call<Room>(
      'PUT',
      '/api/rooms/rm_101',
      { name: '101', roomTypeId: 'rt_family', kind: 'room', floor: 1 },
      manager.id,
    );
    expect(room.body.roomTypeId).toBe('rt_family');
  });

  it('answers 409 for a taken room name and 403 for non-managers', async () => {
    const body = { name: '102', roomTypeId: 'rt_double', kind: 'room', floor: 1 };
    expect((await call('POST', '/api/rooms', body, manager.id)).status).toBe(409);
    expect(
      (await call('POST', '/api/rooms', { ...body, name: 'Z9' }, receptionist.id)).status,
    ).toBe(403);
    expect((await call('POST', '/api/room-types', typeBody)).status).toBe(403);
  });
});
