import { useSyncExternalStore } from 'react';

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return () => observer.disconnect();
}

const isDark = () => document.documentElement.classList.contains('dark');

/** Whether the page is dark right now, whichever theme put it there (daylight flips at dusk). */
export function useDarkMode(): boolean {
  return useSyncExternalStore(subscribe, isDark, () => false);
}
