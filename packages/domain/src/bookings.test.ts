import { describe, expect, it } from 'vitest';
import {
  allowedActions,
  applyAction,
  changeDates,
  changedBookingFields,
  moveBooking,
  reschedule,
  updateBooking,
} from './bookings';
import { DomainError } from './errors';
import type { PricingConfig } from './pricing';
import { apartment, booking, double, room } from './test-fixtures';

const now = new Date('2026-05-10T08:00:00Z');
const today = '2026-05-10';
const pricing: PricingConfig = {
  seasons: [],
  childDiscounts: [],
  longStay: [],
  wellness: { perPersonPerNight: 0, minAge: 0 },
  extraBed: { perNight: 0 },
  dog: { perNight: 0 },
  cityTax: { perPersonPerNight: 0, minAge: 18 },
  vat: { standard: 21, reduced: 12 },
};

function expectCode(fn: () => unknown, code: DomainError['code']) {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(DomainError);
    expect((err as DomainError).code).toBe(code);
    return;
  }
  throw new Error(`expected DomainError ${code}`);
}

describe('allowedActions', () => {
  it('lets a hold be confirmed or cancelled', () => {
    expect(allowedActions(booking({ roomId: '1', status: 'hold' }), today)).toEqual([
      'confirm',
      'cancel',
    ]);
  });

  it('allows check-in only during the stay', () => {
    const b = booking({ roomId: '1', checkIn: '2026-05-10', checkOut: '2026-05-12' });
    expect(allowedActions(b, '2026-05-09')).toEqual(['cancel']);
    expect(allowedActions(b, '2026-05-10')).toEqual(['check_in', 'cancel']);
    expect(allowedActions(b, '2026-05-11')).toEqual(['check_in', 'cancel']);
    expect(allowedActions(b, '2026-05-12')).toEqual(['cancel']);
  });

  it('allows only check-out once checked in, and nothing after', () => {
    expect(allowedActions(booking({ roomId: '1', status: 'checked_in' }), today)).toEqual([
      'check_out',
    ]);
    expect(allowedActions(booking({ roomId: '1', status: 'checked_out' }), today)).toEqual([]);
    expect(allowedActions(booking({ roomId: '1', status: 'cancelled' }), today)).toEqual([]);
  });
});

describe('applyAction', () => {
  const ctx = { today, now, roomBookings: [], roomName: '1' };

  it('confirms a hold and clears its expiry', () => {
    const hold = booking({ roomId: '1', status: 'hold', holdExpiresAt: '2026-05-11T08:00:00Z' });
    expect(applyAction(hold, 'confirm', ctx)).toMatchObject({
      status: 'confirmed',
      holdExpiresAt: null,
    });
  });

  it('refuses to confirm a hold whose room was taken after it expired', () => {
    const hold = booking({
      id: 'h',
      roomId: '1',
      status: 'hold',
      holdExpiresAt: '2026-05-01T08:00:00Z',
    });
    const other = booking({ id: 'o', roomId: '1', checkIn: '2026-05-11', checkOut: '2026-05-12' });
    expectCode(
      () => applyAction(hold, 'confirm', { ...ctx, roomBookings: [hold, other] }),
      'conflict',
    );
  });

  it('checks in, checks out and cancels', () => {
    const b = booking({ roomId: '1', checkIn: today });
    const inHouse = applyAction(b, 'check_in', ctx);
    expect(inHouse.status).toBe('checked_in');
    expect(applyAction(inHouse, 'check_out', ctx).status).toBe('checked_out');
    expect(applyAction(b, 'cancel', ctx).status).toBe('cancelled');
  });

  it('rejects transitions that are not allowed', () => {
    expectCode(
      () => applyAction(booking({ roomId: '1', status: 'checked_out' }), 'check_in', ctx),
      'invalid_transition',
    );
    expectCode(
      () => applyAction(booking({ roomId: '1', status: 'checked_in' }), 'cancel', ctx),
      'invalid_transition',
    );
    expectCode(
      () =>
        applyAction(
          booking({ roomId: '1', checkIn: '2026-06-01', checkOut: '2026-06-03' }),
          'check_in',
          ctx,
        ),
      'invalid_transition',
    );
  });
});

describe('moveBooking', () => {
  const b = booking({ id: 'b', roomId: '1' });
  const ctx = { room: room('2'), roomType: double, roomBookings: [], now };

  it('moves to a free room and keeps the price', () => {
    const moved = moveBooking({ ...b, priceSnapshot: null }, ctx);
    expect(moved.roomId).toBe('2');
    expect(moved.priceSnapshot).toBeNull();
  });

  it('allows moving into a room the same day another guest leaves', () => {
    const leaving = booking({ id: 'x', roomId: '2', checkIn: '2026-05-07', checkOut: b.checkIn });
    expect(moveBooking(b, { ...ctx, roomBookings: [leaving] }).roomId).toBe('2');
  });

  it('rejects an occupied room', () => {
    const other = booking({ id: 'x', roomId: '2', checkIn: '2026-05-12', checkOut: '2026-05-14' });
    expectCode(() => moveBooking(b, { ...ctx, roomBookings: [other] }), 'conflict');
  });

  it('rejects the same room, an out-of-order room and a room that is too small', () => {
    expectCode(() => moveBooking(b, { ...ctx, room: room('1') }), 'conflict');
    expectCode(
      () => moveBooking(b, { ...ctx, room: room('2', { status: 'out_of_order' }) }),
      'conflict',
    );
    const family = booking({ id: 'f', roomId: 'A1', adults: 4 });
    expectCode(() => moveBooking(family, ctx), 'over_capacity');
    expect(
      moveBooking(family, { ...ctx, room: room('A2', { kind: 'apartment' }), roomType: apartment })
        .roomId,
    ).toBe('A2');
  });

  it('cannot move finished or cancelled bookings', () => {
    expectCode(() => moveBooking({ ...b, status: 'checked_out' }, ctx), 'invalid_transition');
    expectCode(() => moveBooking({ ...b, status: 'cancelled' }, ctx), 'invalid_transition');
  });
});

describe('changeDates', () => {
  const b = booking({ id: 'b', roomId: '1', checkIn: '2026-05-10', checkOut: '2026-05-12' });
  const ctx = { room: room('1'), roomType: double, roomBookings: [b], now, pricing };

  it('extends a stay and re-prices it', () => {
    const extended = changeDates(b, { checkIn: '2026-05-10', checkOut: '2026-05-13' }, ctx);
    expect(extended.checkOut).toBe('2026-05-13');
    expect(extended.priceSnapshot?.nights).toBe(3);
    expect(extended.priceSnapshot?.total).toBe(3 * 2 * double.basePrice);
  });

  it('keeps add-ons when re-pricing', () => {
    const withDog = { ...b, addons: { wellness: false, dogs: 1, extraBeds: 0 } };
    const changed = changeDates(
      withDog,
      { checkIn: '2026-05-10', checkOut: '2026-05-11' },
      {
        ...ctx,
        pricing: { ...pricing, dog: { perNight: 200 } },
      },
    );
    expect(changed.priceSnapshot?.lines.find((l) => l.kind === 'dog')?.amount).toBe(200);
  });

  it('ignores the booking itself but not its neighbours', () => {
    const next = booking({ id: 'n', roomId: '1', checkIn: '2026-05-12', checkOut: '2026-05-14' });
    expectCode(
      () =>
        changeDates(
          b,
          { checkIn: '2026-05-10', checkOut: '2026-05-13' },
          { ...ctx, roomBookings: [b, next] },
        ),
      'conflict',
    );
    expect(
      changeDates(
        b,
        { checkIn: '2026-05-09', checkOut: '2026-05-12' },
        { ...ctx, roomBookings: [b, next] },
      ).checkIn,
    ).toBe('2026-05-09');
  });

  it('only lets checked-in guests change their departure', () => {
    const inHouse = { ...b, status: 'checked_in' as const };
    expect(
      changeDates(inHouse, { checkIn: '2026-05-10', checkOut: '2026-05-14' }, ctx).checkOut,
    ).toBe('2026-05-14');
    expectCode(
      () => changeDates(inHouse, { checkIn: '2026-05-11', checkOut: '2026-05-14' }, ctx),
      'invalid_transition',
    );
  });

  it('rejects invalid ranges and finished bookings', () => {
    expectCode(
      () => changeDates(b, { checkIn: '2026-05-12', checkOut: '2026-05-12' }, ctx),
      'invalid_date_range',
    );
    expectCode(
      () =>
        changeDates(
          { ...b, status: 'checked_out' },
          { checkIn: '2026-05-10', checkOut: '2026-05-13' },
          ctx,
        ),
      'invalid_transition',
    );
  });
});

describe('reschedule', () => {
  const b = booking({ id: 'b', roomId: '1', checkIn: '2026-05-10', checkOut: '2026-05-12' });
  const ctx = { room: room('2'), roomType: double, roomBookings: [], now, pricing };

  it('moves room and dates together and re-prices', () => {
    const moved = reschedule(b, { checkIn: '2026-05-11', checkOut: '2026-05-14' }, ctx);
    expect(moved).toMatchObject({ roomId: '2', checkIn: '2026-05-11', checkOut: '2026-05-14' });
    expect(moved.priceSnapshot?.nights).toBe(3);
  });

  it('keeps the agreed price when only the room changes', () => {
    const priced = { ...b, priceSnapshot: null };
    expect(reschedule(priced, b, ctx).priceSnapshot).toBeNull();
  });

  it('shifts dates in the same room, ignoring the booking itself', () => {
    const moved = reschedule(
      b,
      { checkIn: '2026-05-11', checkOut: '2026-05-13' },
      { ...ctx, room: room('1'), roomBookings: [b] },
    );
    expect(moved.checkIn).toBe('2026-05-11');
  });

  it('rejects conflicts, no-op drags and arrival changes for checked-in guests', () => {
    const other = booking({ id: 'o', roomId: '2', checkIn: '2026-05-13', checkOut: '2026-05-15' });
    expectCode(
      () =>
        reschedule(
          b,
          { checkIn: '2026-05-12', checkOut: '2026-05-14' },
          { ...ctx, roomBookings: [other] },
        ),
      'conflict',
    );
    expectCode(() => reschedule(b, b, { ...ctx, room: room('1') }), 'invalid_input');
    expectCode(
      () =>
        reschedule(
          { ...b, status: 'checked_in' },
          { checkIn: '2026-05-11', checkOut: '2026-05-12' },
          ctx,
        ),
      'invalid_transition',
    );
    expect(
      reschedule(
        { ...b, status: 'checked_in' },
        { checkIn: '2026-05-10', checkOut: '2026-05-12' },
        ctx,
      ).roomId,
    ).toBe('2');
  });

  it('rejects an out-of-order or too small room and finished bookings', () => {
    expectCode(
      () => reschedule(b, b, { ...ctx, room: room('2', { status: 'out_of_order' }) }),
      'conflict',
    );
    expectCode(() => reschedule({ ...b, adults: 4 }, b, ctx), 'over_capacity');
    expectCode(() => reschedule({ ...b, status: 'checked_out' }, b, ctx), 'invalid_transition');
  });
});

describe('updateBooking', () => {
  const pricedRates: PricingConfig = {
    ...pricing,
    wellness: { perPersonPerNight: 100, minAge: 0 },
  };
  const b = booking({ id: 'b', roomId: '1', checkIn: '2026-05-10', checkOut: '2026-05-12' });
  const ctx = { room: room('1'), roomType: double, roomBookings: [b], now, pricing: pricedRates };

  it('lists only the fields that really change', () => {
    expect(
      changedBookingFields(b, { adults: 2, notes: 'Late arrival', checkIn: b.checkIn }),
    ).toEqual(['notes']);
  });

  it('changes party and add-ons and re-prices', () => {
    const updated = updateBooking(
      b,
      { adults: 1, childAges: [6], addons: { wellness: true, dogs: 0, extraBeds: 0 } },
      ctx,
    );
    expect(updated).toMatchObject({ adults: 1, childAges: [6], addons: { wellness: true } });
    expect(updated.priceSnapshot?.lines.map((l) => l.kind)).toContain('wellness');
  });

  it('keeps the price for notes, source or a room change alone', () => {
    const priced = { ...b, priceSnapshot: null };
    expect(
      updateBooking(priced, { notes: 'Cot please', source: 'phone' }, ctx).priceSnapshot,
    ).toBeNull();
    expect(
      updateBooking(priced, { roomId: '2' }, { ...ctx, room: room('2'), roomBookings: [] })
        .priceSnapshot,
    ).toBeNull();
  });

  it('moves room and dates with the usual checks', () => {
    const other = booking({ id: 'o', roomId: '2', checkIn: '2026-05-11', checkOut: '2026-05-13' });
    const target = { ...ctx, room: room('2'), roomBookings: [other] };
    expectCode(() => updateBooking(b, { roomId: '2' }, target), 'conflict');
    expectCode(
      () =>
        updateBooking(
          b,
          { roomId: '2' },
          { ...target, room: room('2', { status: 'out_of_order' }), roomBookings: [] },
        ),
      'conflict',
    );
    expectCode(() => updateBooking(b, { checkOut: '2026-05-10' }, ctx), 'invalid_date_range');
    const moved = updateBooking(
      b,
      { roomId: '2', checkOut: '2026-05-11' },
      { ...target, roomBookings: [] },
    );
    expect(moved).toMatchObject({ roomId: '2', checkOut: '2026-05-11' });
  });

  it('needs the party to fit the room', () => {
    expectCode(() => updateBooking(b, { adults: 3 }, ctx), 'over_capacity');
    expectCode(() => updateBooking(b, { adults: 0 }, ctx), 'invalid_party');
    expect(
      updateBooking(b, { adults: 3, addons: { wellness: false, dogs: 0, extraBeds: 1 } }, ctx)
        .adults,
    ).toBe(3);
  });

  it('keeps the arrival of a checked-in guest', () => {
    const inHouse = { ...b, status: 'checked_in' as const };
    expectCode(() => updateBooking(inHouse, { checkIn: '2026-05-09' }, ctx), 'invalid_transition');
    expect(updateBooking(inHouse, { checkOut: '2026-05-13' }, ctx).checkOut).toBe('2026-05-13');
  });

  it('only takes notes on finished or cancelled bookings', () => {
    const done = { ...b, status: 'checked_out' as const };
    expect(updateBooking(done, { notes: 'Left an umbrella' }, ctx).notes).toBe('Left an umbrella');
    expectCode(() => updateBooking(done, { adults: 1 }, ctx), 'invalid_transition');
    expectCode(
      () => updateBooking({ ...b, status: 'cancelled' }, { source: 'web' }, ctx),
      'invalid_transition',
    );
  });

  it('refuses a patch that changes nothing', () => {
    expectCode(() => updateBooking(b, { adults: b.adults }, ctx), 'invalid_input');
  });
});
