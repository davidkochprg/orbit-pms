import { currencySchema, reportSchema } from '@orbit/shared';
import { describe, expect, it } from 'vitest';
import { callOptions, setup } from './test-setup';

describe('agent tools', () => {
  it('lists rooms with their type names, so a type the guest names can be found', async () => {
    const { tools } = setup();
    expect(await tools.listRooms.execute({}, callOptions)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'rm_104',
          roomTypeId: 'rt_double',
          roomTypeName: 'Double room',
        }),
      ]),
    );
  });

  it('finds a booking by guest name without accents', async () => {
    const { tools } = setup();
    const result = await tools.searchBookings.execute({ guestName: 'novak' }, callOptions);
    expect(result).toEqual([
      expect.objectContaining({ bookingId: 'bk_1', guestName: 'Tomáš Novák', roomName: '104' }),
    ]);
  });

  it('checks availability and quotes through the domain', async () => {
    const { tools } = setup();
    const input = {
      checkIn: '2026-05-10',
      checkOut: '2026-05-12',
      adults: 2,
      childAges: [],
      addons: { wellness: false, dogs: 0, extraBeds: 0 },
    };
    const rooms = await tools.checkAvailability.execute(input, callOptions);
    expect(rooms).toMatchObject([
      { roomId: 'rm_201', roomName: '201', quote: { nights: 2, currency: 'CZK' } },
    ]);
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

  it('gives the model each free room with its total, not the line items', async () => {
    const { tools } = setup();
    const input = {
      checkIn: '2026-05-10',
      checkOut: '2026-05-12',
      adults: 2,
      childAges: [],
      addons: { wellness: false, dogs: 0, extraBeds: 0 },
    };
    const output = await tools.checkAvailability.execute(input, callOptions);
    if (!Array.isArray(output)) throw new Error('expected free rooms');
    const forModel = await tools.checkAvailability.toModelOutput?.({
      toolCallId: 'call_1',
      input,
      output,
    });
    const { roomType } = output[0]!;
    expect(forModel).toEqual({
      type: 'json',
      value: [
        {
          roomId: 'rm_201',
          roomName: '201',
          kind: 'room',
          roomType: { id: roomType.id, name: roomType.name, description: roomType.description },
          nights: 2,
          total: output[0]!.quote.total,
          currency: 'CZK',
        },
      ],
    });
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

  it('reports a period, with the daily series for the app but not for the model', async () => {
    const { tools } = setup();
    const input = { from: '2026-05-10', to: '2026-05-12' };
    const report = await tools.getReport.execute(input, callOptions);
    expect(report).toMatchObject({ roomNightsSold: 2, roomNightsAvailable: 4, occupancy: 0.5 });
    expect(report).toHaveProperty('days', [
      expect.objectContaining({ date: '2026-05-10' }),
      expect.objectContaining({ date: '2026-05-11' }),
    ]);
    const forModel = await tools.getReport.toModelOutput?.({
      toolCallId: 'call_1',
      input,
      output: reportSchema.extend({ currency: currencySchema }).parse(report),
    });
    expect(forModel).toMatchObject({ type: 'json', value: { occupancy: 0.5, currency: 'CZK' } });
    expect((forModel as { value: object }).value).not.toHaveProperty('days');
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
      { bookingId: 'bk_1', label: 'Sauna', quantity: 2, unitPrice: 150, vatBracket: 'standard' },
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

  it('proposes a check-in, saying who still needs an ID', async () => {
    const { tools } = setup();
    const result = await tools.checkIn.execute({ bookingId: 'bk_1' }, callOptions);
    expect(JSON.stringify(result)).toMatch(/still needs? an ID in the guest book/);
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

  it('reads the guest book without document numbers or addresses', async () => {
    const { tools, repos } = setup();
    await repos.stayGuests.save({
      id: 'sg_bk_1',
      bookingId: 'bk_1',
      guestId: 'gst_1',
      name: 'Tomáš Novák',
      nationality: 'CZ',
      dateOfBirth: '1980-01-01',
      documentType: 'id_card',
      documentNumber: 'DEMO-SECRET-1',
      address: 'Demo Street 1',
      registeredAt: '2026-05-10T07:00:00.000Z',
      createdAt: '2026-05-10T07:00:00.000Z',
    });
    const book = await tools.getGuestBook.execute({ bookingId: 'bk_1' }, callOptions);
    expect(book).toMatchObject({
      partySize: 2,
      missing: 1,
      guests: [
        {
          stayGuestId: 'sg_bk_1',
          primary: true,
          hasDocumentNumber: true,
          hasAddress: true,
          missing: [],
        },
      ],
    });
    expect(JSON.stringify(book)).not.toMatch(/DEMO-SECRET-1|Demo Street/);
  });

  it('proposes guest-book, bill and profile changes without making them', async () => {
    const { tools, repos } = setup();
    const results = [
      await tools.updateGuestBook.execute(
        { bookingId: 'bk_1', stayGuestId: 'sg_bk_1', nationality: 'CZ' },
        callOptions,
      ),
      await tools.addToGuestBook.execute({ bookingId: 'bk_1', name: 'Demo Partner' }, callOptions),
      await tools.updateGuestProfile.execute(
        { guestId: 'gst_1', notes: 'Allergic to nuts' },
        callOptions,
      ),
    ];
    expect(results.map((r) => (r as { status: string }).status)).toEqual([
      'awaiting_confirmation',
      'awaiting_confirmation',
      'awaiting_confirmation',
    ]);
    expect(repos.state.stayGuests).toEqual([]);
    expect(repos.state.guests[0]?.notes).toBeNull();
    expect(
      await tools.removeCharge.execute({ bookingId: 'bk_1', chargeId: 'chg_nope' }, callOptions),
    ).toMatchObject({ error: { code: 'not_found' } });
  });

  it('changes room status and tasks straight away, logged as the agent', async () => {
    const { tools, repos } = setup();
    expect(
      await tools.setRoomStatus.execute({ roomId: 'rm_104', status: 'dirty' }, callOptions),
    ).toEqual({ done: true, roomId: 'rm_104', roomName: '104', from: 'clean', status: 'dirty' });
    const created = await tools.createHousekeepingTask.execute(
      { roomId: 'rm_201', type: 'maintenance', notes: 'Lamp broken' },
      callOptions,
    );
    expect(created).toMatchObject({
      done: true,
      roomName: '201',
      task: { roomId: 'rm_201', status: 'open' },
    });
    const taskId = repos.state.tasks[0]!.id;
    expect(
      await tools.setTaskStatus.execute({ taskId, status: 'done' }, callOptions),
    ).toMatchObject({
      done: true,
      roomName: '201',
      from: 'open',
      task: { id: taskId, status: 'done' },
    });
    expect(repos.state.tasks[0]?.status).toBe('done');
    expect(repos.state.pendingActions).toEqual([]);
    expect(repos.state.audit.map((e) => [e.actor, e.action])).toEqual([
      ['agent', 'room.status'],
      ['agent', 'task.create'],
      ['agent', 'task.status'],
    ]);
    const board = (await tools.getHousekeeping.execute({}, callOptions)) as {
      rooms: { roomId: string; status: string; guestName: string | null }[];
    };
    expect(board.rooms.find((r) => r.roomId === 'rm_104')).toMatchObject({
      status: 'dirty',
      guestName: 'Tomáš Novák',
      effort: expect.any(String) as string,
      cues: expect.any(Array) as string[],
    });
  });

  it('refuses a housekeeping change that breaks a rule, as data', async () => {
    const { tools, repos } = setup();
    await tools.setRoomStatus.execute({ roomId: 'rm_201', status: 'out_of_order' }, callOptions);
    expect(
      await tools.setRoomStatus.execute({ roomId: 'rm_201', status: 'clean' }, callOptions),
    ).toMatchObject({ error: { code: 'invalid_transition' } });
    expect(repos.state.rooms.find((r) => r.id === 'rm_201')?.status).toBe('out_of_order');
  });

  it('names the stays to move, with a free room each, when a room goes out of order', async () => {
    const { tools } = setup();
    const result = await tools.setRoomStatus.execute(
      { roomId: 'rm_104', status: 'out_of_order' },
      callOptions,
    );
    expect(result).toMatchObject({
      done: true,
      status: 'out_of_order',
      relocations: [{ bookingId: 'bk_1', toRoomId: 'rm_201', sameType: true }],
    });
  });

  it('proposes saving a fact about the hotel instead of saving it', async () => {
    const { tools, repos } = setup();
    const result = await tools.saveHotelInfo.execute(
      {
        category: 'wellness',
        title: 'Sauna',
        details: 'Closed for repairs.',
        tags: ['sauna'],
        until: '2026-05-15',
      },
      callOptions,
    );
    expect(result).toMatchObject({ status: 'awaiting_confirmation' });
    expect(repos.state.profile?.entries ?? []).toEqual([]);
  });
});
