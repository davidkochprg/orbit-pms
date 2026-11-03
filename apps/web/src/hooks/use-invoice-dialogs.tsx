import type { InvoiceView } from '@orbit/shared';
import { useState } from 'react';
import { EmailInvoiceDialog, VoidInvoiceDialog } from '@/components/invoice-dialogs';
import { useInvoiceViewer } from '@/hooks/use-invoice-viewer';
import type { InvoiceHandlers } from '@/lib/invoices';

/** The dialogs a list of documents opens, and the handlers that open them. */
export function useInvoiceDialogs() {
  const [emailing, setEmailing] = useState<InvoiceView | null>(null);
  const [voiding, setVoiding] = useState<InvoiceView | null>(null);
  const { open } = useInvoiceViewer();
  const on: InvoiceHandlers = { view: open, email: setEmailing, void: setVoiding };
  return {
    on,
    dialogs: (
      <>
        <EmailInvoiceDialog invoice={emailing} onClose={() => setEmailing(null)} />
        <VoidInvoiceDialog invoice={voiding} onClose={() => setVoiding(null)} />
      </>
    ),
  };
}
