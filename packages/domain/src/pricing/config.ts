export interface Season {
  name: string;
  /** First night of the season, `MM-DD`, inclusive. */
  from: string;
  /** Last night of the season, `MM-DD`, inclusive. May be earlier than `from` to wrap the new year. */
  to: string;
  /** Applied to the room type's per-person base price. */
  multiplier: number;
}

export interface ChildDiscountTier {
  /** Children up to and including this age get this tier. */
  maxAge: number;
  /** Fraction of the adult rate taken off: 1 = free, 0.5 = half price. */
  discount: number;
}

export interface LongStayTier {
  minNights: number;
  /** Fraction taken off accommodation (after child discounts). */
  discount: number;
}

export interface PricingConfig {
  /** Checked in order; the first season containing a night wins. Nights outside every season use multiplier 1. */
  seasons: Season[];
  /** Sorted by `maxAge` ascending. Children older than the last tier pay the adult rate. */
  childDiscounts: ChildDiscountTier[];
  /** The tier with the highest `minNights` the stay reaches applies. */
  longStay: LongStayTier[];
  wellness: { perPersonPerNight: number; minAge: number };
  extraBed: { perNight: number };
  dog: { perNight: number };
}

// TODO(David): replace every value below with the real numbers. These are placeholders.
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
};
