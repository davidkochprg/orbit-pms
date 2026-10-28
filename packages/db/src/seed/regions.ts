import { pricingConfig, usDemoPricing } from '@orbit/domain';
import type { HotelProfile, PricingConfig, RoomType, StaffMember } from '@orbit/shared';
import type { SeedExtra } from './billing';
import { czechRoomTypes, usRoomTypes } from './catalog';
import { czechHotelProfile, usHotelProfile } from './hotel';
import { czechStaff, usStaff } from './staff';

/**
 * Where the demo hotel is. `us` is the fictional Sierra Nevada lodge the hackathon demo shows
 * (dollars, taxes added on top, per-room rates); `cz` is the Czech guesthouse Orbit was built
 * for (crowns, VAT included, per-person rates). The guests are multinational either way.
 */
export const seedRegions = ['us', 'cz'] as const;
export type SeedRegion = (typeof seedRegions)[number];

export interface RegionSeed {
  hotelProfile: HotelProfile;
  pricing: PricingConfig;
  roomTypes: RoomType[];
  staff: StaffMember[];
  extras: SeedExtra[];
  /** The IANA time zone to run the API in (`HOTEL_TIMEZONE`). */
  timezone: string;
}

export const regionSeeds: Record<SeedRegion, RegionSeed> = {
  us: {
    hotelProfile: usHotelProfile,
    pricing: usDemoPricing,
    roomTypes: usRoomTypes,
    staff: usStaff,
    // Illustrative prices for the fictional lodge. Late check-out is part of the stay (lodging).
    extras: [
      { label: 'Spa access', unitPrice: 25, vatBracket: 'standard', perAdult: true },
      { label: 'Minibar', unitPrice: 8, vatBracket: 'standard', max: 4 },
      { label: 'Dinner', unitPrice: 38, vatBracket: 'standard', perAdult: true },
      { label: 'Bike rental', unitPrice: 30, vatBracket: 'standard', max: 2 },
      { label: 'Late check-out', unitPrice: 40, vatBracket: 'reduced', max: 1 },
    ],
    timezone: 'America/Los_Angeles',
  },
  cz: {
    hotelProfile: czechHotelProfile,
    pricing: pricingConfig,
    roomTypes: czechRoomTypes,
    staff: czechStaff,
    // Placeholders, like the rates. Food and late check-out are reduced-rate VAT in Czechia.
    extras: [
      { label: 'Sauna', unitPrice: 150, vatBracket: 'standard', perAdult: true },
      { label: 'Minibar', unitPrice: 60, vatBracket: 'standard', max: 4 },
      { label: 'Dinner', unitPrice: 450, vatBracket: 'reduced', perAdult: true },
      { label: 'Bike rental', unitPrice: 300, vatBracket: 'standard', max: 2 },
      { label: 'Late check-out', unitPrice: 400, vatBracket: 'reduced', max: 1 },
    ],
    timezone: 'Europe/Prague',
  },
};

export function parseSeedRegion(value: string | undefined): SeedRegion {
  const region = (value ?? 'us').toLowerCase();
  if ((seedRegions as readonly string[]).includes(region)) return region as SeedRegion;
  throw new Error(`SEED_REGION must be one of ${seedRegions.join(', ')}`);
}
