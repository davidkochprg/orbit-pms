import type { InvoiceView } from '@orbit/shared';
import { useState } from 'react';
import { EmailInvoiceDialog, VoidInvoiceDialog } from '@/components/invoice-dialogs';

/** The dialogs a list of documents opens, and the handlers that open them. */
export function useInvoiceDialogs() {
  const [emailing, setEmailing] = useState<InvoiceView | null>(null);
  const [voiding, setVoiding] = useState<InvoiceView | null>(null);
  return {
    on: { email: setEmailing, void: setVoiding },
    dialogs: (
      <>
        <EmailInvoiceDialog invoice={emailing} onClose={() => setEmailing(null)} />
        <VoidInvoiceDialog invoice={voiding} onClose={() => setVoiding(null)} />
      </>
    ),
  };
}
