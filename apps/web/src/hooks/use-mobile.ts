import { useSyncExternalStore } from 'react';

// Below this the sidebar becomes a sheet: on a tablet it would leave pages too narrow to use.
const MOBILE_BREAKPOINT = 1024;
const query = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(query);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

export function useIsMobile() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
