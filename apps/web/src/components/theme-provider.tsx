import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { useClockMinute } from '@/hooks/use-clock-minute';
import { daylightAt, glowColor } from '@/lib/daylight';
import {
  DAYLIGHT_TIME_STORAGE_KEY,
  readStoredPinnedMinute,
  readStoredTheme,
  resolveDark,
  type Theme,
  ThemeContext,
  THEME_STORAGE_KEY,
  writeStorage,
} from '@/lib/theme';

const DAYLIGHT_VARS = ['--night', '--glow'] as const;

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);
  const [pinnedMinute, setPinnedState] = useState<number | null>(readStoredPinnedMinute);
  const clockMinute = useClockMinute(theme === 'daylight' && pinnedMinute === null);
  const daylightMinute = pinnedMinute ?? clockMinute;

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'daylight') {
      // Inline variables beat the .dark class; the CSS fades --night when it flips.
      const { night, glow } = daylightAt(daylightMinute);
      root.dataset.theme = 'daylight';
      root.style.setProperty('--night', String(night));
      root.style.setProperty('--glow', glowColor(glow));
      root.style.colorScheme = night ? 'dark' : 'light';
      root.classList.toggle('dark', night === 1);
      return;
    }
    delete root.dataset.theme;
    for (const name of DAYLIGHT_VARS) root.style.removeProperty(name);
    root.style.removeProperty('color-scheme');
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => root.classList.toggle('dark', resolveDark(theme, media.matches));
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme, daylightMinute]);

  const value = useMemo(
    () => ({
      theme,
      setTheme: (next: Theme) => {
        writeStorage(THEME_STORAGE_KEY, next);
        setThemeState(next);
      },
      daylightMinute,
      pinnedMinute,
      setPinnedMinute: (minute: number | null) => {
        writeStorage(DAYLIGHT_TIME_STORAGE_KEY, minute === null ? null : String(minute));
        setPinnedState(minute);
      },
    }),
    [theme, daylightMinute, pinnedMinute],
  );

  return <ThemeContext value={value}>{children}</ThemeContext>;
}
