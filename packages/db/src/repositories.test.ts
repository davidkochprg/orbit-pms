import { pricingConfig } from '@orbit/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb } from './client';
import { createRepositories } from './repositories';
import { applySeed, buildSeed } from './seed';

// PGlite migrates and seeds in setup hooks; with every test file running in parallel that can
// take longer than Vitest's 10 s default.
const DB_SETUP_TIMEOUT = 60_000;

const handle = createDb('memory://');
const repos = createRepositories(handle.db);
const seed = buildSeed('2026-10-27', new Date('2026-10-27T08:00:00Z'), pricingConfig);

beforeAll(async () => {
  await handle.migrate();
  await applySeed(handle.db, seed);
}, DB_SETUP_TIMEOUT);

afterAll(() => handle.close());

describe('repositories (PGlite)', () => {
  it('round-trips rooms and room types', async () => {
    expect(await repos.rooms.listRooms()).toHaveLength(50);
    expect(await repos.rooms.listRoomTypes()).toHaveLength(6);
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

describe('repository writes (PGlite)', () => {
  it('updates a booking in place', async () => {
    const original = seed.bookings.find((b) => b.status === 'hold')!;
    const updated = {
      ...original,
      status: 'confirmed' as const,
      holdExpiresAt: null,
      notes: 'Confirmed by phone',
    };
    await repos.bookings.updateBooking(updated);
    expect(await repos.bookings.getBooking(original.id)).toEqual(updated);
    await repos.bookings.updateBooking(original);
    expect(await repos.bookings.getBooking(original.id)).toEqual(original);
  });

  it('sets room status', async () => {
    await repos.rooms.setRoomStatus('rm_101', 'out_of_order');
    expect((await repos.rooms.getRoom('rm_101'))?.status).toBe('out_of_order');
    await repos.rooms.setRoomStatus('rm_101', 'clean');
  });

  it('appends and lists audit entries newest first, filtered by subject', async () => {
    const a = await repos.audit.append({
      actor: 'user',
      action: 'test.a',
      subjectId: 'bk_x',
      payload: { n: 1 },
    });
    const b = await repos.audit.append({
      actor: 'agent',
      action: 'test.b',
      subjectId: 'bk_x',
      payload: null,
    });
    await repos.audit.append({ actor: 'user', action: 'test.c', subjectId: 'bk_y', payload: {} });
    expect(a.createdAt).toMatch(/Z$/);
    const forX = await repos.audit.list({ subjectId: 'bk_x' });
    expect(forX.map((e) => e.action)).toEqual([b.action, a.action]);
    expect(forX[1]?.payload).toEqual({ n: 1 });
    expect(await repos.audit.list({ limit: 1 })).toHaveLength(1);
  });

  it('rolls back a transaction that throws', async () => {
    const original = seed.bookings[0]!;
    await expect(
      repos.transaction(async (tx) => {
        await tx.bookings.updateBooking({ ...original, notes: 'should not stick' });
        await tx.audit.append({
          actor: 'user',
          action: 'test.rollback',
          subjectId: original.id,
          payload: {},
        });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect((await repos.bookings.getBooking(original.id))?.notes).toBe(original.notes);
    expect(await repos.audit.list({ subjectId: original.id })).toEqual([]);
  });
});

describe('creating records (PGlite)', () => {
  it('creates a guest and a booking', async () => {
    const guest = {
      id: 'gst_new',
      name: 'New Guest',
      email: null,
      phone: null,
      language: 'en' as const,
      notes: null,
    };
    await repos.guests.createGuest(guest);
    expect(await repos.guests.getGuest('gst_new')).toEqual(guest);
    const booking = {
      ...seed.bookings[0]!,
      id: 'bk_new',
      guestId: 'gst_new',
      status: 'hold' as const,
      holdExpiresAt: '2026-10-29T08:00:00.000Z',
    };
    await repos.bookings.createBooking(booking);
    expect(await repos.bookings.getBooking('bk_new')).toEqual(booking);
  });

  it('round-trips pending actions', async () => {
    const action = {
      id: 'act_1',
      kind: 'move_booking' as const,
      input: { bookingId: seed.bookings[0]!.id, roomId: 'rm_201' },
      summary: 'Move someone',
      status: 'pending' as const,
      bookingId: seed.bookings[0]!.id,
      error: null,
      createdAt: '2026-10-27T08:00:00.000Z',
      resolvedAt: null,
    };
    await repos.pendingActions.create(action);
    expect(await repos.pendingActions.get('act_1')).toEqual(action);
    const resolved = {
      ...action,
      status: 'failed' as const,
      error: 'Room taken',
      resolvedAt: '2026-10-27T08:05:00.000Z',
    };
    await repos.pendingActions.update(resolved);
    expect(await repos.pendingActions.get('act_1')).toEqual(resolved);
    expect(await repos.pendingActions.get('nope')).toBeNull();
  });
});

describe('housekeeping tasks (PGlite)', () => {
  it('lists seeded tasks oldest first and filters by room and status', async () => {
    const all = await repos.housekeeping.listTasks();
    expect(all).toEqual(
      [...seed.housekeepingTasks].sort(
        (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
      ),
    );
    const maintenance = await repos.housekeeping.listTasks({ roomId: 'rm_203' });
    expect(maintenance.map((t) => t.type)).toContain('maintenance');
    expect(await repos.housekeeping.listTasks({ status: ['done'] })).toEqual([]);
  });

  it('creates, reads and updates a task', async () => {
    const task = {
      id: 'hk_test',
      roomId: 'rm_101',
      type: 'maintenance' as const,
      status: 'open' as const,
      notes: 'Lamp broken',
      createdAt: '2026-10-27T09:00:00.000Z',
    };
    await repos.housekeeping.createTask(task);
    expect(await repos.housekeeping.getTask('hk_test')).toEqual(task);
    await repos.housekeeping.updateTask({ ...task, status: 'done' });
    expect((await repos.housekeeping.getTask('hk_test'))?.status).toBe('done');
    expect(await repos.housekeeping.getTask('nope')).toBeNull();
  });
});
