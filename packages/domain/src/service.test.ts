import type { Guest, StayGuest } from '@orbit/shared';
import { describe, expect, it } from 'vitest';
import { DomainError } from './errors';
import { hotelPolicy } from './policy';
import { pricingConfig } from './pricing';
import { createHotelService } from './service';
import { booking, double, room } from './test-fixtures';
import { createMemoryRepositories } from './testing';

const now = new Date('2026-05-10T08:00:00Z');
const guest: Guest = {
  id: 'gst_test',
  name: 'Test Guest',
  email: null,
  phone: null,
  language: 'en',
  notes: null,
};

function registration(bookingId: string): StayGuest {
  return {
    id: `sg_${bookingId}`,
    bookingId,
    guestId: 'gst_test',
    name: 'Test Guest',
    nationality: 'CZ',
    dateOfBirth: '1980-01-01',
    documentType: 'id_card',
    documentNumber: 'DEMO-0001',
    address: null,
    registeredAt: now.toISOString(),
    createdAt: now.toISOString(),
  };
}

function setup() {
  const repos = createMemoryRepositories(
    {
      roomTypes: [double],
      rooms: [room('rm_1', { name: '1' }), room('rm_2', { name: '2' })],
      guests: [guest],
      bookings: [
        booking({ id: 'arrival', roomId: 'rm_1', checkIn: '2026-05-10', checkOut: '2026-05-12' }),
        booking({
          id: 'leaving',
          roomId: 'rm_2',
          checkIn: '2026-05-07',
          checkOut: '2026-05-10',
          status: 'checked_in',
        }),
        booking({ id: 'later', roomId: 'rm_2', checkIn: '2026-05-12', checkOut: '2026-05-14' }),
      ],
    },
    () => now,
  );
  let n = 0;
  const newId = (prefix: string) => `${prefix}_${++n}`;
  return {
    repos,
    service: createHotelService({
      repos,
      pricing: pricingConfig,
      policy: hotelPolicy,
      clock: () => now,
      newId,
    }),
  };
}

describe('createHotelService', () => {
  it('returns booking detail with the actions allowed today', async () => {
    const { service } = setup();
    const detail = await service.getBookingDetail('arrival');
    expect(detail.guest.name).toBe('Test Guest');
    expect(detail.room.name).toBe('1');
    expect(detail.allowedActions).toEqual(['check_in', 'cancel']);
  });

  it('throws not_found for unknown bookings', async () => {
    const { service } = setup();
    await expect(service.getBookingDetail('nope')).rejects.toMatchObject({ code: 'not_found' });
  });

  it('counts the party members without a guest-book entry', async () => {
    const { repos, service } = setup();
    expect((await service.getBookingDetail('arrival')).missingIds).toBe(2);
    await repos.stayGuests.save(registration('arrival'));
    expect((await service.getBookingDetail('arrival')).missingIds).toBe(1);
  });

  it('checks in without waiting for the guest book', async () => {
    const { repos, service } = setup();
    await service.applyBookingAction('arrival', 'check_in', 'user');
    expect((await repos.bookings.getBooking('arrival'))?.status).toBe('checked_in');
    expect((await service.getBookingDetail('arrival')).missingIds).toBe(2);
  });

  it('applies an action and records who did it', async () => {
    const { repos, service } = setup();
    await service.applyBookingAction('arrival', 'check_in', 'agent');
    expect((await repos.bookings.getBooking('arrival'))?.status).toBe('checked_in');
    expect(repos.state.audit).toEqual([
      expect.objectContaining({
        actor: 'agent',
        action: 'booking.check_in',
        subjectId: 'arrival',
        payload: { from: 'confirmed', to: 'checked_in' },
      }),
    ]);
  });

  it('marks the room dirty on check-out', async () => {
    const { repos, service } = setup();
    await service.applyBookingAction('leaving', 'check_out', 'user');
    expect((await repos.rooms.getRoom('rm_2'))?.status).toBe('dirty');
  });

  it('locks a room before checking it for conflicts, so two changes cannot both book it', async () => {
    const { repos, service } = setup();
    const calls: string[] = [];
    const rooms = { ...repos.rooms };
    const bookings = { ...repos.bookings };
    repos.rooms.lockRoom = (id) => {
      calls.push(`lock ${id}`);
      return rooms.lockRoom(id);
    };
    repos.bookings.listBookings = (filter) => {
      if (filter?.roomId) calls.push(`read ${filter.roomId}`);
      return bookings.listBookings(filter);
    };
    await service.moveBooking('arrival', 'rm_2', 'user');
    await service.changeBookingDates(
      'later',
      { checkIn: '2026-05-12', checkOut: '2026-05-15' },
      'user',
    );
    await service.createHold(
      {
        guest: { guestId: 'gst_test' },
        roomId: 'rm_1',
        checkIn: '2026-05-20',
        checkOut: '2026-05-22',
        adults: 2,
        childAges: [],
        addons: { wellness: false, dogs: 0, extraBeds: 0 },
        source: 'phone',
        notes: null,
        inquiryId: null,
      },
      'user',
    );
    expect(calls).toEqual([
      'lock rm_2',
      'read rm_2',
      'lock rm_2',
      'read rm_2',
      'lock rm_1',
      'read rm_1',
    ]);
  });

  it('moves a booking and logs both rooms', async () => {
    const { repos, service } = setup();
    await service.moveBooking('arrival', 'rm_2', 'user');
    expect((await repos.bookings.getBooking('arrival'))?.roomId).toBe('rm_2');
    expect(repos.state.audit[0]?.payload).toEqual({ fromRoomId: 'rm_1', toRoomId: 'rm_2' });
  });

  it('changes dates, re-prices and logs the old and new total', async () => {
    const { repos, service } = setup();
    const updated = await service.changeBookingDates(
      'arrival',
      { checkIn: '2026-05-10', checkOut: '2026-05-13' },
      'user',
    );
    expect(updated.priceSnapshot?.nights).toBe(3);
    expect(repos.state.audit[0]?.action).toBe('booking.change_dates');
  });

  it('leaves no trace when an operation fails', async () => {
    const { repos, service } = setup();
    await expect(
      service.changeBookingDates(
        'leaving',
        { checkIn: '2026-05-07', checkOut: '2026-05-13' },
        'user',
      ),
    ).rejects.toBeInstanceOf(DomainError);
    expect(repos.state.audit).toEqual([]);
    expect((await repos.bookings.getBooking('leaving'))?.checkOut).toBe('2026-05-10');
  });

  it('builds the day overview with guest and room names', async () => {
    const { service } = setup();
    const day = await service.getDayOverview();
    expect(day.date).toBe('2026-05-10');
    expect(day.arrivals.map((s) => [s.booking.id, s.guestName, s.roomName])).toEqual([
      ['arrival', 'Test Guest', '1'],
    ]);
    expect(day.departures.map((s) => s.booking.id)).toEqual(['leaving']);
    expect(day.inHouse).toEqual([]);
  });

  it('builds the daily brief from current data', async () => {
    const { service } = setup();
    const brief = await service.getDailyBrief();
    expect(brief.date).toBe('2026-05-10');
    expect(brief.occupancy).toEqual({ occupied: 1, sellable: 2, total: 2 });
    expect(brief.roomsToPrepare.map((r) => [r.roomName, r.guestName])).toEqual([
      ['1', 'Test Guest'],
    ]);
    expect(brief.gaps).toEqual([
      { roomId: 'rm_2', roomName: '2', from: '2026-05-10', to: '2026-05-12', nights: 2 },
    ]);
  });
});

describe('createHold', () => {
  const request = {
    guest: {
      name: 'New Guest',
      email: 'new.guest@example.com',
      phone: null,
      language: 'de' as const,
    },
    roomId: 'rm_1',
    checkIn: '2026-05-12',
    checkOut: '2026-05-14',
    adults: 2,
    childAges: [],
    addons: { wellness: true, dogs: 0, extraBeds: 0 },
    source: 'email' as const,
    notes: null,
    inquiryId: null,
  };

  it('creates a priced hold and a new guest, expiring after the policy window', async () => {
    const { repos, service } = setup();
    const hold = await service.createHold(request, 'agent');
    expect(hold).toMatchObject({ status: 'hold', roomId: 'rm_1', checkIn: '2026-05-12' });
    expect(hold.holdExpiresAt).toBe(
      new Date(now.getTime() + hotelPolicy.holdHours * 3_600_000).toISOString(),
    );
    expect(hold.priceSnapshot?.lines.some((l) => l.kind === 'wellness')).toBe(true);
    expect(repos.state.guests.find((g) => g.id === hold.guestId)?.name).toBe('New Guest');
    expect(repos.state.audit[0]).toMatchObject({ actor: 'agent', action: 'booking.create_hold' });
  });

  it('reuses an existing guest', async () => {
    const { repos, service } = setup();
    const hold = await service.createHold({ ...request, guest: { guestId: 'gst_test' } }, 'user');
    expect(hold.guestId).toBe('gst_test');
    expect(repos.state.guests).toHaveLength(1);
  });

  it('rejects an occupied room, a past date and an oversized party, saving nothing', async () => {
    const { repos, service } = setup();
    await expect(
      service.createHold({ ...request, roomId: 'rm_2', checkIn: '2026-05-13' }, 'user'),
    ).rejects.toMatchObject({ code: 'conflict' });
    await expect(
      service.createHold({ ...request, checkIn: '2026-05-09' }, 'user'),
    ).rejects.toMatchObject({ code: 'invalid_date_range' });
    await expect(service.createHold({ ...request, adults: 5 }, 'user')).rejects.toMatchObject({
      code: 'over_capacity',
    });
    expect(repos.state.bookings).toHaveLength(3);
    expect(repos.state.guests).toHaveLength(1);
  });

  it('previews without saving', async () => {
    const { repos, service } = setup();
    const { booking, room, newGuest } = await service.previewHold(request);
    expect(booking.status).toBe('hold');
    expect(room.name).toBe('1');
    expect(newGuest?.name).toBe('New Guest');
    expect(repos.state.bookings).toHaveLength(3);
    expect(repos.state.audit).toEqual([]);
  });
});

describe('queries', () => {
  const stay = {
    checkIn: '2026-05-12',
    checkOut: '2026-05-14',
    adults: 2,
    childAges: [],
    addons: { wellness: false, dogs: 0, extraBeds: 0 },
  };

  it('finds available rooms for a stay', async () => {
    const { service } = setup();
    const rooms = await service.findAvailableRooms(stay);
    expect(rooms.map((r) => r.roomName)).toEqual(['1']);
  });

  it('quotes by room or room type', async () => {
    const { service } = setup();
    expect(await service.quoteStay({ ...stay, roomId: 'rm_1' })).toEqual(
      await service.quoteStay({ ...stay, roomTypeId: double.id }),
    );
    await expect(service.quoteStay({ ...stay, roomTypeId: 'nope' })).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  it('prices with the saved rates once a manager has saved them', async () => {
    const { repos, service } = setup();
    const before = await service.quoteStay({
      ...stay,
      roomTypeId: double.id,
      addons: { ...stay.addons, dogs: 1 },
    });
    await repos.settings.savePricing({ ...pricingConfig, dog: { perNight: 450 } });
    const after = await service.quoteStay({
      ...stay,
      roomTypeId: double.id,
      addons: { ...stay.addons, dogs: 1 },
    });
    expect(after.total - before.total).toBe(2 * (450 - pricingConfig.dog.perNight));
  });

  it('searches bookings by guest name without accents and by room', async () => {
    const { service } = setup();
    expect(await service.searchBookings({ guestName: 'test guest' })).toHaveLength(3);
    expect(await service.searchBookings({ guestName: 'nobody' })).toHaveLength(0);
    expect((await service.searchBookings({ roomName: '2' })).map((s) => s.booking.id)).toEqual([
      'leaving',
      'later',
    ]);
  });
});

describe('rescheduleBooking', () => {
  it('moves room and dates in one audited step', async () => {
    const { repos, service } = setup();
    const updated = await service.rescheduleBooking(
      'arrival',
      { roomId: 'rm_2', checkIn: '2026-05-14', checkOut: '2026-05-16' },
      'user',
    );
    expect(updated).toMatchObject({ roomId: 'rm_2', checkIn: '2026-05-14' });
    expect(repos.state.audit[0]).toMatchObject({
      action: 'booking.reschedule',
      subjectId: 'arrival',
    });
  });

  it('saves nothing when the target is taken', async () => {
    const { repos, service } = setup();
    await expect(
      service.rescheduleBooking(
        'arrival',
        { roomId: 'rm_2', checkIn: '2026-05-12', checkOut: '2026-05-13' },
        'user',
      ),
    ).rejects.toMatchObject({ code: 'conflict' });
    expect(repos.state.bookings.find((b) => b.id === 'arrival')?.roomId).toBe('rm_1');
    expect(repos.state.audit).toEqual([]);
  });
});

describe('createBooking and updateBooking', () => {
  const input = {
    guest: { name: 'Walk In', email: null, phone: null, language: 'en' as const },
    roomId: 'rm_1',
    checkIn: '2026-05-12',
    checkOut: '2026-05-13',
    adults: 1,
    childAges: [],
    addons: { wellness: false, dogs: 0, extraBeds: 0 },
    source: 'walk_in' as const,
    notes: null,
    inquiryId: null,
  };

  it('creates a confirmed booking that never lapses', async () => {
    const { repos, service } = setup();
    const created = await service.createBooking({ ...input, status: 'confirmed' }, 'user');
    expect(created).toMatchObject({ status: 'confirmed', holdExpiresAt: null, source: 'walk_in' });
    expect(repos.state.audit.at(-1)).toMatchObject({
      action: 'booking.create',
      subjectId: created.id,
    });
  });

  it('creates a hold by default', async () => {
    const { service } = setup();
    const created = await service.createBooking({ ...input, status: 'hold' }, 'user');
    expect(created.status).toBe('hold');
    expect(created.holdExpiresAt).not.toBeNull();
  });

  it('edits a booking and audits the changed fields and totals', async () => {
    const { repos, service } = setup();
    const updated = await service.updateBooking(
      'arrival',
      { adults: 1, notes: 'Quiet room please' },
      'user',
    );
    expect(updated).toMatchObject({ adults: 1, notes: 'Quiet room please' });
    expect(repos.state.audit.at(-1)).toMatchObject({
      action: 'booking.update',
      subjectId: 'arrival',
      payload: { changed: ['adults', 'notes'] },
    });
  });

  it('previews an edit without saving it', async () => {
    const { repos, service } = setup();
    const { booking } = await service.previewUpdate('arrival', { roomId: 'rm_2' });
    expect(booking.roomId).toBe('rm_2');
    expect((await repos.bookings.getBooking('arrival'))?.roomId).toBe('rm_1');
  });

  it('lists free rooms with quotes, ignoring the booking being edited', async () => {
    const { service } = setup();
    const query = { checkIn: '2026-05-10', checkOut: '2026-05-12', adults: 2, childAges: [] };
    expect(
      (await service.roomOptions({ ...query, addons: input.addons })).map((o) => o.roomId),
    ).toEqual(['rm_2']);
    const options = await service.roomOptions({
      ...query,
      addons: input.addons,
      excludeBookingId: 'arrival',
    });
    expect(options.map((o) => o.roomId)).toEqual(['rm_1', 'rm_2']);
    expect(options[0]?.quote.nights).toBe(2);
  });
});
