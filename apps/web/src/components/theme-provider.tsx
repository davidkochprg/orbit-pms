import { type ReactNode, useEffect, useMemo, useState } from 'react';
import {
  readStoredTheme,
  resolveDark,
  type Theme,
  ThemeContext,
  THEME_STORAGE_KEY,
} from '@/lib/theme';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () =>
      document.documentElement.classList.toggle('dark', resolveDark(theme, media.matches));
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);

  const value = useMemo(
    () => ({
      theme,
      setTheme: (next: Theme) => {
        try {
          localStorage.setItem(THEME_STORAGE_KEY, next);
        } catch {
          // Storage can be unavailable (private mode); the choice still applies for this visit.
        }
        setThemeState(next);
      },
    }),
    [theme],
  );

  return <ThemeContext value={value}>{children}</ThemeContext>;
}
