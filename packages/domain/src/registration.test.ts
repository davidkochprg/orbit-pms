import type { RegistrationBody } from '@orbit/shared';
import { describe, expect, it } from 'vitest';
import { assertCanRegister, createRegistrationService } from './registration';
import { booking } from './test-fixtures';
import { createMemoryRepositories } from './testing';

const now = new Date('2026-05-10T08:00:00Z');
const body: RegistrationBody = {
  nationality: 'DE',
  dateOfBirth: '1985-03-14',
  documentType: 'passport',
  documentNumber: 'DEMO-4711',
  address: 'Teststraße 1, Testdorf',
};

function setup() {
  const repos = createMemoryRepositories(
    {
      bookings: [
        booking({
          id: 'past',
          roomId: 'rm_1',
          guestId: 'g',
          checkIn: '2026-01-02',
          checkOut: '2026-01-04',
          status: 'checked_out',
        }),
        booking({ id: 'now', roomId: 'rm_1', guestId: 'g', status: 'confirmed' }),
        booking({ id: 'gone', roomId: 'rm_2', guestId: 'g', status: 'cancelled' }),
      ],
    },
    () => now,
  );
  return { repos, service: createRegistrationService({ repos, clock: () => now }) };
}

describe('assertCanRegister', () => {
  const b = booking({ roomId: 'rm_1' });

  it('accepts confirmed and in-house stays with a past date of birth', () => {
    expect(() => assertCanRegister(b, body, '2026-05-10')).not.toThrow();
    expect(() =>
      assertCanRegister({ ...b, status: 'checked_in' }, body, '2026-05-10'),
    ).not.toThrow();
  });

  it('rejects other statuses and a birth date that is not in the past', () => {
    expect(() => assertCanRegister({ ...b, status: 'hold' }, body, '2026-05-10')).toThrow(
      /hold booking/,
    );
    expect(() =>
      assertCanRegister(b, { ...body, dateOfBirth: '2026-05-10' }, '2026-05-10'),
    ).toThrow(/in the past/);
  });
});

describe('createRegistrationService', () => {
  it('registers a stay and audits it without the personal data', async () => {
    const { repos, service } = setup();
    const saved = await service.register('now', body, 'user');
    expect(saved).toEqual({
      ...body,
      bookingId: 'now',
      guestId: 'g',
      registeredAt: now.toISOString(),
    });
    expect(repos.state.audit).toEqual([
      expect.objectContaining({
        action: 'booking.register',
        subjectId: 'now',
        payload: { nationality: 'DE' },
      }),
    ]);
    await service.register('now', { ...body, documentNumber: 'DEMO-4712' }, 'user');
    expect(repos.state.registrations).toHaveLength(1);
    expect(repos.state.audit[1]?.action).toBe('booking.update_registration');
  });

  it("suggests the guest's earlier registration to prefill", async () => {
    const { repos, service } = setup();
    expect(await service.getView('now')).toEqual({ registration: null, previous: null });
    await repos.registrations.save({
      ...body,
      bookingId: 'past',
      guestId: 'g',
      registeredAt: '2026-01-02T15:00:00.000Z',
    });
    expect(await service.getView('now')).toEqual({ registration: null, previous: body });
  });

  it('refuses a cancelled stay and an unknown booking, saving nothing', async () => {
    const { repos, service } = setup();
    await expect(service.register('gone', body, 'user')).rejects.toMatchObject({
      code: 'invalid_transition',
    });
    await expect(service.register('nope', body, 'user')).rejects.toMatchObject({
      code: 'not_found',
    });
    expect(repos.state.registrations).toEqual([]);
    expect(repos.state.audit).toEqual([]);
  });
});
