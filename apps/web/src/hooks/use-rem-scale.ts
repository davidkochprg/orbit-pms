import { useSyncExternalStore } from 'react';

/** The root font size, which grows on wide windows (see index.css), as a factor of 16px. */
function read(): number {
  const size = parseFloat(getComputedStyle(document.documentElement).fontSize);
  return Number.isFinite(size) && size > 0 ? size / 16 : 1;
}

function subscribe(onChange: () => void) {
  window.addEventListener('resize', onChange);
  return () => window.removeEventListener('resize', onChange);
}

/** How much rem is scaled right now, for layouts measured in px that should grow with it. */
export function useRemScale(): number {
  return useSyncExternalStore(subscribe, read, () => 1);
}
