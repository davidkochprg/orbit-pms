import type { PricingConfig } from '@orbit/shared';

export type { ChildDiscountTier, LongStayTier, PricingConfig, Season } from '@orbit/shared';

/**
 * Pricing used until a manager saves rates in Settings; the demo seed stores it too.
 * TODO(David): replace every value below with the real numbers. These are placeholders.
 */
export const pricingConfig: PricingConfig = {
  seasons: [{ name: 'winter_peak', from: '12-20', to: '03-15', multiplier: 1.3 }],
  childDiscounts: [
    { maxAge: 2, discount: 1.0 },
    { maxAge: 11, discount: 0.5 },
  ],
  longStay: [
    { minNights: 5, discount: 0.1 },
    { minNights: 7, discount: 0.15 },
  ],
  wellness: { perPersonPerNight: 100, minAge: 0 }, // TODO(David)
  extraBed: { perNight: 100 }, // TODO(David)
  dog: { perNight: 100 }, // TODO(David)
  cityTax: { perPersonPerNight: 50, minAge: 18 }, // TODO(David)
  // Czech VAT since 2024: 21% standard, 12% reduced (accommodation, food).
  vat: { standard: 21, reduced: 12 },
};
