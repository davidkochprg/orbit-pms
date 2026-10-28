import type { Guest, IdentityFields, StayGuest } from '@orbit/shared';
import { describe, expect, it } from 'vitest';
import { hotelPolicy } from './policy';
import {
  ageOn,
  buildGuestBook,
  createRegistrationService,
  missingFields,
  primaryStayGuestId,
} from './registration';
import { booking } from './test-fixtures';
import { createMemoryRepositories } from './testing';

const now = new Date('2026-05-10T08:00:00Z');
const today = '2026-05-10';

const guest: Guest = {
  id: 'g',
  name: 'Test Guest',
  email: null,
  phone: null,
  language: 'de',
  notes: null,
};

const german: IdentityFields = {
  nationality: 'DE',
  dateOfBirth: '1985-03-14',
  documentType: 'passport',
  documentNumber: 'DEMO-4711',
  address: 'Teststraße 1, Testdorf',
};

const blank: IdentityFields = {
  nationality: null,
  dateOfBirth: null,
  documentType: null,
  documentNumber: null,
  address: null,
};

function stayGuest(overrides: Partial<StayGuest> & Pick<StayGuest, 'id' | 'bookingId'>): StayGuest {
  return {
    guestId: null,
    name: 'Demo Companion',
    ...blank,
    registeredAt: null,
    createdAt: now.toISOString(),
    ...overrides,
  };
}

describe('ageOn', () => {
  it('counts whole years, turning a year older on the birthday', () => {
    expect(ageOn('2011-05-10', '2026-05-10')).toBe(15);
    expect(ageOn('2011-05-11', '2026-05-10')).toBe(14);
    expect(ageOn('2008-02-29', '2026-02-28')).toBe(17);
  });
});

describe('missingFields', () => {
  it('is empty for a complete entry', () => {
    expect(missingFields(german, today, hotelPolicy)).toEqual([]);
  });

  it('lists everything for a blank entry, except an address it cannot know is needed', () => {
    expect(missingFields(blank, today, hotelPolicy)).toEqual([
      'nationality',
      'dateOfBirth',
      'documentType',
      'documentNumber',
    ]);
  });

  it('needs a home address only from guests from abroad', () => {
    expect(missingFields({ ...german, address: null }, today, hotelPolicy)).toEqual(['address']);
    expect(
      missingFields({ ...german, nationality: 'CZ', address: null }, today, hotelPolicy),
    ).toEqual([]);
  });

  it('needs no ID document under the minimum age, from the birthday on it does', () => {
    const child = { ...german, documentType: null, documentNumber: null };
    expect(missingFields({ ...child, dateOfBirth: '2011-05-11' }, today, hotelPolicy)).toEqual([]);
    expect(missingFields({ ...child, dateOfBirth: '2011-05-10' }, today, hotelPolicy)).toEqual([
      'documentType',
      'documentNumber',
    ]);
  });
});

describe('buildGuestBook', () => {
  const stay = booking({ id: 'bk', roomId: 'rm_1', guestId: 'g', adults: 2, childAges: [4] });

  it('starts with the main guest from their profile and counts people not added yet', () => {
    const book = buildGuestBook(stay, guest, [], null, today, hotelPolicy);
    expect(book.guests).toEqual([
      expect.objectContaining({
        id: primaryStayGuestId('bk'),
        name: 'Test Guest',
        guestId: 'g',
        primary: true,
        registeredAt: null,
      }),
    ]);
    expect(book).toMatchObject({ partySize: 3, missing: 3 });
  });

  it("takes the main guest's name from the profile, and lists companions oldest first", () => {
    const book = buildGuestBook(
      stay,
      guest,
      [
        stayGuest({ id: 'sg_2', bookingId: 'bk', createdAt: '2026-05-10T09:00:00.000Z' }),
        stayGuest({
          id: primaryStayGuestId('bk'),
          bookingId: 'bk',
          guestId: 'g',
          name: 'Old Name',
          ...german,
        }),
        stayGuest({
          id: 'sg_1',
          bookingId: 'bk',
          createdAt: '2026-05-10T08:30:00.000Z',
          ...german,
        }),
      ],
      null,
      today,
      hotelPolicy,
    );
    expect(book.guests.map((g) => [g.id, g.name, g.primary])).toEqual([
      ['sg_bk', 'Test Guest', true],
      ['sg_1', 'Demo Companion', false],
      ['sg_2', 'Demo Companion', false],
    ]);
    expect(book.missing).toBe(1);
  });
});

describe('createRegistrationService', () => {
  function setup() {
    const repos = createMemoryRepositories(
      {
        guests: [guest],
        bookings: [
          booking({
            id: 'past',
            roomId: 'rm_1',
            guestId: 'g',
            checkIn: '2026-01-02',
            checkOut: '2026-01-04',
            status: 'checked_out',
          }),
          booking({ id: 'now', roomId: 'rm_1', guestId: 'g', status: 'confirmed', adults: 2 }),
          booking({ id: 'gone', roomId: 'rm_2', guestId: 'g', status: 'cancelled' }),
        ],
        idScans: [
          {
            id: 'scan_1',
            bookingId: 'now',
            stayGuestId: null,
            status: 'done',
            result: null,
            error: null,
            readingSince: null,
            createdAt: now.toISOString(),
            expiresAt: '2026-05-10T08:15:00.000Z',
          },
        ],
      },
      () => now,
    );
    let n = 0;
    const service = createRegistrationService({
      repos,
      policy: hotelPolicy,
      clock: () => now,
      newId: (prefix) => `${prefix}_${++n}`,
    });
    return { repos, service };
  }

  it("records the main guest's ID and audits the fields without their values", async () => {
    const { repos, service } = setup();
    const book = await service.updateGuest('now', 'sg_now', german, 'user');
    expect(book.guests[0]).toMatchObject({
      ...german,
      missing: [],
      registeredAt: now.toISOString(),
    });
    expect(repos.state.stayGuests).toHaveLength(1);
    expect(repos.state.audit).toEqual([
      expect.objectContaining({
        action: 'booking.update_guest',
        subjectId: 'now',
        payload: { stayGuestId: 'sg_now', fields: Object.keys(german) },
      }),
    ]);
  });

  it('clears a field with null and keeps the rest', async () => {
    const { service } = setup();
    await service.updateGuest('now', 'sg_now', german, 'user');
    const book = await service.updateGuest('now', 'sg_now', { address: null }, 'user');
    expect(book.guests[0]).toMatchObject({
      nationality: 'DE',
      address: null,
      missing: ['address'],
    });
  });

  it("refuses to rename the main guest here: that's their profile", async () => {
    const { service } = setup();
    await expect(
      service.updateGuest('now', 'sg_now', { name: 'Someone Else' }, 'user'),
    ).rejects.toMatchObject({ code: 'invalid_input' });
  });

  it('adds companions up to the party size and removes them, but not the main guest', async () => {
    const { repos, service } = setup();
    const book = await service.addGuest('now', { name: 'Demo Partner' }, 'user');
    expect(book.guests.map((g) => g.name)).toEqual(['Test Guest', 'Demo Partner']);
    expect(book.guests[1]).toMatchObject({ registeredAt: null, primary: false });
    await expect(service.addGuest('now', { name: 'One Too Many' }, 'user')).rejects.toMatchObject({
      code: 'over_capacity',
    });
    await expect(service.removeGuest('now', 'sg_now', 'user')).rejects.toMatchObject({
      code: 'invalid_input',
    });
    const after = await service.removeGuest('now', 'sg_1', 'user');
    expect(after.guests).toHaveLength(1);
    expect(repos.state.audit.map((e) => e.action)).toEqual([
      'booking.add_guest',
      'booking.remove_guest',
    ]);
  });

  it('discards the ID scan its details came from', async () => {
    const { repos, service } = setup();
    await service.addGuest('now', { name: 'Demo Partner', ...german, scanId: 'scan_1' }, 'user');
    expect(repos.state.idScans).toEqual([]);
    expect(repos.state.stayGuests[0]).not.toHaveProperty('scanId');
    expect(repos.state.audit[0]?.payload).toMatchObject({ scanned: true });
  });

  it("leaves another booking's scan alone", async () => {
    const { repos, service } = setup();
    await service.updateGuest('past', 'sg_past', { nationality: 'DE', scanId: 'scan_1' }, 'user');
    expect(repos.state.idScans.map((s) => s.id)).toEqual(['scan_1']);
    expect(repos.state.audit[0]?.payload).not.toHaveProperty('scanned');
  });

  it("suggests the guest's details from an earlier stay to prefill", async () => {
    const { repos, service } = setup();
    expect((await service.getGuestBook('now')).previous).toBe(null);
    await repos.stayGuests.save(
      stayGuest({
        id: 'sg_past',
        bookingId: 'past',
        guestId: 'g',
        ...german,
        registeredAt: '2026-01-02T15:00:00.000Z',
      }),
    );
    expect((await service.getGuestBook('now')).previous).toEqual(german);
  });

  it('refuses a birth date that is not in the past, a cancelled stay and unknown ones', async () => {
    const { repos, service } = setup();
    await expect(
      service.updateGuest('now', 'sg_now', { dateOfBirth: today }, 'user'),
    ).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(service.updateGuest('gone', 'sg_gone', german, 'user')).rejects.toMatchObject({
      code: 'invalid_transition',
    });
    await expect(service.updateGuest('now', 'sg_nope', german, 'user')).rejects.toMatchObject({
      code: 'not_found',
    });
    await expect(service.getGuestBook('nope')).rejects.toMatchObject({ code: 'not_found' });
    expect(repos.state.stayGuests).toEqual([]);
    expect(repos.state.audit).toEqual([]);
  });
});
