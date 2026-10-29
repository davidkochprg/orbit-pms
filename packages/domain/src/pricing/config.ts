import type { PricingConfig } from '@orbit/shared';

export type { ChildDiscountTier, LongStayTier, PricingConfig, Season } from '@orbit/shared';

/**
 * The Czech guesthouse's rates: prices per person in crowns, Czech VAT included. Used until a
 * manager saves rates in Settings, and by `SEED_REGION=cz`.
 * TODO(David): replace every value below with the real numbers. These are placeholders.
 */
export const pricingConfig: PricingConfig = {
  currency: 'CZK',
  pricingBasis: 'per_person',
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
  cityTax: { label: 'City tax', perPersonPerNight: 50, minAge: 18 }, // TODO(David)
  // Czech VAT since 2024: 21% standard, 12% reduced (accommodation, food).
  tax: {
    mode: 'inclusive',
    standard: { label: 'VAT', rate: 21 },
    reduced: { label: 'VAT', rate: 12 },
  },
  adjustments: [],
};

/**
 * The fictional US demo inn's rates: per room per night in dollars, with taxes added on top.
 * Illustrative values for the demo, not anyone's real rates: a 12% occupancy tax on lodging (as
 * many California cities charge) and an 8.75% sales tax on extras.
 */
export const usDemoPricing: PricingConfig = {
  currency: 'USD',
  pricingBasis: 'per_room',
  seasons: [{ name: 'summer', from: '06-15', to: '09-07', multiplier: 1.25 }],
  childDiscounts: [],
  longStay: [{ minNights: 7, discount: 0.1 }],
  wellness: { perPersonPerNight: 25, minAge: 16 },
  extraBed: { perNight: 30 },
  dog: { perNight: 35 },
  cityTax: { label: 'Tourism fee', perPersonPerNight: 0, minAge: 18 },
  tax: {
    mode: 'exclusive',
    standard: { label: 'Sales tax', rate: 8.75 },
    reduced: { label: 'Occupancy tax', rate: 12 },
  },
  adjustments: [],
};
