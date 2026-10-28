import { describe, expect, it } from 'vitest';
import { DomainError } from '../errors';
import { apartment, double } from '../test-fixtures';
import { pricingConfig, type PricingConfig } from './config';
import { childTier, quote, seasonFor } from './quote';

// Fixed test config so tests don't depend on the placeholder values in config.ts.
const config: PricingConfig = {
  currency: 'CZK',
  pricingBasis: 'per_person',
  seasons: [
    { name: 'christmas', from: '12-24', to: '12-26', multiplier: 2 },
    { name: 'winter_peak', from: '12-20', to: '03-15', multiplier: 1.5 },
  ],
  childDiscounts: [
    { maxAge: 2, discount: 1 },
    { maxAge: 11, discount: 0.5 },
  ],
  longStay: [
    { minNights: 5, discount: 0.1 },
    { minNights: 7, discount: 0.2 },
  ],
  wellness: { perPersonPerNight: 300, minAge: 6 },
  extraBed: { perNight: 400 },
  dog: { perNight: 250 },
  cityTax: { label: 'City tax', perPersonPerNight: 50, minAge: 18 },
  tax: {
    mode: 'inclusive',
    standard: { label: 'VAT', rate: 21 },
    reduced: { label: 'VAT', rate: 12 },
  },
};

const base = {
  roomType: double,
  checkIn: '2026-05-10',
  checkOut: '2026-05-12',
  adults: 2,
  childAges: [],
};

describe('quote', () => {
  it('prices adults per person per night off season', () => {
    const q = quote(base, config);
    expect(q.nights).toBe(2);
    expect(q.lines).toEqual([
      {
        kind: 'accommodation',
        label: 'Accommodation, 2 guests × 2 nights (standard)',
        quantity: 4,
        unitPrice: 1000,
        amount: 4000,
      },
    ]);
    expect(q.total).toBe(4000);
    expect(q.currency).toBe('CZK');
  });

  it('splits nights across a season boundary', () => {
    // Nights of Dec 18, 19 are standard; Dec 20 starts winter peak.
    const q = quote({ ...base, checkIn: '2026-12-18', checkOut: '2026-12-21' }, config);
    expect(q.lines.map((l) => [l.quantity, l.unitPrice])).toEqual([
      [4, 1000],
      [2, 1500],
    ]);
    expect(q.total).toBe(7000);
  });

  it('treats the last night of a season as in season and check-out day as irrelevant', () => {
    // Winter peak ends with the night of Mar 15.
    const q = quote({ ...base, checkIn: '2027-03-15', checkOut: '2027-03-17' }, config);
    expect(q.lines.map((l) => [l.label, l.unitPrice])).toEqual([
      ['Accommodation, 2 guests × 1 night (winter peak)', 1500],
      ['Accommodation, 2 guests × 1 night (standard)', 1000],
    ]);
  });

  it('handles seasons that wrap the new year', () => {
    expect(seasonFor('2026-12-31', config)?.name).toBe('winter_peak');
    expect(seasonFor('2027-01-15', config)?.name).toBe('winter_peak');
    expect(seasonFor('2026-06-01', config)).toBeUndefined();
  });

  it('lets the first matching season win', () => {
    expect(seasonFor('2026-12-25', config)?.name).toBe('christmas');
  });

  it('applies child discount tiers by age, inclusive of maxAge', () => {
    const q = quote(
      { ...base, roomType: { ...double, maxChildren: 2 }, adults: 1, childAges: [2, 11, 12] },
      config,
    );
    expect(q.lines.filter((l) => l.kind === 'child_discount')).toEqual([
      {
        kind: 'child_discount',
        label: 'Child discount 100% (age ≤ 2), 1 child × 2 nights (standard)',
        quantity: 2,
        unitPrice: -1000,
        amount: -2000,
      },
      {
        kind: 'child_discount',
        label: 'Child discount 50% (age ≤ 11), 1 child × 2 nights (standard)',
        quantity: 2,
        unitPrice: -500,
        amount: -1000,
      },
    ]);
    // 4 guests × 2 nights × 1000, minus 2000 (infant free) and 1000 (half price); the 12-year-old pays full.
    expect(q.total).toBe(5000);
  });

  it('maps ages to tiers', () => {
    expect(childTier(0, config)?.discount).toBe(1);
    expect(childTier(3, config)?.discount).toBe(0.5);
    expect(childTier(12, config)).toBeUndefined();
  });

  it('applies no long-stay discount below the first threshold', () => {
    const q = quote({ ...base, checkOut: '2026-05-14' }, config);
    expect(q.lines.some((l) => l.kind === 'long_stay_discount')).toBe(false);
  });

  it('applies the long-stay tier at exactly minNights', () => {
    const q = quote({ ...base, checkOut: '2026-05-15' }, config);
    expect(q.nights).toBe(5);
    expect(q.lines.at(-1)).toMatchObject({ kind: 'long_stay_discount', amount: -1000 });
    expect(q.total).toBe(9000);
  });

  it('uses the highest long-stay tier reached', () => {
    const q = quote({ ...base, checkOut: '2026-05-17' }, config);
    expect(q.lines.at(-1)).toMatchObject({
      label: 'Long-stay discount 20% (7+ nights)',
      amount: -2800,
    });
  });

  it('discounts accommodation after child discounts but not add-ons', () => {
    const q = quote(
      { ...base, checkOut: '2026-05-15', childAges: [5], addons: { dogs: 1 } },
      { ...config, seasons: [] },
    );
    // 3 guests × 5 nights × 1000 = 15000, child half price -2500 → 12500, 10% → -1250.
    expect(q.lines.find((l) => l.kind === 'long_stay_discount')?.amount).toBe(-1250);
    expect(q.lines.find((l) => l.kind === 'dog')?.amount).toBe(1250);
    expect(q.total).toBe(12500 - 1250 + 1250);
  });

  it('adds wellness only for guests at or above the minimum age', () => {
    const q = quote({ ...base, childAges: [5], addons: { wellness: true } }, config);
    expect(q.lines.find((l) => l.kind === 'wellness')).toEqual({
      kind: 'wellness',
      label: 'Wellness, 2 guests × 2 nights',
      quantity: 4,
      unitPrice: 300,
      amount: 1200,
    });
  });

  it('adds extra beds and dogs per night', () => {
    const q = quote({ ...base, adults: 3, addons: { extraBeds: 1, dogs: 2 } }, config);
    expect(q.lines.find((l) => l.kind === 'extra_bed')?.amount).toBe(800);
    expect(q.lines.find((l) => l.kind === 'dog')?.amount).toBe(1000);
  });

  it('rejects parties that do not fit the room type', () => {
    expect(() => quote({ ...base, adults: 3 }, config)).toThrow(DomainError);
    expect(() =>
      quote({ ...base, roomType: apartment, adults: 4, childAges: [3, 5] }, config),
    ).not.toThrow();
  });

  it('rejects invalid ranges', () => {
    expect(() => quote({ ...base, checkOut: base.checkIn }, config)).toThrow(DomainError);
  });

  it('always returns integer amounts that sum to the total', () => {
    const q = quote(
      {
        ...base,
        roomType: { ...double, basePrice: 999 },
        childAges: [1],
        checkIn: '2026-12-18',
        checkOut: '2026-12-27',
        addons: { wellness: true },
      },
      { ...config, seasons: [{ name: 'odd', from: '12-20', to: '12-31', multiplier: 1.333 }] },
    );
    for (const l of q.lines) expect(Number.isInteger(l.amount)).toBe(true);
    expect(q.total).toBe(q.lines.reduce((s, l) => s + l.amount, 0));
  });
});

describe('pricingConfig', () => {
  it('keeps child tiers sorted by age', () => {
    const ages = pricingConfig.childDiscounts.map((t) => t.maxAge);
    expect(ages).toEqual([...ages].sort((a, b) => a - b));
  });

  it('uses MM-DD season bounds', () => {
    for (const s of pricingConfig.seasons) {
      expect(s.from).toMatch(/^\d{2}-\d{2}$/);
      expect(s.to).toMatch(/^\d{2}-\d{2}$/);
    }
  });
});

describe('quote labels', () => {
  it('says children, not childs', () => {
    const q = quote(
      {
        roomType: apartment,
        checkIn: '2026-06-01',
        checkOut: '2026-06-03',
        adults: 2,
        childAges: [5, 7],
      },
      config,
    );
    expect(q.lines.find((l) => l.kind === 'child_discount')?.label).toBe(
      'Child discount 50% (age ≤ 11), 2 children × 2 nights (standard)',
    );
  });

  it('prices the room, not each guest, with per-room rates, in their currency', () => {
    const perRoom: PricingConfig = { ...config, currency: 'USD', pricingBasis: 'per_room' };
    const q = quote(
      {
        roomType: double,
        checkIn: '2026-05-04',
        checkOut: '2026-05-06',
        adults: 2,
        childAges: [1],
        addons: { wellness: true },
      },
      perRoom,
    );
    expect(q.currency).toBe('USD');
    expect(q.lines.map((l) => [l.kind, l.label, l.quantity, l.unitPrice])).toEqual([
      ['accommodation', 'Room, 2 nights (standard)', 2, double.basePrice],
      // Wellness stays per person; the baby is under its minimum age.
      ['wellness', 'Wellness, 2 guests × 2 nights', 4, config.wellness.perPersonPerNight],
    ]);
  });
});
