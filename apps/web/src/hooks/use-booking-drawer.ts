import { useCallback } from 'react';
import { useSearchParams } from 'react-router';

const PARAM = 'booking';
const INTENT = 'intent';

/** What the inspector should start with, e.g. the check-in flow from a context menu. */
export type BookingDrawerIntent = 'check-in';

/** The booking drawer is driven by `?booking=<id>`, so any page (or the agent) can open it by URL. */
export function useBookingDrawer() {
  const [params, setParams] = useSearchParams();
  const open = useCallback(
    (id: string, intent?: BookingDrawerIntent) =>
      setParams((p) => {
        p.set(PARAM, id);
        if (intent) p.set(INTENT, intent);
        else p.delete(INTENT);
        return p;
      }),
    [setParams],
  );
  const close = useCallback(
    () =>
      setParams((p) => {
        p.delete(PARAM);
        p.delete(INTENT);
        return p;
      }),
    [setParams],
  );
  const clearIntent = useCallback(
    () =>
      setParams(
        (p) => {
          p.delete(INTENT);
          return p;
        },
        { replace: true },
      ),
    [setParams],
  );
  return {
    bookingId: params.get(PARAM),
    intent: params.get(INTENT) === 'check-in' ? ('check-in' as const) : null,
    open,
    close,
    clearIntent,
  };
}
