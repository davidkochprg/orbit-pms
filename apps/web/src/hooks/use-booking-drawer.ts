import { useCallback } from 'react';
import { useSearchParams } from 'react-router';

const PARAM = 'booking';

/** The booking drawer is driven by `?booking=<id>`, so any page (or the agent) can open it by URL. */
export function useBookingDrawer() {
  const [params, setParams] = useSearchParams();
  const open = useCallback(
    (id: string) =>
      setParams((p) => {
        p.set(PARAM, id);
        return p;
      }),
    [setParams],
  );
  const close = useCallback(
    () =>
      setParams((p) => {
        p.delete(PARAM);
        return p;
      }),
    [setParams],
  );
  return { bookingId: params.get(PARAM), open, close };
}
