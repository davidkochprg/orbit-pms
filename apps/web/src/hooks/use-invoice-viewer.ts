import { useCallback } from 'react';
import { useSearchParams } from 'react-router';

const PARAM = 'invoice';

/** An issued document opens over any page from `?invoice=<id>`, like the booking drawer. */
export function useInvoiceViewer() {
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
  return { invoiceId: params.get(PARAM), open, close };
}
