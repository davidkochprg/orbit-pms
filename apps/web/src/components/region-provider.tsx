import { Fragment, type ReactNode } from 'react';
import { useHealth, useHotelProfile, usePricing } from '@/lib/api';
import { type DisplayRegion, displayRegion, setDisplayRegion } from '@/lib/format';

/**
 * Sets how money, dates and times are written from the hotel's rates (currency), profile
 * (country) and the API's time zone, before anything below renders. A change remounts the
 * subtree once, so every amount and date is written the new way.
 */
export function RegionProvider({ children }: { children: ReactNode }) {
  const pricing = usePricing().data;
  const profile = useHotelProfile().data;
  const health = useHealth().data;
  const current = displayRegion();
  const next: DisplayRegion = {
    currency: pricing?.currency ?? current.currency,
    usDates: profile ? profile.country === 'US' : current.usDates,
    timeZone: health?.hotel.timezone ?? current.timeZone,
    perRoom: pricing ? pricing.pricingBasis === 'per_room' : current.perRoom,
    taxAdded: pricing ? pricing.tax.mode === 'exclusive' : current.taxAdded,
  };
  setDisplayRegion(next);
  return (
    <Fragment
      key={`${next.currency}:${next.usDates}:${next.timeZone}:${next.perRoom}:${next.taxAdded}`}
    >
      {children}
    </Fragment>
  );
}
