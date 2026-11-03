import { useCallback } from 'react';
import { useSearchParams } from 'react-router';

const PARAM = 'guest';

/**
 * The guest drawer is driven by `?guest=<id>`, like the booking inspector, so any page (or the
 * agent) can open a guest where it is. One drawer shows at a time: opening a guest closes the
 * booking, and opening one of their bookings closes the guest.
 */
export function useGuestDrawer() {
  const [params, setParams] = useSearchParams();
  const open = useCallback(
    (id: string) =>
      setParams((p) => {
        p.set(PARAM, id);
        p.delete('booking');
        p.delete('intent');
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
  const openBooking = useCallback(
    (bookingId: string) =>
      setParams((p) => {
        p.delete(PARAM);
        p.set('booking', bookingId);
        return p;
      }),
    [setParams],
  );
  return { guestId: params.get(PARAM), open, close, openBooking };
}

/** A link to a guest's drawer from anywhere: the guests list with the guest open. */
export function guestHref(id: string): string {
  return `/guests?${PARAM}=${encodeURIComponent(id)}`;
}
