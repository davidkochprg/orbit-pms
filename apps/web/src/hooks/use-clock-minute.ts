import { useEffect, useState } from 'react';
import { minuteOfDay } from '@/lib/daylight';

/** The current local minute of the day, refreshed every 30 seconds while `enabled`. */
export function useClockMinute(enabled: boolean): number {
  const [minute, setMinute] = useState(() => minuteOfDay(new Date()));
  useEffect(() => {
    if (!enabled) return;
    const tick = () => setMinute(minuteOfDay(new Date()));
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [enabled]);
  return minute;
}
