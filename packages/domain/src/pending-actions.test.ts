import { describe, expect, it } from 'vitest';
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
  return {
    repos,
    hotel,
    actions: createPendingActionService({ repos, hotel, clock: () => now, newId }),
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
});
