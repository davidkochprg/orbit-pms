import { addDays, pricingConfig } from '@orbit/domain';
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

  it('locks a room inside a transaction', async () => {
    const rooms = await repos.transaction(async (tx) => {
      await tx.rooms.lockRoom('rm_a1');
      return tx.rooms.listRooms();
    });
    expect(rooms).toHaveLength(50);
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

    // Only a pending action can be resolved this way, so a second click loses.
    const pending = { ...action, id: 'act_2' };
    await repos.pendingActions.create(pending);
    const confirmed = { ...pending, status: 'confirmed' as const, resolvedAt: resolved.resolvedAt };
    expect(await repos.pendingActions.resolveIfPending(confirmed)).toBe(true);
    expect(await repos.pendingActions.resolveIfPending({ ...confirmed, status: 'rejected' })).toBe(
      false,
    );
    expect(await repos.pendingActions.get('act_2')).toEqual(confirmed);
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

describe('hotel profile (PGlite)', () => {
  it('reads the seeded profile and replaces it on save', async () => {
    expect(await repos.settings.getProfile()).toEqual(seed.hotelProfile);
    const updated = { ...seed.hotelProfile, name: 'Renamed Lodge', entries: [] };
    await repos.settings.saveProfile(updated);
    expect(await repos.settings.getProfile()).toEqual(updated);
    await repos.settings.saveProfile(seed.hotelProfile);
  });
});

describe('pricing (PGlite)', () => {
  it('reads the seeded rates and replaces them on save', async () => {
    expect(await repos.settings.getPricing()).toEqual(seed.pricing);
    const updated = { ...seed.pricing, dog: { perNight: 321 }, seasons: [] };
    await repos.settings.savePricing(updated);
    expect(await repos.settings.getPricing()).toEqual(updated);
    await repos.settings.savePricing(seed.pricing);
  });
});

describe('room setup (PGlite)', () => {
  it('creates and replaces room types and rooms', async () => {
    const roomType = {
      id: 'rt_test',
      name: 'Test loft',
      maxAdults: 2,
      maxChildren: 0,
      basePrice: 1500,
      description: 'Synthetic test type.',
    };
    await repos.rooms.createRoomType(roomType);
    await repos.rooms.updateRoomType({ ...roomType, basePrice: 1600 });
    expect(await repos.rooms.listRoomTypes()).toContainEqual({ ...roomType, basePrice: 1600 });

    const room = {
      id: 'rm_test',
      name: 'T1',
      roomTypeId: 'rt_test',
      kind: 'room' as const,
      floor: 5,
      status: 'clean' as const,
    };
    await repos.rooms.createRoom(room);
    await repos.rooms.updateRoom({ ...room, name: 'T2', status: 'dirty' });
    expect(await repos.rooms.getRoom('rm_test')).toEqual({ ...room, name: 'T2', status: 'dirty' });
  });
});

describe('billing (PGlite)', () => {
  it('round-trips the seeded charges and payments, filtered by booking and day', async () => {
    const charge = seed.charges[0]!;
    expect(await repos.billing.listCharges({ bookingId: charge.bookingId })).toEqual(
      seed.charges
        .filter((c) => c.bookingId === charge.bookingId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)),
    );
    expect(await repos.billing.getCharge(charge.id)).toEqual(charge);
    const payment = seed.payments[0]!;
    const onDay = await repos.billing.listPayments({
      from: payment.paidOn,
      to: addDays(payment.paidOn, 1),
    });
    expect(onDay).toContainEqual(payment);
    expect(onDay.every((p) => p.paidOn === payment.paidOn)).toBe(true);
  });

  it('creates and deletes charges and records payments', async () => {
    const bookingId = seed.bookings[0]!.id;
    const charge = {
      id: 'chg_test',
      bookingId,
      label: 'Test extra',
      quantity: 2,
      unitPrice: -50,
      amount: -100,
      vatBracket: 'reduced' as const,
      postedOn: '2026-10-27',
      createdAt: '2026-10-27T09:00:00.000Z',
    };
    await repos.billing.createCharge(charge);
    expect(await repos.billing.getCharge('chg_test')).toEqual(charge);
    const edited = { ...charge, quantity: 3, amount: -150, vatBracket: 'none' as const };
    await repos.billing.updateCharge(edited);
    expect(await repos.billing.getCharge('chg_test')).toEqual(edited);
    await repos.billing.deleteCharge('chg_test');
    expect(await repos.billing.getCharge('chg_test')).toBeNull();
    const payment = {
      id: 'pay_test',
      bookingId,
      kind: 'refund' as const,
      method: 'cash' as const,
      amount: 100,
      note: null,
      paidOn: '2026-10-27',
      createdAt: '2026-10-27T09:00:00.000Z',
    };
    await repos.billing.createPayment(payment);
    expect(await repos.billing.listPayments({ bookingId })).toContainEqual(payment);
  });
});

describe('audit log filters (PGlite)', () => {
  it('filters by actor, newest first', async () => {
    await repos.audit.append({
      actor: 'agent',
      action: 'test.agent',
      subjectId: null,
      payload: null,
    });
    await repos.audit.append({
      actor: 'user',
      action: 'test.user',
      subjectId: null,
      payload: null,
    });
    const agent = await repos.audit.list({ actor: 'agent', limit: 5 });
    expect(agent.every((e) => e.actor === 'agent')).toBe(true);
    expect(agent[0]?.action).toBe('test.agent');
    expect((await repos.audit.list({ limit: 1 }))[0]?.action).toBe('test.user');
  });
});

describe('stay guests (PGlite)', () => {
  it('round-trips the guest book and replaces an entry on save', async () => {
    const entry = seed.stayGuests[0]!;
    const sameStay = seed.stayGuests.filter((s) => s.bookingId === entry.bookingId);
    expect(await repos.stayGuests.listByBooking(entry.bookingId)).toEqual(sameStay);
    await repos.stayGuests.save({ ...entry, documentNumber: 'DEMO-000000' });
    expect((await repos.stayGuests.listByBooking(entry.bookingId))[0]?.documentNumber).toBe(
      'DEMO-000000',
    );
    await repos.stayGuests.save(entry);
    expect(await repos.stayGuests.listByBooking('nope')).toEqual([]);
  });

  it("finds a guest's latest registered entry from another stay", async () => {
    const entry = seed.stayGuests.find((s) => s.guestId !== null)!;
    const latest = await repos.stayGuests.latestRegistered(entry.guestId!, 'elsewhere');
    expect(latest?.guestId).toBe(entry.guestId);
    expect(await repos.stayGuests.latestRegistered(entry.guestId!, latest!.bookingId)).not.toEqual(
      latest,
    );
  });

  it('adds and deletes a companion', async () => {
    const entry = seed.stayGuests[0]!;
    const companion = {
      ...entry,
      id: 'sg_test',
      guestId: null,
      name: 'Demo Companion',
      registeredAt: null,
      createdAt: '2030-01-01T00:00:00.000Z',
    };
    await repos.stayGuests.save(companion);
    expect((await repos.stayGuests.listByBooking(entry.bookingId)).at(-1)).toEqual(companion);
    await repos.stayGuests.delete('sg_test');
    expect((await repos.stayGuests.listByBooking(entry.bookingId)).at(-1)?.id).not.toBe('sg_test');
  });
});

describe('id scans (PGlite)', () => {
  it('saves, replaces, deletes and expires scans', async () => {
    const scan = {
      id: 'tok_test',
      bookingId: seed.bookings[0]!.id,
      stayGuestId: null,
      status: 'reading' as const,
      result: null,
      error: null,
      readingSince: '2026-05-10T08:01:00.000Z',
      createdAt: '2026-05-10T08:00:00.000Z',
      expiresAt: '2026-05-10T08:15:00.000Z',
    };
    await repos.idScans.save(scan);
    expect(await repos.idScans.get('tok_test')).toEqual(scan);
    const done = {
      ...scan,
      status: 'done' as const,
      result: {
        name: 'Demo Person',
        nationality: 'DE',
        dateOfBirth: '1980-01-01',
        documentType: 'passport' as const,
        documentNumber: 'DEMO-1',
        address: null,
        expiresOn: null,
        warnings: [],
      },
    };
    await repos.idScans.save(done);
    expect(await repos.idScans.get('tok_test')).toEqual(done);
    await repos.idScans.deleteExpired('2026-05-10T08:14:59.000Z');
    expect(await repos.idScans.get('tok_test')).not.toBeNull();
    await repos.idScans.deleteExpired('2026-05-10T08:15:00.000Z');
    expect(await repos.idScans.get('tok_test')).toBeNull();
    await repos.idScans.save(scan);
    await repos.idScans.delete('tok_test');
    expect(await repos.idScans.get('tok_test')).toBeNull();
  });
});

describe('staff (PGlite)', () => {
  it('lists active members first, then by name', async () => {
    const staff = await repos.staff.list();
    expect(staff).toHaveLength(seed.staff.length);
    expect(staff.at(-1)?.active).toBe(false);
    expect(staff.filter((s) => s.active).map((s) => s.name)).toEqual(
      seed.staff
        .filter((s) => s.active)
        .map((s) => s.name)
        .sort((a, b) => a.localeCompare(b)),
    );
  });

  it('creates, reads and updates a member', async () => {
    const member = {
      id: 'stf_test',
      name: 'Test Porter',
      email: null,
      role: 'receptionist' as const,
      active: true,
    };
    await repos.staff.create(member);
    expect(await repos.staff.get('stf_test')).toEqual(member);
    await repos.staff.update({ ...member, role: 'housekeeping', active: false });
    expect(await repos.staff.get('stf_test')).toMatchObject({
      role: 'housekeeping',
      active: false,
    });
    expect(await repos.staff.get('nope')).toBeNull();
  });
});

describe('guest writes (PGlite)', () => {
  it('updates a guest in place', async () => {
    const original = seed.guests[1]!;
    await repos.guests.updateGuest({
      ...original,
      phone: '+420 000 000 000',
      notes: 'Prefers ground floor',
    });
    expect(await repos.guests.getGuest(original.id)).toEqual({
      ...original,
      phone: '+420 000 000 000',
      notes: 'Prefers ground floor',
    });
    await repos.guests.updateGuest(original);
  });
});
