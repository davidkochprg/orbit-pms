import type { StaffMember } from '@orbit/shared';
import { describe, expect, it } from 'vitest';
import { createBillingService } from './billing';
import { createContactService } from './contacts';
import { createGuestService } from './guests';
import { createInboxService } from './inbox-service';
import { createPendingActionService } from './pending-actions';
import { hotelPolicy } from './policy';
import { pricingConfig } from './pricing';
import { createRatesService } from './rates';
import { createSettingsService } from './settings';
import { createRegistrationService } from './registration';
import { createRevenueService } from './revenue-service';
import { createHotelService } from './service';
import { booking, czechProfile, double, plumber, room } from './test-fixtures';
import { conversation, createMemoryRepositories } from './testing';

const now = new Date('2026-05-10T08:00:00Z');

const manager: StaffMember = {
  id: 'stf_m',
  name: 'Test Manager',
  email: null,
  role: 'manager',
  language: 'en',
  active: true,
};
const receptionist: StaffMember = {
  ...manager,
  id: 'stf_r',
  name: 'Test Desk',
  role: 'receptionist',
};

function setup() {
  const repos = createMemoryRepositories(
    {
      profile: czechProfile,
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
  repos.state.profile = {
    ...czechProfile,
    entries: [{ id: 'spa', category: 'wellness', title: 'Spa', details: 'Open 16:00 to 21:00.' }],
  };
  repos.state.inquiries.push(
    conversation({
      id: 'inq_1',
      senderName: 'Ruth Example',
      senderAddress: 'ruth@example.com',
      body: 'A room for 2 adults, 25 to 27 May?',
      parsed: {
        kind: 'booking_request',
        language: 'en',
        guestName: 'Ruth Example',
        checkIn: '2026-05-25',
        checkOut: '2026-05-27',
        adults: 2,
        childAges: [],
        wishes: { wellness: false, dog: false, apartment: false },
        question: null,
      },
    }),
  );
  repos.state.events.push({
    id: 'evt_1',
    name: 'Jazz festival',
    firstNight: '2026-05-15',
    lastNight: '2026-05-16',
    impact: 'high',
  });
  repos.state.contacts.push(plumber);
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
  const registrations = createRegistrationService({
    repos,
    clock: () => now,
    newId,
  });
  const guests = createGuestService({ repos, newId });
  return {
    repos,
    hotel,
    billing,
    actions: createPendingActionService({
      repos,
      rates: createRatesService({ repos, defaults: pricingConfig, newId }),
      hotel,
      billing,
      registrations,
      guests,
      settings: createSettingsService({ repos, clock: () => now }),
      inbox: createInboxService({ repos, hotel, clock: () => now, newId }),
      events: createRevenueService({ repos, defaults: pricingConfig, clock: () => now, newId }),
      contacts: createContactService({ repos, clock: () => now, newId }),
      clock: () => now,
      newId,
    }),
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
    expect(action.details).toEqual({
      changes: [{ label: 'Room', before: { text: '1' }, after: { text: '2' } }],
      amount: null,
      note: null,
    });
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
      /^Update Tomáš Novák in room 1: party 2 adults → 1 adult, notes "Vegetarian breakfast", total 2 000 CZK \(was \?\)$/,
    );
    // The seeded booking has no price snapshot, so there is no total before.
    expect(proposed.details).toEqual({
      changes: [
        { label: 'Party', before: { text: '2 adults' }, after: { text: '1 adult' } },
        { label: 'Notes', before: null, after: { text: 'Vegetarian breakfast' } },
      ],
      amount: { label: 'Total', before: null, after: 2000 },
      note: null,
    });
    expect(repos.state.bookings.find((b) => b.id === 'bk_a')?.adults).toBe(2);
    await actions.confirm(proposed.id);
    expect(repos.state.bookings.find((b) => b.id === 'bk_a')).toMatchObject({
      adults: 1,
      notes: 'Vegetarian breakfast',
    });
    expect(repos.state.audit[0]).toMatchObject({ actor: 'agent', action: 'booking.update' });
  });

  it('proposes rate changes per night and applies them on confirm, as the agent', async () => {
    const { repos, actions } = setup();
    const action = await actions.propose({
      kind: 'adjust_rates',
      input: {
        nights: [
          { date: '2026-05-15', percent: 15 },
          { date: '2026-05-16', percent: 0 },
        ],
      },
    });
    // Saturday the 16th has no change to remove, so only Friday is in it.
    expect(action.summary).toBe('Change the rates of 1 night: Fri 2026-05-15 +15%');
    expect(action.details?.changes).toEqual([
      { label: 'Fri 2026-05-15', before: { text: 'Season rate' }, after: { text: '+15%' } },
    ]);
    expect(repos.state.pricing).toBeNull();
    const done = await actions.confirm(action.id);
    expect(done).toMatchObject({ status: 'confirmed', bookingId: null });
    expect(repos.state.pricing?.adjustments).toEqual([{ date: '2026-05-15', percent: 15 }]);
    expect(repos.state.audit.at(-1)).toMatchObject({ actor: 'agent', action: 'rates.adjust' });

    await expect(
      actions.propose({
        kind: 'adjust_rates',
        input: { nights: [{ date: '2026-05-15', percent: 15 }] },
      }),
    ).rejects.toThrow('already have these rates');
    await expect(
      actions.propose({
        kind: 'adjust_rates',
        input: { nights: [{ date: '2026-05-09', percent: 10 }] },
      }),
    ).rejects.toThrow('tonight or later');
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
      /^Hold room 2 for Jana Testová, 2026-05-11 to 2026-05-13 \(2 nights\), 2 adults, total [\d ]+ CZK$/,
    );
    expect(proposed.bookingId).toBeNull();
    expect(proposed.details?.changes).toEqual([
      { label: 'Guest', before: null, after: { text: 'Jana Testová' } },
      { label: 'Room', before: null, after: { text: '2' } },
      { label: 'Stay', before: null, after: { checkIn: '2026-05-11', checkOut: '2026-05-13' } },
      { label: 'Party', before: null, after: { text: '2 adults' } },
    ]);
    expect(proposed.details?.amount).toMatchObject({ label: 'Total', before: null });
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
    expect(proposed.details).toEqual({
      changes: [
        {
          label: 'Extra',
          before: null,
          after: { text: '2 × Sauna at 150 CZK (300 CZK), VAT 21%' },
        },
      ],
      amount: { label: 'Balance', before: 200, after: 500 },
      note: null,
    });
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
    expect(proposed.details).toEqual({
      changes: [{ label: 'Status', before: { text: 'Confirmed' }, after: { text: 'Checked in' } }],
      amount: null,
      note: '1 guest still needs an ID in the guest book',
    });
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
    expect(proposed.details).toMatchObject({
      amount: { label: 'Balance', before: null, after: 150 },
      note: '150 CZK still due.',
    });
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

  it('proposes correcting and removing a bill extra, and runs them on confirm', async () => {
    const { repos, billing, actions } = setup();
    const folio = await billing.addCharge(
      'bk_a',
      { label: 'Sauna', quantity: 1, unitPrice: 150, vatBracket: 'standard' },
      'user',
    );
    const chargeId = folio.lines.find((l) => l.kind === 'extra')!.chargeId!;
    const update = await actions.propose({
      kind: 'update_charge',
      input: { bookingId: 'bk_a', chargeId, quantity: 2 },
    });
    expect(update.summary).toBe(
      'Change Sauna on the bill of Tomáš Novák, room 1, to 2 × Sauna at 150 CZK (300 CZK), VAT 21% (was 1 × Sauna at 150 CZK (150 CZK), VAT 21%); balance then 500 CZK',
    );
    expect(repos.state.charges[0]?.quantity).toBe(1);
    await actions.confirm(update.id);
    expect(repos.state.charges[0]?.amount).toBe(300);

    await expect(
      actions.propose({
        kind: 'update_charge',
        input: { bookingId: 'bk_a', chargeId, quantity: 2 },
      }),
    ).rejects.toMatchObject({ code: 'invalid_input' });

    const remove = await actions.propose({
      kind: 'remove_charge',
      input: { bookingId: 'bk_a', chargeId },
    });
    expect(remove.summary).toBe(
      'Remove 2 × Sauna at 150 CZK (300 CZK), VAT 21% from the bill of Tomáš Novák, room 1; balance then 200 CZK',
    );
    await actions.confirm(remove.id);
    expect(repos.state.charges).toEqual([]);
    expect(repos.state.audit.slice(-2).map((e) => [e.actor, e.action])).toEqual([
      ['agent', 'folio.update_charge'],
      ['agent', 'folio.remove_charge'],
    ]);
  });

  it('proposes guest-book changes with the details, and runs them on confirm', async () => {
    const { repos, actions } = setup();
    const record = await actions.propose({
      kind: 'update_stay_guest',
      input: {
        bookingId: 'bk_a',
        stayGuestId: 'sg_bk_a',
        nationality: 'CZ',
        dateOfBirth: '1984-03-02',
        documentType: 'id_card',
        documentNumber: 'DEMO123',
      },
    });
    expect(record.summary).toBe(
      'Record in the guest book of room 1 for Tomáš Novák: nationality CZ, born 1984-03-02, ID card, document no. DEMO123',
    );
    expect(repos.state.stayGuests).toEqual([]);
    await actions.confirm(record.id);
    expect(repos.state.stayGuests[0]).toMatchObject({ id: 'sg_bk_a', documentNumber: 'DEMO123' });

    const add = await actions.propose({
      kind: 'add_stay_guest',
      input: { bookingId: 'bk_a', name: 'Demo Partner', nationality: 'SK' },
    });
    expect(add.summary).toBe(
      "Add Demo Partner to the guest book of room 1 (Tomáš Novák's booking): nationality SK",
    );
    await actions.confirm(add.id);
    const partner = repos.state.stayGuests.find((g) => g.name === 'Demo Partner')!;

    const remove = await actions.propose({
      kind: 'remove_stay_guest',
      input: { bookingId: 'bk_a', stayGuestId: partner.id },
    });
    expect(remove.summary).toBe(
      "Remove Demo Partner from the guest book of room 1 (Tomáš Novák's booking)",
    );
    await actions.confirm(remove.id);
    expect(repos.state.stayGuests.map((g) => g.id)).toEqual(['sg_bk_a']);
    expect(repos.state.audit.map((e) => [e.actor, e.action])).toEqual([
      ['agent', 'booking.update_guest'],
      ['agent', 'booking.add_guest'],
      ['agent', 'booking.remove_guest'],
    ]);
  });

  it('refuses a guest-book entry that the booking has no room for', async () => {
    const { actions } = setup();
    await actions.confirm(
      (
        await actions.propose({
          kind: 'add_stay_guest',
          input: { bookingId: 'bk_a', name: 'Demo Partner' },
        })
      ).id,
    );
    await expect(
      actions.propose({ kind: 'add_stay_guest', input: { bookingId: 'bk_a', name: 'One More' } }),
    ).rejects.toMatchObject({ code: 'over_capacity' });
  });

  it('proposes a guest profile edit, which belongs to no booking', async () => {
    const { repos, actions } = setup();
    const proposed = await actions.propose({
      kind: 'update_guest',
      input: { guestId: 'gst_1', email: 'tomas@example.com', language: 'en' },
    });
    expect(proposed).toMatchObject({ bookingId: null });
    expect(proposed.summary).toBe(
      'Update the profile of Tomáš Novák: email tomas@example.com, language en',
    );
    expect(proposed.details?.changes).toEqual([
      { label: 'Email', before: null, after: { text: 'tomas@example.com' } },
      { label: 'Language', before: { text: 'cs' }, after: { text: 'en' } },
    ]);
    const confirmed = await actions.confirm(proposed.id);
    expect(confirmed).toMatchObject({ status: 'confirmed', bookingId: null });
    expect(repos.state.guests[0]).toMatchObject({ email: 'tomas@example.com', language: 'en' });
    await expect(
      actions.propose({ kind: 'update_guest', input: { guestId: 'gst_1', language: 'en' } }),
    ).rejects.toMatchObject({ code: 'invalid_input' });
  });

  it('proposes saving a fact for guests, and saves it only on confirm', async () => {
    const { repos, actions } = setup();
    const proposed = await actions.propose({
      kind: 'save_hotel_info',
      input: {
        category: 'wellness',
        title: 'Sauna',
        details: 'Closed for repairs.',
        tags: ['sauna'],
        until: '2026-05-15',
        source: 'agent',
      },
    });
    expect(proposed.summary).toBe(
      'Save in Wellness: Sauna: Closed for repairs. (until 2026-05-15)',
    );
    expect(proposed.details?.changes).toEqual([
      { label: 'Wellness', before: null, after: { text: 'Sauna: Closed for repairs.' } },
      { label: 'Until', before: null, after: { text: '2026-05-15' } },
    ]);
    expect(proposed.bookingId).toBeNull();
    expect(repos.state.profile?.entries).toHaveLength(1);

    await actions.confirm(proposed.id);
    expect(repos.state.profile?.entries).toContainEqual(
      expect.objectContaining({ title: 'Sauna', tags: ['sauna'], until: '2026-05-15' }),
    );
  });

  it('proposes a reply to a conversation and sends it signed by whoever confirms', async () => {
    const { repos, actions } = setup();
    const proposed = await actions.propose({
      kind: 'send_reply',
      input: { inquiryId: 'inq_1', body: 'Dear Ruth, room 1 is free for you.' },
    });
    expect(proposed.summary).toBe('Reply to Ruth Example: "Dear Ruth, room 1 is free for you."');
    expect(repos.state.inquiries[0]?.messages).toHaveLength(1);
    await actions.confirm(proposed.id, receptionist);
    expect(repos.state.inquiries[0]?.messages.at(-1)).toMatchObject({
      direction: 'out',
      author: 'Test Desk',
      body: 'Dear Ruth, room 1 is free for you.',
    });
    expect(repos.state.audit.at(-1)).toMatchObject({ actor: 'agent', action: 'inquiry.replied' });
  });

  it('proposes a hold from a conversation, linked to it once confirmed', async () => {
    const { repos, actions } = setup();
    const proposed = await actions.propose({
      kind: 'hold_inquiry',
      input: { inquiryId: 'inq_1', roomId: 'rm_2' },
    });
    expect(proposed.summary).toMatch(/^Hold room 2 for Ruth Example, 2026-05-25 to 2026-05-27/);
    const confirmed = await actions.confirm(proposed.id);
    expect(confirmed.bookingId).toBeTruthy();
    expect(repos.state.inquiries[0]?.bookingId).toBe(confirmed.bookingId);
  });

  it('proposes declining a conversation, unless it led to a booking', async () => {
    const { repos, actions } = setup();
    const proposed = await actions.propose({
      kind: 'decline_inquiry',
      input: { inquiryId: 'inq_1' },
    });
    expect(proposed.details?.changes).toEqual([
      { label: 'Status', before: { text: 'New' }, after: { text: 'Declined' } },
    ]);
    await actions.confirm(proposed.id);
    expect(repos.state.inquiries[0]?.status).toBe('declined');
    repos.state.inquiries[0] = {
      ...repos.state.inquiries[0]!,
      bookingId: 'bk_a',
      status: 'converted',
    };
    await expect(
      actions.propose({ kind: 'decline_inquiry', input: { inquiryId: 'inq_1' } }),
    ).rejects.toMatchObject({ code: 'invalid_transition' });
  });

  it('proposes deleting a note by title', async () => {
    const { repos, actions } = setup();
    const proposed = await actions.propose({
      kind: 'remove_hotel_info',
      input: { title: 'spa' },
    });
    expect(proposed.summary).toBe('Delete from Wellness: Spa');
    await actions.confirm(proposed.id);
    expect(repos.state.profile?.entries).toEqual([]);
    await expect(
      actions.propose({ kind: 'remove_hotel_info', input: { title: 'Pool' } }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('adds and removes local events only when a manager confirms', async () => {
    const { repos, actions } = setup();
    const add = await actions.propose({
      kind: 'add_local_event',
      input: {
        name: 'Marathon',
        firstNight: '2026-06-01',
        lastNight: '2026-06-02',
        impact: 'medium',
      },
    });
    expect(add.details?.note).toBe('A manager has to confirm this.');
    expect(await actions.confirm(add.id, receptionist)).toMatchObject({ status: 'failed' });
    const again = await actions.propose({
      kind: 'add_local_event',
      input: {
        name: 'Marathon',
        firstNight: '2026-06-01',
        lastNight: '2026-06-02',
        impact: 'medium',
      },
    });
    await actions.confirm(again.id, manager);
    expect(repos.state.events.map((e) => e.name)).toEqual(['Jazz festival', 'Marathon']);
    expect(repos.state.audit.at(-1)).toMatchObject({ actor: 'agent', action: 'event.create' });

    const remove = await actions.propose({
      kind: 'remove_local_event',
      input: { eventId: 'evt_1' },
    });
    expect(remove.summary).toBe('Remove the local event Jazz festival, 2026-05-15 to 2026-05-16');
    await actions.confirm(remove.id, manager);
    expect(repos.state.events.map((e) => e.name)).toEqual(['Marathon']);
  });

  it('adds a contact in the hotel language and changes only what a later proposal sends', async () => {
    const { repos, actions } = setup();
    const add = await actions.propose({
      kind: 'save_contact',
      input: { contactId: null, name: 'Test Electric', trades: ['electrical'], phone: '555 0111' },
    });
    expect(add.summary).toBe('Add the contact Test Electric (electrical)');
    expect(add.details?.changes.map((c) => c.label)).toEqual(['Name', 'Does', 'Phone', 'Language']);
    await actions.confirm(add.id);
    const saved = repos.state.contacts.find((c) => c.name === 'Test Electric');
    expect(saved).toMatchObject({ trades: ['electrical'], phone: '555 0111', language: 'cs' });

    const edit = await actions.propose({
      kind: 'save_contact',
      input: { contactId: plumber.id, email: 'new@example.com' },
    });
    expect(edit.summary).toBe('Update the contact Test Plumbing: email');
    expect(edit.details?.changes).toEqual([
      {
        label: 'Email',
        before: { text: 'plumbing@example.com' },
        after: { text: 'new@example.com' },
      },
    ]);
    await actions.confirm(edit.id);
    expect(repos.state.contacts.find((c) => c.id === plumber.id)).toMatchObject({
      email: 'new@example.com',
      phone: plumber.phone,
    });
    expect(repos.state.audit.at(-1)).toMatchObject({ actor: 'agent', action: 'contact.update' });
  });

  it('rejects a contact proposal that changes nothing or has no trade', async () => {
    const { actions } = setup();
    await expect(
      actions.propose({
        kind: 'save_contact',
        input: { contactId: plumber.id, name: plumber.name },
      }),
    ).rejects.toThrow('Nothing about the contact changes');
    await expect(
      actions.propose({ kind: 'save_contact', input: { contactId: null, name: 'No trade' } }),
    ).rejects.toThrow('trades');
  });

  it('removes a contact once confirmed', async () => {
    const { repos, actions } = setup();
    const remove = await actions.propose({
      kind: 'remove_contact',
      input: { contactId: plumber.id },
    });
    expect(remove.summary).toBe('Delete the contact Test Plumbing');
    await actions.confirm(remove.id);
    expect(repos.state.contacts).toEqual([]);
  });

  it('proposes changing a room, showing only what changes, and checks the new name', async () => {
    const { repos, actions } = setup();
    const proposed = await actions.propose({
      kind: 'update_room',
      input: { roomId: 'rm_2', name: '2B', floor: 2 },
    });
    expect(proposed.details?.changes).toEqual([
      { label: 'Name', before: { text: '2' }, after: { text: '2B' } },
      { label: 'Floor', before: { text: '1' }, after: { text: '2' } },
    ]);
    await actions.confirm(proposed.id, manager);
    expect(repos.state.rooms.find((r) => r.id === 'rm_2')).toMatchObject({ name: '2B', floor: 2 });
    await expect(
      actions.propose({ kind: 'update_room', input: { roomId: 'rm_2', name: '1' } }),
    ).rejects.toMatchObject({ code: 'conflict' });
    await expect(
      actions.propose({ kind: 'update_room', input: { roomId: 'rm_2', name: '2B' } }),
    ).rejects.toMatchObject({ code: 'invalid_input' });
  });
});
