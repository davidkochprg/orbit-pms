import { conversation } from '@orbit/domain/testing';
import { currencySchema, type Inquiry, reportSchema } from '@orbit/shared';
import { describe, expect, it } from 'vitest';
import { callOptions, setup } from './test-setup';

/** The test hotel with a request from Ruth Example for 20 to 22 May, read, with room 201 on offer. */
async function withConversation(options: Parameters<typeof setup>[0] = {}) {
  const hotel = setup(options);
  const [option] = await hotel.hotel.roomOptions({
    checkIn: '2026-05-20',
    checkOut: '2026-05-22',
    adults: 2,
    childAges: [],
    addons: { wellness: false, dogs: 0, extraBeds: 0 },
  });
  const inquiry: Inquiry = conversation({
    id: 'inq_1',
    senderName: 'Ruth Example',
    senderAddress: 'ruth@example.com',
    body: 'Do you have a room for two, 20 to 22 May?',
    parsed: {
      kind: 'booking_request',
      language: 'en',
      guestName: 'Ruth Example',
      checkIn: '2026-05-20',
      checkOut: '2026-05-22',
      adults: 2,
      childAges: [],
      wishes: { wellness: false, dog: false, apartment: false },
      question: null,
    },
    status: 'quoted',
    suggestion: {
      options: [
        {
          roomId: option!.roomId,
          roomName: option!.roomName,
          roomTypeName: option!.roomType.name,
          kind: option!.kind,
          quote: option!.quote,
        },
      ],
      note: null,
      draft: null,
      draftLanguage: null,
      draftTranslation: null,
    },
  });
  hotel.repos.state.inquiries.push(inquiry);
  return { ...hotel, inquiry, total: option!.quote.total, roomId: option!.roomId };
}

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

  it('lists conversations and reads one with its rooms on offer', async () => {
    const { tools, total, roomId } = await withConversation();
    expect(
      await tools.listConversations.execute(
        { folder: 'inbox', unreadOnly: false, query: 'ruth' },
        callOptions,
      ),
    ).toEqual([
      expect.objectContaining({
        inquiryId: 'inq_1',
        senderName: 'Ruth Example',
        status: 'quoted',
        lastFrom: 'guest',
        request: { checkIn: '2026-05-20', checkOut: '2026-05-22', adults: 2, childAges: [] },
      }),
    ]);
    expect(
      await tools.listConversations.execute(
        { folder: 'inbox', unreadOnly: false, query: 'nobody' },
        callOptions,
      ),
    ).toEqual([]);
    expect(await tools.getConversation.execute({ inquiryId: 'inq_1' }, callOptions)).toMatchObject({
      messages: [{ from: 'guest', body: 'Do you have a room for two, 20 to 22 May?' }],
      roomOptions: [{ roomId, total }],
    });
  });

  it('proposes a reply only when every price in it was quoted', async () => {
    const { tools, repos, total } = await withConversation();
    const wrong = await tools.sendReply.execute(
      { inquiryId: 'inq_1', body: 'Room 201 is free for 999 CZK.' },
      callOptions,
    );
    expect(wrong).toMatchObject({ error: { code: 'unquoted_price' } });
    expect(repos.state.pendingActions).toEqual([]);
    const right = await tools.sendReply.execute(
      { inquiryId: 'inq_1', body: `Room 201 is free, ${total} CZK for both nights.` },
      callOptions,
    );
    expect(right).toMatchObject({ status: 'awaiting_confirmation' });
  });

  it('drafts a reply through the inbox pipeline, when there is one', async () => {
    const drafted = (i: Inquiry): Inquiry => ({
      ...i,
      suggestion: { ...i.suggestion!, draft: 'Dear Ruth, …', draftLanguage: 'en' },
    });
    const { tools, inquiry } = await withConversation({
      draftReply: () => Promise.resolve(drafted(inquiry)),
    });
    expect(await tools.draftReply.execute({ inquiryId: 'inq_1' }, callOptions)).toMatchObject({
      draft: 'Dear Ruth, …',
    });
    const { tools: off } = setup();
    expect(await off.draftReply.execute({ inquiryId: 'inq_1' }, callOptions)).toMatchObject({
      error: { code: 'not_configured' },
    });
  });

  it('proposes holding a room for a conversation and declining one', async () => {
    const { tools, repos, roomId } = await withConversation();
    await tools.holdFromConversation.execute({ inquiryId: 'inq_1', roomId }, callOptions);
    await tools.declineConversation.execute({ inquiryId: 'inq_1' }, callOptions);
    expect(repos.state.pendingActions.map((a) => a.kind)).toEqual([
      'hold_inquiry',
      'decline_inquiry',
    ]);
    expect(repos.state.bookings).toHaveLength(1);
  });

  it("reads who changed what, and a guest's stays", async () => {
    const { tools, hotel } = setup();
    await hotel.applyBookingAction('bk_1', 'cancel', 'user');
    expect(await tools.getActivity.execute({ subjectId: 'bk_1', limit: 20 }, callOptions)).toEqual([
      expect.objectContaining({ action: 'booking.cancel', subjectId: 'bk_1', by: 'staff' }),
    ]);
    expect(await tools.getGuest.execute({ guestId: 'gst_1' }, callOptions)).toMatchObject({
      name: 'Tomáš Novák',
      stays: [{ bookingId: 'bk_1', roomName: '104', status: 'cancelled' }],
    });
    expect(await tools.getGuest.execute({ guestId: 'gst_x' }, callOptions)).toMatchObject({
      error: { code: 'not_found' },
    });
  });

  it('proposes manager changes: local events and rooms', async () => {
    const { tools, repos } = setup();
    await tools.addLocalEvent.execute(
      { name: 'Marathon', firstNight: '2026-06-01', lastNight: '2026-06-01', impact: 'high' },
      callOptions,
    );
    await tools.updateRoom.execute({ roomId: 'rm_201', name: '201A' }, callOptions);
    expect(repos.state.pendingActions.map((a) => a.kind)).toEqual([
      'add_local_event',
      'update_room',
    ]);
    expect(repos.state.events).toEqual([]);
    expect(await tools.getLocalEvents.execute({}, callOptions)).toEqual([]);
  });

  it('finds who can fix a repair, records who was asked, and proposes contact changes', async () => {
    const { tools, repos } = setup();
    repos.state.contacts.push({
      id: 'ct_plumbing',
      name: 'Example Plumbing',
      person: null,
      trades: ['plumbing'],
      phone: '555 0142',
      email: null,
      language: 'cs',
      notes: null,
    });
    const created = await tools.createHousekeepingTask.execute(
      { roomId: 'rm_104', type: 'maintenance', notes: 'Tap is dripping', trade: 'plumbing' },
      callOptions,
    );
    const taskId = (created as { task: { id: string } }).task.id;
    expect(await tools.listContacts.execute({ trade: 'electrical' }, callOptions)).toEqual([]);
    expect(await tools.getRepair.execute({ taskId }, callOptions)).toMatchObject({
      roomName: '104',
      access: { guestName: 'Tomáš Novák', freeFrom: '2026-05-12', freeUntil: null },
      contacts: [{ id: 'ct_plumbing' }],
      contact: null,
    });
    expect(
      await tools.recordRepairContact.execute({ taskId, contactId: 'ct_plumbing' }, callOptions),
    ).toMatchObject({ done: true, roomName: '104', task: { contactId: 'ct_plumbing' } });
    expect(repos.state.audit.at(-1)).toMatchObject({ actor: 'agent', action: 'task.contact' });

    await tools.saveContact.execute(
      { contactId: null, name: 'Example Locks', trades: ['locks'] },
      callOptions,
    );
    await tools.removeContact.execute({ contactId: 'ct_plumbing' }, callOptions);
    expect(repos.state.pendingActions.map((a) => a.kind)).toEqual([
      'save_contact',
      'remove_contact',
    ]);
    expect(repos.state.contacts.map((c) => c.id)).toEqual(['ct_plumbing']);
  });

  it('files conversations by folder and label, and organizes them', async () => {
    const { tools, repos } = await withConversation();
    repos.state.labels.push({ id: 'lbl_1', name: 'Groups', color: 'blue' });
    expect(
      await tools.organizeConversations.execute(
        { inquiryIds: ['inq_1'], action: 'label', label: 'groups' },
        callOptions,
      ),
    ).toEqual({ done: true, action: 'label', conversations: ['inq_1'] });
    await tools.organizeConversations.execute(
      { inquiryIds: ['inq_1'], action: 'star' },
      callOptions,
    );
    expect(
      await tools.listConversations.execute(
        { folder: 'starred', label: 'Groups', unreadOnly: false },
        callOptions,
      ),
    ).toEqual([expect.objectContaining({ inquiryId: 'inq_1', starred: true, labels: ['Groups'] })]);
    await tools.organizeConversations.execute(
      { inquiryIds: ['inq_1'], action: 'trash' },
      callOptions,
    );
    expect(
      await tools.listConversations.execute({ folder: 'inbox', unreadOnly: false }, callOptions),
    ).toEqual([]);
    expect(
      await tools.organizeConversations.execute(
        { inquiryIds: ['inq_1'], action: 'label', label: 'Nope' },
        callOptions,
      ),
    ).toMatchObject({ error: { code: 'not_found' } });
  });
});
