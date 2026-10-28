import { describe, expect, it } from 'vitest';
import { createBillingService } from './billing';
import { createPendingActionService } from './pending-actions';
import { hotelPolicy } from './policy';
import { pricingConfig } from './pricing';
import { createHotelService } from './service';
import { booking, double, room } from './test-fixtures';
import { createMemoryRepositories } from './testing';

const now = new Date('2026-05-10T08:00:00Z');

function setup() {
  const repos = createMemoryRepositories(
    {
      roomTypes: [double],
      rooms: [room('rm_1', { name: '1' }), room('rm_2', { name: '2' })],
      guests: [
        { id: 'gst_1', name: 'Tomáš Novák', email: null, phone: null, language: 'cs', notes: null },
      ],
      bookings: [
        booking({
          id: 'bk_a',
          guestId: 'gst_1',
          roomId: 'rm_1',
          checkIn: '2026-05-12',
          checkOut: '2026-05-14',
        }),
        booking({
          id: 'bk_today',
          guestId: 'gst_1',
          roomId: 'rm_1',
          checkIn: '2026-05-10',
          checkOut: '2026-05-12',
        }),
        booking({
          id: 'bk_leaving',
          guestId: 'gst_1',
          roomId: 'rm_2',
          checkIn: '2026-05-07',
          checkOut: '2026-05-10',
          adults: 1,
          status: 'checked_in',
        }),
        booking({
          id: 'bk_h',
          guestId: 'gst_1',
          roomId: 'rm_2',
          checkIn: '2026-05-20',
          checkOut: '2026-05-22',
          status: 'hold',
        }),
      ],
    },
    () => now,
  );
  let n = 0;
  const newId = (prefix: string) => `${prefix}_${++n}`;
  const hotel = createHotelService({
    repos,
    pricing: pricingConfig,
    policy: hotelPolicy,
    clock: () => now,
    newId,
  });
  const billing = createBillingService({ repos, pricing: pricingConfig, clock: () => now, newId });
  return {
    repos,
    hotel,
    actions: createPendingActionService({ repos, hotel, billing, clock: () => now, newId }),
  };
}

describe('pending actions', () => {
  it('proposes a move without changing anything and summarises it', async () => {
    const { repos, actions } = setup();
    const action = await actions.propose({
      kind: 'move_booking',
      input: { bookingId: 'bk_a', roomId: 'rm_2' },
    });
    expect(action).toMatchObject({ status: 'pending', bookingId: 'bk_a', kind: 'move_booking' });
    expect(action.summary).toBe(
      'Move Tomáš Novák (2026-05-12 to 2026-05-14 (2 nights)) from room 1 to room 2',
    );
    expect(repos.state.bookings.find((b) => b.id === 'bk_a')?.roomId).toBe('rm_1');
    expect(repos.state.audit).toEqual([]);
  });

  it('proposes an edit with a summary of what changes, and runs it on confirm', async () => {
    const { repos, actions } = setup();
    const proposed = await actions.propose({
      kind: 'update_booking',
      input: { bookingId: 'bk_a', adults: 1, notes: 'Vegetarian breakfast' },
    });
    expect(proposed.summary).toMatch(
      /^Update Tomáš Novák in room 1: party 2 adults → 1 adult, notes "Vegetarian breakfast", total 2000 CZK \(was \?\)$/,
    );
    expect(repos.state.bookings.find((b) => b.id === 'bk_a')?.adults).toBe(2);
    await actions.confirm(proposed.id);
    expect(repos.state.bookings.find((b) => b.id === 'bk_a')).toMatchObject({
      adults: 1,
      notes: 'Vegetarian breakfast',
    });
    expect(repos.state.audit[0]).toMatchObject({ actor: 'agent', action: 'booking.update' });
  });

  it('refuses to propose an invalid change', async () => {
    const { repos, actions } = setup();
    await expect(
      actions.propose({
        kind: 'change_dates',
        input: { bookingId: 'bk_a', checkIn: '2026-05-12', checkOut: '2026-05-12' },
      }),
    ).rejects.toMatchObject({ code: 'invalid_date_range' });
    await expect(
      actions.propose({ kind: 'move_booking', input: { bookingId: 'bk_a', roomId: 'nope' } }),
    ).rejects.toMatchObject({ code: 'not_found' });
    expect(repos.state.pendingActions).toEqual([]);
  });

  it('runs the stored action on confirm and logs it as the agent', async () => {
    const { repos, actions } = setup();
    const proposed = await actions.propose({
      kind: 'move_booking',
      input: { bookingId: 'bk_a', roomId: 'rm_2' },
    });
    const confirmed = await actions.confirm(proposed.id);
    expect(confirmed).toMatchObject({
      status: 'confirmed',
      bookingId: 'bk_a',
      resolvedAt: now.toISOString(),
    });
    expect(repos.state.bookings.find((b) => b.id === 'bk_a')?.roomId).toBe('rm_2');
    expect(repos.state.audit[0]).toMatchObject({ actor: 'agent', action: 'booking.move' });
  });

  it('creates a hold on confirm and links the new booking', async () => {
    const { repos, actions } = setup();
    const proposed = await actions.propose({
      kind: 'create_hold',
      input: {
        guest: { name: 'Jana Testová', email: null, phone: null, language: 'cs' },
        roomId: 'rm_2',
        checkIn: '2026-05-11',
        checkOut: '2026-05-13',
        adults: 2,
        childAges: [],
        addons: { wellness: false, dogs: 0, extraBeds: 0 },
        source: 'email',
        notes: null,
        inquiryId: null,
      },
    });
    expect(proposed.summary).toMatch(
      /^Hold room 2 for Jana Testová, 2026-05-11 to 2026-05-13 \(2 nights\), 2 adults, total \d+ CZK$/,
    );
    expect(proposed.bookingId).toBeNull();
    const confirmed = await actions.confirm(proposed.id);
    expect(confirmed.bookingId).toBeTruthy();
    expect(repos.state.bookings.find((b) => b.id === confirmed.bookingId)?.status).toBe('hold');
  });

  it('marks the action failed if the change is no longer valid at confirm time', async () => {
    const { repos, hotel, actions } = setup();
    const proposed = await actions.propose({
      kind: 'move_booking',
      input: { bookingId: 'bk_a', roomId: 'rm_2' },
    });
    // Someone else takes room 2 for those nights in the meantime.
    await hotel.changeBookingDates(
      'bk_h',
      { checkIn: '2026-05-12', checkOut: '2026-05-22' },
      'user',
    );
    const result = await actions.confirm(proposed.id);
    expect(result.status).toBe('failed');
    expect(result.error).toMatch(/Room 2 is taken/);
    expect(repos.state.bookings.find((b) => b.id === 'bk_a')?.roomId).toBe('rm_1');
  });

  it('proposes a charge with the balance after, and posts it on confirm', async () => {
    const { repos, actions } = setup();
    const proposed = await actions.propose({
      kind: 'add_charge',
      input: {
        bookingId: 'bk_a',
        label: 'Sauna',
        quantity: 2,
        unitPrice: 150,
        vatBracket: 'standard',
      },
    });
    expect(proposed.summary).toBe(
      'Add 2 × Sauna at 150 CZK (300 CZK) to the bill of Tomáš Novák, room 1; balance then 500 CZK',
    );
    expect(repos.state.charges).toEqual([]);
    await actions.confirm(proposed.id);
    expect(repos.state.charges).toHaveLength(1);
    expect(repos.state.audit[0]).toMatchObject({ actor: 'agent', action: 'folio.charge' });
  });

  it('proposes a payment and records it on confirm', async () => {
    const { repos, actions } = setup();
    const proposed = await actions.propose({
      kind: 'record_payment',
      input: {
        bookingId: 'bk_a',
        kind: 'payment',
        method: 'bank_transfer',
        amount: 500,
        note: null,
      },
    });
    expect(proposed.summary).toBe(
      'Record a bank transfer payment of 500 CZK from Tomáš Novák, room 1; balance then -300 CZK',
    );
    const confirmed = await actions.confirm(proposed.id);
    expect(confirmed).toMatchObject({ status: 'confirmed', bookingId: 'bk_a' });
    expect(repos.state.payments).toHaveLength(1);
  });

  it('refuses to propose a charge on a hold', async () => {
    const { actions } = setup();
    await expect(
      actions.propose({
        kind: 'add_charge',
        input: {
          bookingId: 'bk_h',
          label: 'Sauna',
          quantity: 1,
          unitPrice: 150,
          vatBracket: 'standard',
        },
      }),
    ).rejects.toMatchObject({ code: 'invalid_transition' });
  });

  it('proposes a check-in, saying how many guests still need an ID', async () => {
    const { repos, actions } = setup();
    const checkIn = { kind: 'check_in' as const, input: { bookingId: 'bk_today' } };
    expect((await actions.propose(checkIn)).summary).toBe(
      'Check in Tomáš Novák to room 1, 2026-05-10 to 2026-05-12 (2 nights); 2 guests still need an ID in the guest book',
    );
    await repos.stayGuests.save({
      id: 'sg_bk_today',
      bookingId: 'bk_today',
      guestId: 'gst_1',
      name: 'Tomáš Novák',
      nationality: 'CZ',
      dateOfBirth: '1980-01-01',
      documentType: 'id_card',
      documentNumber: 'DEMO-1',
      address: null,
      registeredAt: now.toISOString(),
      createdAt: now.toISOString(),
    });
    const proposed = await actions.propose(checkIn);
    expect(proposed.summary).toBe(
      'Check in Tomáš Novák to room 1, 2026-05-10 to 2026-05-12 (2 nights); 1 guest still needs an ID in the guest book',
    );
    await actions.confirm(proposed.id);
    expect(repos.state.bookings.find((b) => b.id === 'bk_today')?.status).toBe('checked_in');
  });

  it('proposes a check-out with what is still due', async () => {
    const { actions } = setup();
    const proposed = await actions.propose({
      kind: 'check_out',
      input: { bookingId: 'bk_leaving' },
    });
    expect(proposed.summary).toBe('Check out Tomáš Novák from room 2; 150 CZK still due');
  });

  it('can be rejected, and cannot be resolved twice', async () => {
    const { actions } = setup();
    const proposed = await actions.propose({
      kind: 'confirm_booking',
      input: { bookingId: 'bk_h' },
    });
    expect(proposed.summary).toBe(
      'Confirm Tomáš Novák in room 2, 2026-05-20 to 2026-05-22 (2 nights)',
    );
    expect((await actions.reject(proposed.id)).status).toBe('rejected');
    await expect(actions.confirm(proposed.id)).rejects.toMatchObject({
      code: 'invalid_transition',
    });
    await expect(actions.confirm('nope')).rejects.toMatchObject({ code: 'not_found' });
  });

  it('runs a change once when it is confirmed twice at the same time', async () => {
    const { repos, actions } = setup();
    const proposed = await actions.propose({
      kind: 'add_charge',
      input: {
        bookingId: 'bk_a',
        label: 'Sauna',
        quantity: 1,
        unitPrice: 150,
        vatBracket: 'standard',
      },
    });
    const results = await Promise.allSettled([
      actions.confirm(proposed.id),
      actions.confirm(proposed.id),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(repos.state.charges).toHaveLength(1);
    expect((await actions.get(proposed.id)).status).toBe('confirmed');
  });
});
