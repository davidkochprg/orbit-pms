import { describe, expect, it } from 'vitest';
import { callOptions, setup } from './test-setup';

describe('agent tools', () => {
  it('finds a booking by guest name without accents', async () => {
    const { tools } = setup();
    const result = await tools.searchBookings.execute({ guestName: 'novak' }, callOptions);
    expect(result).toEqual([
      expect.objectContaining({ bookingId: 'bk_1', guestName: 'Tomáš Novák', roomName: '104' }),
    ]);
  });

  it('checks availability and quotes through the domain', async () => {
    const { tools } = setup();
    const rooms = await tools.checkAvailability.execute(
      { checkIn: '2026-05-10', checkOut: '2026-05-12', adults: 2, childAges: [] },
      callOptions,
    );
    expect(rooms).toEqual([expect.objectContaining({ roomId: 'rm_201', roomName: '201' })]);
    const quote = await tools.quote.execute(
      {
        roomId: 'rm_201',
        checkIn: '2026-05-10',
        checkOut: '2026-05-12',
        adults: 2,
        childAges: [],
        addons: { wellness: false, dogs: 0, extraBeds: 0 },
      },
      callOptions,
    );
    expect(quote).toMatchObject({ nights: 2, currency: 'CZK' });
  });

  it('proposes a move instead of executing it', async () => {
    const { tools, repos } = setup();
    const result = await tools.moveBooking.execute(
      { bookingId: 'bk_1', roomId: 'rm_201' },
      callOptions,
    );
    expect(result).toEqual({
      pendingActionId: repos.state.pendingActions[0]?.id,
      summary: 'Move Tomáš Novák (2026-05-10 to 2026-05-12 (2 nights)) from room 104 to room 201',
      status: 'awaiting_confirmation',
    });
    expect(repos.state.bookings[0]?.roomId).toBe('rm_104');
    expect(repos.state.pendingActions).toHaveLength(1);
  });

  it('proposes a hold for a new guest without creating anything', async () => {
    const { tools, repos } = setup();
    const result = await tools.createHold.execute(
      {
        guest: { name: 'Jana Testová', email: null, phone: null, language: 'cs' },
        roomId: 'rm_201',
        checkIn: '2026-05-10',
        checkOut: '2026-05-12',
        adults: 2,
        childAges: [],
        addons: { wellness: true, dogs: 0, extraBeds: 0 },
        source: 'email',
        notes: null,
        inquiryId: null,
      },
      callOptions,
    );
    expect(result).toMatchObject({ status: 'awaiting_confirmation' });
    expect(repos.state.bookings).toHaveLength(1);
    expect(repos.state.guests).toHaveLength(1);
  });

  it('proposes a booking edit without changing anything', async () => {
    const { tools, repos } = setup();
    const result = await tools.updateBooking.execute(
      { bookingId: 'bk_1', adults: 1, notes: 'Late arrival' },
      callOptions,
    );
    expect(result).toMatchObject({ status: 'awaiting_confirmation' });
    expect(repos.state.pendingActions[0]).toMatchObject({ kind: 'update_booking' });
    expect(repos.state.bookings.find((b) => b.id === 'bk_1')?.notes).toBeNull();
  });

  it('reports a period without the daily series', async () => {
    const { tools } = setup();
    const report = await tools.getReport.execute(
      { from: '2026-05-10', to: '2026-05-12' },
      callOptions,
    );
    expect(report).toMatchObject({ roomNightsSold: 2, roomNightsAvailable: 4, occupancy: 0.5 });
    expect(report).not.toHaveProperty('days');
  });

  it('reads a bill with city tax and the open balance', async () => {
    const { tools } = setup();
    const bill = await tools.getBill.execute({ bookingId: 'bk_1' }, callOptions);
    expect(bill).toMatchObject({
      bookingId: 'bk_1',
      lines: [expect.objectContaining({ kind: 'city_tax', amount: 200 })],
      balance: 200,
    });
  });

  it('proposes a charge and a payment instead of posting them', async () => {
    const { tools, repos } = setup();
    const charge = await tools.addCharge.execute(
      { bookingId: 'bk_1', label: 'Sauna', quantity: 2, unitPrice: 150 },
      callOptions,
    );
    expect(charge).toMatchObject({
      status: 'awaiting_confirmation',
      summary:
        'Add 2 × Sauna at 150 CZK (300 CZK) to the bill of Tomáš Novák, room 104; balance then 500 CZK',
    });
    const payment = await tools.recordPayment.execute(
      { bookingId: 'bk_1', kind: 'payment', method: 'cash', amount: 200, note: null },
      callOptions,
    );
    expect(payment).toMatchObject({ status: 'awaiting_confirmation' });
    expect(repos.state.charges).toEqual([]);
    expect(repos.state.payments).toEqual([]);
    expect(repos.state.pendingActions.map((a) => a.kind)).toEqual(['add_charge', 'record_payment']);
  });

  it('returns domain errors to the model as data', async () => {
    const { tools, repos } = setup();
    const result = await tools.moveBooking.execute(
      { bookingId: 'bk_1', roomId: 'rm_104' },
      callOptions,
    );
    expect(result).toEqual({
      error: { code: 'conflict', message: 'Booking is already in room 104' },
    });
    expect(repos.state.pendingActions).toEqual([]);
  });

  it('lists arrivals for today', async () => {
    const { tools } = setup();
    expect(await tools.getArrivals.execute({}, callOptions)).toEqual([
      expect.objectContaining({ bookingId: 'bk_1' }),
    ]);
  });

  it('returns the daily brief', async () => {
    const { tools } = setup();
    expect(await tools.getDailyBrief.execute({}, callOptions)).toEqual(
      expect.objectContaining({ date: '2026-05-10', arrivals: 1 }),
    );
  });
});
