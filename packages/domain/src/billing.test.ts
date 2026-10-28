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
const pricing = {
  ...pricingConfig,
  cityTax: { label: 'City tax', perPersonPerNight: 50, minAge: 18 },
};

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
    vatBracket: 'standard',
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
      vatBracket: 'none',
      vatRate: 0,
      chargeId: null,
    });
  });

  it('has no line when the rate is zero', () => {
    expect(
      cityTaxLine(stay, {
        ...pricing,
        cityTax: { label: 'City tax', perPersonPerNight: 0, minAge: 18 },
      }),
    ).toBe(null);
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

  it('puts accommodation in the reduced bracket and sums VAT per bracket', () => {
    const folio = buildFolio(stay, [charge()], [], pricing);
    expect(folio.lines.map((l) => [l.vatBracket, l.vatRate])).toEqual([
      ['reduced', 12],
      ['reduced', 12],
      ['none', 0],
      ['standard', 21],
    ]);
    // 7500 at 12%: 7500 × 12 / 112 = 803.57 → 804. 300 at 21%: 52.07 → 52.
    expect(folio.vat).toEqual([
      { bracket: 'standard', label: 'VAT', rate: 21, gross: 300, net: 248, vat: 52 },
      { bracket: 'reduced', label: 'VAT', rate: 12, gross: 7500, net: 6696, vat: 804 },
      { bracket: 'none', label: null, rate: 0, gross: 300, net: 300, vat: 0 },
    ]);
  });

  it('rounds the VAT of a discount like a charge, and leaves empty brackets out', () => {
    const discount = charge({ quantity: 1, unitPrice: -150, amount: -150 });
    const folio = buildFolio({ ...stay, priceSnapshot: null }, [discount], [], {
      ...pricing,
      cityTax: { label: 'City tax', perPersonPerNight: 0, minAge: 18 },
    });
    // -150 × 21 / 121 = -26.03 → -26.
    expect(folio.vat).toEqual([
      { bracket: 'standard', label: 'VAT', rate: 21, gross: -150, net: -124, vat: -26 },
    ]);
  });

  it('has no VAT when the hotel is not a VAT payer', () => {
    const folio = buildFolio(stay, [charge()], [], {
      ...pricing,
      tax: {
        mode: 'inclusive',
        standard: { label: 'VAT', rate: 0 },
        reduced: { label: 'VAT', rate: 0 },
      },
    });
    expect(folio.vat.every((v) => v.vat === 0 && v.net === v.gross)).toBe(true);
  });

  it('adds tax on top per bracket when prices are before tax, US style', () => {
    const folio = buildFolio(
      { ...stay, priceSnapshot: { ...snapshot, currency: 'USD' } },
      [charge()],
      [],
      {
        ...pricing,
        currency: 'USD',
        cityTax: { label: 'Tourism fee', perPersonPerNight: 0, minAge: 18 },
        tax: {
          mode: 'exclusive',
          standard: { label: 'Sales tax', rate: 8.75 },
          reduced: { label: 'Occupancy tax', rate: 12 },
        },
      },
    );
    // Lodging 7500 × 12% = 900; extras 300 × 8.75% = 26.25 → 26.
    expect(folio.lines.filter((l) => l.kind === 'tax').map((l) => [l.label, l.amount])).toEqual([
      ['Sales tax 8.75%', 26],
      ['Occupancy tax 12%', 900],
    ]);
    expect(folio.vat).toEqual([
      { bracket: 'standard', label: 'Sales tax', rate: 8.75, gross: 326, net: 300, vat: 26 },
      { bracket: 'reduced', label: 'Occupancy tax', rate: 12, gross: 8400, net: 7500, vat: 900 },
    ]);
    expect(folio).toMatchObject({ charged: 8726, taxMode: 'exclusive', currency: 'USD' });
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
    expect(() => assertCanPay(stay, folio, { ...refund, amount: 2001 })).toThrow(/2 000 CZK/);
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
      { label: 'Minibar', quantity: 3, unitPrice: 60, vatBracket: 'standard' },
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
      { label: 'Sauna', quantity: 1, unitPrice: 150, vatBracket: 'standard' },
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

  it('edits a charge in place, recomputing the amount, and audits what changed', async () => {
    const { repos, billing } = setup();
    const added = await billing.addCharge(
      'bk_1',
      { label: 'Wine', quantity: 1, unitPrice: 300, vatBracket: 'standard' },
      'user',
    );
    const chargeId = added.lines.at(-1)!.chargeId!;
    const folio = await billing.updateCharge(
      'bk_1',
      chargeId,
      { quantity: 2, vatBracket: 'reduced' },
      'user',
    );
    expect(folio.lines.at(-1)).toMatchObject({
      label: 'Wine',
      quantity: 2,
      amount: 600,
      vatBracket: 'reduced',
      vatRate: 12,
    });
    expect(repos.state.charges[0]).toMatchObject({ amount: 600, vatBracket: 'reduced' });
    expect(repos.state.audit.at(-1)).toMatchObject({
      action: 'folio.update_charge',
      payload: { chargeId, amount: 600, changed: ['quantity', 'vatBracket'] },
    });
  });

  it('refuses to edit a charge of another booking or a closed bill', async () => {
    const { repos, billing } = setup();
    const added = await billing.addCharge(
      'bk_1',
      { label: 'Wine', quantity: 1, unitPrice: 300, vatBracket: 'standard' },
      'user',
    );
    const chargeId = added.lines.at(-1)!.chargeId!;
    await expect(
      billing.updateCharge('bk_hold', chargeId, { quantity: 2 }, 'user'),
    ).rejects.toMatchObject({ code: 'not_found' });
    repos.state.bookings = repos.state.bookings.map((b) =>
      b.id === 'bk_1' ? { ...b, status: 'checked_out' } : b,
    );
    await expect(
      billing.updateCharge('bk_1', chargeId, { quantity: 2 }, 'user'),
    ).rejects.toMatchObject({ code: 'invalid_transition' });
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
    const c = await billing.previewCharge('bk_1', {
      label: 'Dinner',
      quantity: 2,
      unitPrice: 400,
      vatBracket: 'standard',
    });
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
      billing.addCharge(
        'bk_hold',
        { label: 'Sauna', quantity: 1, unitPrice: 150, vatBracket: 'standard' },
        'user',
      ),
    ).rejects.toMatchObject({ code: 'invalid_transition' });
    expect(repos.state.charges).toEqual([]);
    expect(repos.state.audit).toEqual([]);
  });

  it('counts the tax a new extra adds when tax goes on top', async () => {
    const { repos, billing } = setup();
    await repos.settings.savePricing({
      ...pricing,
      tax: {
        mode: 'exclusive',
        standard: { label: 'Sales tax', rate: 10 },
        reduced: { label: 'Occupancy tax', rate: 12 },
      },
    });
    const before = await billing.getFolio('bk_1');
    const preview = await billing.previewCharge('bk_1', {
      label: 'Wine',
      quantity: 1,
      unitPrice: 200,
      vatBracket: 'standard',
    });
    // 200 plus 10% sales tax.
    expect(preview.balanceAfter).toBe(before.balance + 220);
  });

  it('uses the saved city tax rate', async () => {
    const { repos, billing } = setup();
    await repos.settings.savePricing({
      ...pricing,
      cityTax: { label: 'City tax', perPersonPerNight: 30, minAge: 18 },
    });
    const folio = await billing.getFolio('bk_1');
    expect(folio.lines.find((l) => l.kind === 'city_tax')?.amount).toBe(180);
  });
});
