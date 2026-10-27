import type { HotelInfoCategory, HotelInfoEntry, HotelProfile } from '@orbit/shared';

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

/** What each kind of entry is for, shown above its list. */
export const entryHints: Record<
  HotelInfoCategory,
  { title: string; hint: string; example: string }
> = {
  policy: {
    title: 'Policies',
    hint: 'House rules guests should know before they book: pets, children, cancellation, payment, quiet hours.',
    example: 'e.g. Quiet hours',
  },
  amenity: {
    title: 'Amenities',
    hint: 'Facilities and services, with opening hours and how to book them.',
    example: 'e.g. Sauna',
  },
  info: {
    title: 'Guest info',
    hint: 'Everything else guests ask about: directions, reception hours, what is nearby.',
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

export function sameProfile(a: HotelProfile, b: HotelProfile): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
