import { createContext, useContext } from 'react';
import { MINUTES_PER_DAY } from './daylight';

/** `daylight` follows the time of day: see lib/daylight.ts. */
export type Theme = 'light' | 'dark' | 'daylight' | 'system';

export const THEME_STORAGE_KEY = 'orbit-theme';
export const DAYLIGHT_TIME_STORAGE_KEY = 'orbit-daylight-time';

export interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  /** The minute of the day the daylight theme shows: the pinned time, or the clock. */
  daylightMinute: number;
  /** A time picked with the slider, or null to follow the clock. */
  pinnedMinute: number | null;
  setPinnedMinute: (minute: number | null) => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}

export function parseTheme(value: string | null): Theme {
  return value === 'light' || value === 'dark' || value === 'daylight' ? value : 'system';
}

export function parsePinnedMinute(value: string | null): number | null {
  if (value === null || value.trim() === '') return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n < MINUTES_PER_DAY ? n : null;
}

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStorage(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable (private mode); the choice still applies for this visit.
  }
}

export function readStoredTheme(): Theme {
  return parseTheme(readStorage(THEME_STORAGE_KEY));
}

export function readStoredPinnedMinute(): number | null {
  return parsePinnedMinute(readStorage(DAYLIGHT_TIME_STORAGE_KEY));
}

export function resolveDark(theme: Exclude<Theme, 'daylight'>, prefersDark: boolean): boolean {
  return theme === 'dark' || (theme === 'system' && prefersDark);
}
