import { buildFolio, pricingConfig } from '@orbit/domain';
import { applySeed, buildSeed, createDb, createRepositories, createUsageStore } from '@orbit/db';
import type { ApiError, AuditLogEntry, Folio, Report } from '@orbit/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app';

// PGlite migrates and seeds in setup hooks; with every test file running in parallel that can
// take longer than Vitest's 10 s default.
const DB_SETUP_TIMEOUT = 60_000;

const today = '2026-10-27';
const now = new Date('2026-10-27T08:00:00Z');
const handle = createDb('memory://');
const seed = buildSeed(today, now, pricingConfig);
const app = createApp({
  repos: createRepositories(handle.db),
  ai: null,
  usage: createUsageStore(handle.db),
  clock: () => now,
});

beforeAll(() => handle.migrate(), DB_SETUP_TIMEOUT);
beforeEach(() => applySeed(handle.db, seed), DB_SETUP_TIMEOUT);
afterAll(() => handle.close());

async function call<T>(method: string, path: string, body?: unknown) {
  const res = await app.request(path, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
  return { status: res.status, body: (await res.json()) as T };
}

const leaving = seed.bookings.find((b) => b.checkOut === today && b.status === 'checked_in')!;
const hold = seed.bookings.find((b) => b.status === 'hold')!;

describe('folio', () => {
  it('returns the bill as the domain builds it', async () => {
    const { status, body } = await call<Folio>('GET', `/api/bookings/${leaving.id}/folio`);
    expect(status).toBe(200);
    expect(body).toEqual(
      buildFolio(
        leaving,
        seed.charges.filter((c) => c.bookingId === leaving.id),
        seed.payments.filter((p) => p.bookingId === leaving.id),
        seed.pricing,
      ),
    );
    expect(body.balance).toBeGreaterThan(0);
  });

  it('posts and removes an extra, auditing both on the booking', async () => {
    const before = await call<Folio>('GET', `/api/bookings/${leaving.id}/folio`);
    const added = await call<Folio>('POST', `/api/bookings/${leaving.id}/charges`, {
      label: 'Minibar',
      quantity: 2,
      unitPrice: 60,
    });
    expect(added.status).toBe(201);
    expect(added.body.balance).toBe(before.body.balance + 120);
    const chargeId = added.body.lines.at(-1)!.chargeId!;
    expect(added.body.lines.at(-1)).toMatchObject({ vatBracket: 'standard', vatRate: 21 });
    const edited = await call<Folio>('PATCH', `/api/bookings/${leaving.id}/charges/${chargeId}`, {
      quantity: 3,
      vatBracket: 'reduced',
    });
    expect(edited.status).toBe(200);
    expect(edited.body.lines.at(-1)).toMatchObject({ amount: 180, vatBracket: 'reduced' });
    expect(edited.body.vat.find((v) => v.bracket === 'reduced')?.rate).toBe(12);
    const empty = await call<ApiError>(
      'PATCH',
      `/api/bookings/${leaving.id}/charges/${chargeId}`,
      {},
    );
    expect(empty.status).toBe(400);
    const removed = await call<Folio>('DELETE', `/api/bookings/${leaving.id}/charges/${chargeId}`);
    expect(removed.body.balance).toBe(before.body.balance);
    const audit = await call<AuditLogEntry[]>(
      'GET',
      `/api/audit-log?subjectId=${leaving.id}&limit=3`,
    );
    expect(audit.body.map((e) => e.action)).toEqual([
      'folio.remove_charge',
      'folio.update_charge',
      'folio.charge',
    ]);
  });

  it('settles the balance with a payment', async () => {
    const { body: bill } = await call<Folio>('GET', `/api/bookings/${leaving.id}/folio`);
    const paid = await call<Folio>('POST', `/api/bookings/${leaving.id}/payments`, {
      method: 'card',
      amount: bill.balance,
    });
    expect(paid.status).toBe(201);
    expect(paid.body.balance).toBe(0);
    expect(paid.body.payments.at(-1)).toMatchObject({ kind: 'payment', paidOn: today });
  });

  it('answers 409 for a charge on a hold and 400 for a bad body', async () => {
    const charge = { label: 'Sauna', quantity: 1, unitPrice: 150 };
    const onHold = await call<ApiError>('POST', `/api/bookings/${hold.id}/charges`, charge);
    expect(onHold.status).toBe(409);
    expect(onHold.body.error.code).toBe('invalid_transition');
    const zero = await call('POST', `/api/bookings/${leaving.id}/charges`, {
      label: 'X',
      unitPrice: 0,
    });
    expect(zero.status).toBe(400);
    const refund = await call<ApiError>('POST', `/api/bookings/${leaving.id}/payments`, {
      kind: 'refund',
      method: 'cash',
      amount: 99_999_999,
    });
    expect(refund.status).toBe(400);
  });

  it('answers 404 for an unknown booking', async () => {
    expect((await call('GET', '/api/bookings/nope/folio')).status).toBe(404);
  });
});

describe('reports', () => {
  it('reports the last two weeks with consistent totals', async () => {
    const { status, body } = await call<Report>(
      'GET',
      '/api/reports?from=2026-10-13&to=2026-10-27',
    );
    expect(status).toBe(200);
    expect(body).toMatchObject({ nights: 14, rooms: 50, roomNightsAvailable: 700 });
    expect(body.occupancy).toBeGreaterThan(0.3);
    expect(body.days).toHaveLength(14);
    expect(body.days.reduce((sum, d) => sum + d.roomRevenue, 0)).toBe(body.roomRevenue);
    expect(body.payments.reduce((sum, p) => sum + p.amount, 0)).toBeGreaterThan(0);
  });

  it('answers 400 for a bad or reversed period', async () => {
    expect((await call('GET', '/api/reports?from=2026-10-27')).status).toBe(400);
    expect((await call('GET', '/api/reports?from=2026-10-27&to=2026-10-01')).status).toBe(400);
  });
});
