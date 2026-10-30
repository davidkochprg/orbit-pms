import { useEffect, useEffectEvent, useRef } from 'react';

/**
 * Calls `save` once `value` has stopped changing for `delay` ms, and right away when the
 * component goes, so nothing typed is lost. Nothing is saved until `enabled`. Values are
 * compared by content, so a new object with the same fields is no change.
 */
export function useAutosave<T>(value: T, save: (value: T) => void, enabled: boolean, delay = 800) {
  const key = JSON.stringify(value);
  const pending = useRef(false);
  const seen = useRef<string | null>(null);
  const flush = useEffectEvent(() => {
    pending.current = false;
    if (enabled) save(value);
  });

  useEffect(() => {
    // The first value is what was loaded, not a change.
    if (seen.current === null || seen.current === key) {
      seen.current = key;
      return;
    }
    seen.current = key;
    pending.current = true;
    const timer = setTimeout(flush, delay);
    return () => clearTimeout(timer);
  }, [key, delay]);

  useEffect(
    () => () => {
      if (pending.current) flush();
    },
    [],
  );
}
