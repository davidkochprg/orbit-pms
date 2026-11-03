import { LoaderCircle, Smartphone } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { ErrorNotice } from '@/components/error-notice';
import { QrCode } from '@/components/qr-code';
import { ScanExpiry } from '@/components/scan-expiry';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useBillScan, useStartBillScan } from '@/lib/api';
import { billScanUrl } from '@/lib/invoices';
import { isLocalOnly } from '@/lib/scan';

/**
 * Photographing a paper bill with a phone: the desk shows a QR code, the phone takes the photo,
 * Orbit reads it, and `onRead` gets the new bill to check.
 */
export function BillScanDialog({
  open,
  onOpenChange,
  onRead,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRead: (billId: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="shadow-floating sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Scan a bill with a phone</DialogTitle>
        </DialogHeader>
        {open && <WaitForPhone onRead={onRead} />}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WaitForPhone({ onRead }: { onRead: (billId: string) => void }) {
  const start = useStartBillScan();
  const scan = useBillScan(start.data?.id ?? null);
  const { mutate } = start;
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    mutate();
  }, [mutate]);

  const billId = scan.data?.status === 'done' ? scan.data.supplierInvoiceId : null;
  useEffect(() => {
    if (billId) onRead(billId);
  }, [billId, onRead]);

  const url = start.data ? billScanUrl(window.location.origin, start.data.id) : null;
  const reading = scan.data?.status === 'reading';
  if (start.error) return <ErrorNotice message={start.error.message} />;
  // The link expired (or the scan is gone): offer a new one rather than waiting forever.
  if (scan.error) {
    return (
      <div className="flex flex-col items-start gap-3">
        <ErrorNotice message={scan.error.message} />
        <Button variant="outline" disabled={start.isPending} onClick={() => mutate()}>
          New code
        </Button>
      </div>
    );
  }
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex min-w-0 items-center gap-4 rounded-stage bg-surface-sunken p-3 ring-1 ring-ink/5 ring-inset">
        <div className="grid size-36 shrink-0 place-items-center">
          {url ? (
            <QrCode value={url} className="size-36" />
          ) : (
            <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-2 text-sm">
          <p className="flex items-center gap-2 font-medium">
            {reading ? (
              <>
                <LoaderCircle className="size-4 animate-spin text-primary-text" /> Reading the bill…
              </>
            ) : (
              <>
                <Smartphone className="size-4 text-muted-foreground" /> Waiting for the phone
              </>
            )}
          </p>
          <ScanExpiry expiresAt={start.data?.expiresAt ?? null} />
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="truncate font-mono text-xs text-primary-text underline-offset-4 hover:underline"
            >
              {url.replace(/^https?:\/\//, '')}
            </a>
          )}
        </div>
      </div>
      {isLocalOnly(window.location.hostname) && (
        <p className="text-xs text-muted-foreground">
          This screen runs on localhost, which a phone can&apos;t open. Start Orbit with{' '}
          <code className="font-mono">pnpm dev:lan</code> and open it by the computer&apos;s network
          address, or upload the file instead.
        </p>
      )}
      {scan.data?.status === 'failed' && scan.data.error && (
        <ErrorNotice message={scan.data.error} />
      )}
    </div>
  );
}
