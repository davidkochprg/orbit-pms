import type { Season } from '@orbit/shared';

/**
 * What is set up once and seldom changed: the property, its rooms, the rules every quote reads and
 * the team. What guests are told is in Knowledge; the rate outlook is on Rates.
 */
export type SettingsSection = 'property' | 'rooms' | 'rates' | 'team';

export const settingsSections: { id: SettingsSection; label: string }[] = [
  { id: 'property', label: 'Property' },
  { id: 'rooms', label: 'Rooms' },
  { id: 'rates', label: 'Rates' },
  { id: 'team', label: 'Team' },
];

/** The Settings tabs that held policies, amenities and guest info, for links that still point there. */
export function isEntrySection(value: string | undefined): boolean {
  return value === 'policy' || value === 'amenity' || value === 'info';
}

export function isSettingsSection(value: string | undefined): value is SettingsSection {
  return settingsSections.some((s) => s.id === value);
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
