/** Facts about the property that the agent may tell guests. Injected into prompts, never inlined. */
export interface HotelProfile {
  name: string;
  location: string;
  checkInFrom: string;
  checkOutBy: string;
  currency: 'CZK';
  /** Short house rules and policies, one per line. */
  policies: string[];
}

// TODO(David): replace with the real property details and policies.
export const hotelProfile: HotelProfile = {
  name: 'Orbit Demo Penzion',
  location: 'Jizera Mountains, Czech Republic',
  checkInFrom: '15:00',
  checkOutBy: '10:00',
  currency: 'CZK',
  policies: [
    'Dogs are welcome in apartments for a nightly fee.',
    'Wellness (sauna, whirlpool) is bookable per guest per night.',
    'Holds are kept for 48 hours, then released.',
    'Children under 3 stay free; older children get a discount by age.',
  ],
};
