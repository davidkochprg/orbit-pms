import type { HotelInfoCategory, HotelInfoEntry, Season } from '@orbit/shared';

/** The hotel profile (property, policies, amenities, guest info), saved together, and the team. */
export type SettingsSection = 'property' | HotelInfoCategory | 'team';

export const settingsSections: { id: SettingsSection; label: string }[] = [
  { id: 'property', label: 'Property' },
  { id: 'policy', label: 'Policies' },
  { id: 'amenity', label: 'Amenities' },
  { id: 'info', label: 'Guest info' },
  { id: 'team', label: 'Team' },
];

export function isSettingsSection(value: string | undefined): value is SettingsSection {
  return settingsSections.some((s) => s.id === value);
}

/** The heading and title placeholder for each kind of entry. */
export const entryHints: Record<HotelInfoCategory, { title: string; example: string }> = {
  policy: {
    title: 'Policies',
    example: 'e.g. Quiet hours',
  },
  amenity: {
    title: 'Amenities',
    example: 'e.g. Sauna',
  },
  info: {
    title: 'Guest info',
    example: 'e.g. Getting here',
  },
};

/** A blank entry with an ID unique within the profile. */
export function newEntry(category: HotelInfoCategory, existing: HotelInfoEntry[]): HotelInfoEntry {
  const taken = new Set(existing.map((e) => e.id));
  let n = existing.length + 1;
  while (taken.has(`${category}-${n}`)) n++;
  return { id: `${category}-${n}`, category, title: '', details: '' };
}

/** Deep equality for plain JSON settings, e.g. a draft profile or rates against the saved ones. */
export function sameSettings<T>(a: T, b: T): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** A fraction as a whole-ish percent for an input, e.g. 0.15 → 15. */
export function toPercent(fraction: number): number {
  return Math.round(fraction * 1000) / 10;
}

/** A percent from an input as a fraction, e.g. 15 → 0.15. */
export function fromPercent(percent: number): number {
  return Math.round(percent * 10) / 1000;
}

/** A season multiplier as the surcharge staff think in, e.g. 1.3 → 30 (%), 0.9 → -10. */
export function toSurcharge(multiplier: number): number {
  return toPercent(multiplier - 1);
}

export function fromSurcharge(percent: number): number {
  return 1 + fromPercent(percent);
}

/** A new summer season with a name not used yet, valid as it is. */
export function newSeason(existing: Season[]): Season {
  const taken = new Set(existing.map((s) => s.name));
  let n = existing.length + 1;
  while (taken.has(`season_${n}`)) n++;
  return { name: `season_${n}`, from: '07-01', to: '08-31', multiplier: 1.1 };
}
