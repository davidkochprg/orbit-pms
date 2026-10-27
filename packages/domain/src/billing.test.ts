import type { Booking, Charge, Payment, Quote } from '@orbit/shared';
import { describe, expect, it } from 'vitest';
import {
  assertCanCharge,
  assertCanPay,
  buildFolio,
  cityTaxLine,
  cityTaxPayers,
  createBillingService,
} from './billing';
import { pricingConfig } from './pricing';
import { booking, double, room } from './test-fixtures';
import { createMemoryRepositories } from './testing';

const now = new Date('2026-05-11T08:00:00Z');
const pricing = { ...pricingConfig, cityTax: { perPersonPerNight: 50, minAge: 18 } };

const snapshot: Quote = {
  roomTypeId: double.id,
  checkIn: '2026-05-10',
  checkOut: '2026-05-13',
  nights: 3,
  adults: 2,
  childAges: [9],
  lines: [
    {
      kind: 'accommodation',
      label: 'Accommodation',
      quantity: 9,
      unitPrice: 1000,
      amount: 9000,
    },
    { kind: 'child_discount', label: 'Child', quantity: 3, unitPrice: -500, amount: -1500 },
  ],
  total: 7500,
  currency: 'CZK',
};

const stay: Booking = booking({
  id: 'bk_1',
  roomId: 'rm_1',
  childAges: [9],
  status: 'checked_in',
  priceSnapshot: snapshot,
});

function charge(overrides: Partial<Charge> = {}): Charge {
  return {
    id: 'chg_1',
    bookingId: 'bk_1',
    label: 'Sauna',
    quantity: 2,
    unitPrice: 150,
    amount: 300,
    postedOn: '2026-05-11',
    createdAt: now.toISOString(),
    ...overrides,
  };
}

function payment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: 'pay_1',
    bookingId: 'bk_1',
    kind: 'payment',
    method: 'card',
    amount: 2000,
    note: null,
    paidOn: '2026-05-10',
    createdAt: now.toISOString(),
    ...overrides,
  };
}

describe('cityTaxPayers and cityTaxLine', () => {
  it('counts adults and children from the minimum age', () => {
    expect(cityTaxPayers({ adults: 2, childAges: [3, 17] }, 18)).toBe(2);
    expect(cityTaxPayers({ adults: 2, childAges: [3, 17] }, 15)).toBe(3);
    expect(cityTaxPayers({ adults: 1, childAges: [0] }, 0)).toBe(2);
  });

  it('bills each paying guest per night', () => {
    expect(cityTaxLine(stay, pricing)).toEqual({
      kind: 'city_tax',
      label: 'City tax, 2 guests × 3 nights',
      quantity: 6,
      unitPrice: 50,
      amount: 300,
      chargeId: null,
    });
  });

  it('has no line when the rate is zero', () => {
    expect(cityTaxLine(stay, { ...pricing, cityTax: { perPersonPerNight: 0, minAge: 18 } })).toBe(
      null,
    );
  });
});

describe('buildFolio', () => {
  it('bills the stay verbatim, then city tax, then extras, minus payments and refunds', () => {
    const folio = buildFolio(
      stay,
      [charge()],
      [payment(), payment({ id: 'pay_2', kind: 'refund', amount: 500 })],
      pricing,
    );
    expect(folio.lines.map((l) => [l.kind, l.amount])).toEqual([
      ['stay', 9000],
      ['stay', -1500],
      ['city_tax', 300],
      ['extra', 300],
    ]);
    expect(folio.lines.at(-1)?.chargeId).toBe('chg_1');
    expect(folio).toMatchObject({ charged: 8100, paid: 1500, balance: 6600, currency: 'CZK' });
  });

  it('bills only extras on a cancelled booking, so payments show as owed back', () => {
    const folio = buildFolio({ ...stay, status: 'cancelled' }, [], [payment()], pricing);
    expect(folio.lines).toEqual([]);
    expect(folio.balance).toBe(-2000);
  });

  it('handles a booking without a recorded price', () => {
    const folio = buildFolio({ ...stay, priceSnapshot: null }, [], [], pricing);
    expect(folio.lines.map((l) => l.kind)).toEqual(['city_tax']);
  });
});

describe('assertCanCharge', () => {
  it('allows confirmed and in-house stays only', () => {
    expect(() => assertCanCharge({ ...stay, status: 'confirmed' })).not.toThrow();
    expect(() => assertCanCharge(stay)).not.toThrow();
    for (const status of ['hold', 'checked_out', 'cancelled'] as const) {
      expect(() => assertCanCharge({ ...stay, status })).toThrow();
    }
  });
});

describe('assertCanPay', () => {
  const folio = buildFolio(stay, [], [payment()], pricing);

  it('takes payments except on cancelled bookings', () => {
    const body = { kind: 'payment' as const, method: 'cash' as const, amount: 100, note: null };
    expect(() => assertCanPay({ ...stay, status: 'hold' }, folio, body)).not.toThrow();
    expect(() => assertCanPay({ ...stay, status: 'checked_out' }, folio, body)).not.toThrow();
    expect(() => assertCanPay({ ...stay, status: 'cancelled' }, folio, body)).toThrow(
      /only refunds/,
    );
  });

  it('refunds at most what was paid', () => {
    const refund = { kind: 'refund' as const, method: 'card' as const, amount: 2000, note: null };
    expect(() => assertCanPay(stay, folio, refund)).not.toThrow();
    expect(() => assertCanPay(stay, folio, { ...refund, amount: 2001 })).toThrow(/2000 CZK/);
  });
});

describe('createBillingService', () => {
  function setup() {
    const repos = createMemoryRepositories(
      {
        roomTypes: [double],
        rooms: [room('rm_1')],
        bookings: [stay, booking({ id: 'bk_hold', roomId: 'rm_1', status: 'hold' })],
      },
      () => now,
    );
    let n = 0;
    const billing = createBillingService({
      repos,
      pricing,
      clock: () => now,
      newId: (prefix) => `${prefix}_${++n}`,
    });
    return { repos, billing };
  }

  it('posts a charge on today and audits it on the booking', async () => {
    const { repos, billing } = setup();
    const folio = await billing.addCharge(
      'bk_1',
      { label: 'Minibar', quantity: 3, unitPrice: 60 },
      'user',
    );
    expect(folio.lines.at(-1)).toMatchObject({ label: 'Minibar', amount: 180 });
    expect(repos.state.charges[0]).toMatchObject({ postedOn: '2026-05-11', amount: 180 });
    expect(repos.state.audit[0]).toMatchObject({
      actor: 'user',
      action: 'folio.charge',
      subjectId: 'bk_1',
      payload: { label: 'Minibar', amount: 180 },
    });
  });

  it('removes a charge, but only from its own booking', async () => {
    const { repos, billing } = setup();
    const added = await billing.addCharge(
      'bk_1',
      { label: 'Sauna', quantity: 1, unitPrice: 150 },
      'user',
    );
    const chargeId = added.lines.at(-1)!.chargeId!;
    await expect(billing.removeCharge('bk_hold', chargeId, 'user')).rejects.toMatchObject({
      code: 'not_found',
    });
    const folio = await billing.removeCharge('bk_1', chargeId, 'user');
    expect(folio.lines.some((l) => l.kind === 'extra')).toBe(false);
    expect(repos.state.audit.map((e) => e.action)).toEqual(['folio.charge', 'folio.remove_charge']);
  });

  it('records payments and refunds and keeps the balance', async () => {
    const { repos, billing } = setup();
    await billing.recordPayment(
      'bk_1',
      { kind: 'payment', method: 'card', amount: 7800, note: null },
      'user',
    );
    const folio = await billing.recordPayment(
      'bk_1',
      { kind: 'refund', method: 'card', amount: 300, note: 'Sauna closed' },
      'agent',
    );
    expect(folio).toMatchObject({ charged: 7800, paid: 7500, balance: 300 });
    expect(repos.state.audit.map((e) => [e.actor, e.action])).toEqual([
      ['user', 'folio.payment'],
      ['agent', 'folio.refund'],
    ]);
  });

  it('previews a charge and a payment with the balance after, saving nothing', async () => {
    const { repos, billing } = setup();
    const c = await billing.previewCharge('bk_1', { label: 'Dinner', quantity: 2, unitPrice: 400 });
    expect(c.balanceAfter).toBe(7800 + 800);
    const p = await billing.previewPayment('bk_1', {
      kind: 'payment',
      method: 'cash',
      amount: 800,
      note: null,
    });
    expect(p.balanceAfter).toBe(7000);
    expect(repos.state.charges).toEqual([]);
    expect(repos.state.payments).toEqual([]);
  });

  it('refuses charges on a hold and leaves no trace', async () => {
    const { repos, billing } = setup();
    await expect(
      billing.addCharge('bk_hold', { label: 'Sauna', quantity: 1, unitPrice: 150 }, 'user'),
    ).rejects.toMatchObject({ code: 'invalid_transition' });
    expect(repos.state.charges).toEqual([]);
    expect(repos.state.audit).toEqual([]);
  });

  it('uses the saved city tax rate', async () => {
    const { repos, billing } = setup();
    await repos.settings.savePricing({
      ...pricing,
      cityTax: { perPersonPerNight: 30, minAge: 18 },
    });
    const folio = await billing.getFolio('bk_1');
    expect(folio.lines.find((l) => l.kind === 'city_tax')?.amount).toBe(180);
  });
});
