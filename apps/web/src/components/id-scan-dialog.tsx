import type { DocumentType, IdScanResult, StayGuestView } from '@orbit/shared';
import { AlertTriangle, Camera, LoaderCircle, Smartphone, Upload } from 'lucide-react';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { ErrorNotice } from '@/components/error-notice';
import { FormField } from '@/components/form-field';
import { QrCode } from '@/components/qr-code';
import { Segmented } from '@/components/segmented';
import { DatePicker } from '@/components/ui/date-picker';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  useAddStayGuest,
  useHealth,
  useHotelProfile,
  useIdScan,
  useStartIdScan,
  useUpdateStayGuest,
  useUploadIdPhoto,
} from '@/lib/api';
import { hotelTodayIso } from '@/lib/format';
import { prepareIdPhoto } from '@/lib/photo';
import { countrySuggestions, documentTypeLabels, needsAddress } from '@/lib/registration';
import { SuggestInput } from '@/components/ui/suggest-input';
import { isLocalOnly, scanUrl } from '@/lib/scan';

interface Props {
  bookingId: string;
  /** The person to scan for, or null to add a companion from the scan. */
  stayGuest: StayGuestView | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Scans an ID with a phone: the desk shows a QR code, the phone photographs the document, Muse
 * reads it and the desk reviews what was read before saving it to the guest book.
 */
export function IdScanDialog({ open, onOpenChange, ...props }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className="grid-cols-[minmax(0,1fr)] shadow-floating sm:max-w-md"
      >
        {open && <ScanFlow {...props} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function ScanFlow({
  bookingId,
  stayGuest,
  onDone,
}: Omit<Props, 'open' | 'onOpenChange'> & { onDone: () => void }) {
  const health = useHealth();
  const start = useStartIdScan(bookingId);
  const scanId = start.data?.id ?? null;
  const scan = useIdScan(bookingId, scanId);
  const who = stayGuest?.name ?? 'a new guest';
  const visionOff = health.data && !health.data.ai.vision;

  // One scan per opening of the dialog.
  const { mutate } = start;
  const startedFor = useRef(false);
  useEffect(() => {
    if (visionOff || startedFor.current) return;
    startedFor.current = true;
    mutate(stayGuest?.id ?? null);
  }, [mutate, stayGuest?.id, visionOff]);

  if (visionOff) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>ID scanning is off</DialogTitle>
          <DialogDescription>
            Scanning needs a vision model (META_MODEL_VISION). Enter the details by hand on the
            Guests tab.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={onDone}>Close</Button>
        </DialogFooter>
      </>
    );
  }

  if (scan.data?.status === 'done' && scan.data.result && scanId) {
    return (
      <ReviewForm
        bookingId={bookingId}
        stayGuest={stayGuest}
        scanId={scanId}
        result={scan.data.result}
        onDone={onDone}
        onRetake={() => {
          startedFor.current = true;
          mutate(stayGuest?.id ?? null);
        }}
      />
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Scan ID for {who}</DialogTitle>
      </DialogHeader>
      {start.error ? (
        <ErrorNotice message={start.error.message} />
      ) : scan.error ? (
        <ErrorNotice message={scan.error.message} />
      ) : (
        <WaitForPhone
          bookingId={bookingId}
          scanId={scanId}
          status={scan.data?.status ?? 'waiting'}
          error={scan.data?.error ?? null}
        />
      )}
      <DialogFooter>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </DialogFooter>
    </>
  );
}

function WaitForPhone({
  bookingId,
  scanId,
  status,
  error,
}: {
  bookingId: string;
  scanId: string | null;
  status: 'waiting' | 'reading' | 'done' | 'failed';
  error: string | null;
}) {
  const upload = useUploadIdPhoto(bookingId, scanId);
  const fileInput = useRef<HTMLInputElement>(null);
  const url = scanId ? scanUrl(window.location.origin, scanId) : null;
  const local = isLocalOnly(window.location.hostname);
  const [unreadable, setUnreadable] = useState(false);
  const reading = status === 'reading' || upload.isPending;

  async function onFile(input: HTMLInputElement) {
    const file = input.files?.[0];
    // Cleared, so picking the same photo again still counts as a change.
    input.value = '';
    if (!file) return;
    setUnreadable(false);
    try {
      upload.mutate(await prepareIdPhoto(file));
    } catch {
      setUnreadable(true);
    }
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
                <LoaderCircle className="size-4 animate-spin text-primary-text" /> Reading the
                photo…
              </>
            ) : (
              <>
                <Smartphone className="size-4 text-muted-foreground" /> Waiting for the phone
              </>
            )}
          </p>
          <p className="text-muted-foreground">Expires in 15 minutes</p>
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
      {local && (
        <p className="text-xs text-muted-foreground">
          This screen runs on localhost, which a phone can&apos;t open. Start Orbit with{' '}
          <code className="font-mono">pnpm dev:lan</code> and open it by the computer&apos;s network
          address, or upload a photo here.
        </p>
      )}
      {status === 'failed' && error && <ErrorNotice message={error} />}
      {upload.error && <ErrorNotice message={upload.error.message} />}
      {unreadable && (
        <ErrorNotice message="This browser couldn't open that photo. Try a JPEG or PNG." />
      )}
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => void onFile(e.currentTarget)}
      />
      <Button
        variant="outline"
        className="self-start"
        disabled={!scanId || reading}
        onClick={() => fileInput.current?.click()}
      >
        <Upload /> Upload a photo instead
      </Button>
    </div>
  );
}

const documentOptions: { value: DocumentType; label: string }[] = [
  { value: 'id_card', label: documentTypeLabels.id_card },
  { value: 'passport', label: documentTypeLabels.passport },
];

function ReviewForm({
  bookingId,
  stayGuest,
  scanId,
  result,
  onDone,
  onRetake,
}: {
  bookingId: string;
  stayGuest: StayGuestView | null;
  scanId: string;
  result: IdScanResult;
  onDone: () => void;
  onRetake: () => void;
}) {
  const update = useUpdateStayGuest(bookingId);
  const add = useAddStayGuest(bookingId);
  const save = stayGuest ? update : add;
  // The main guest's name lives on their profile, so it is only compared, never overwritten.
  const editableName = !stayGuest?.primary;
  const [name, setName] = useState(result.name ?? stayGuest?.name ?? '');
  const [nationality, setNationality] = useState(result.nationality ?? '');
  const [dateOfBirth, setDateOfBirth] = useState(result.dateOfBirth ?? '');
  const [documentType, setDocumentType] = useState<DocumentType>(result.documentType ?? 'id_card');
  const [documentNumber, setDocumentNumber] = useState(result.documentNumber ?? '');
  const [address, setAddress] = useState(result.address ?? stayGuest?.address ?? '');
  const country = useHotelProfile().data?.country ?? 'US';
  const abroad = needsAddress(nationality, country);
  // A document under another name may be the wrong one; the main guest's name stays either way.
  const nameDiffers =
    stayGuest &&
    result.name !== null &&
    result.name.toLocaleLowerCase() !== stayGuest.name.toLocaleLowerCase();

  function submit(e: FormEvent) {
    e.preventDefault();
    const fields = {
      nationality: nationality || null,
      dateOfBirth: dateOfBirth || null,
      documentType,
      documentNumber: documentNumber || null,
      address: address || null,
      scanId,
    };
    if (stayGuest) {
      update.mutate(
        { id: stayGuest.id, patch: editableName ? { ...fields, name } : fields },
        { onSuccess: onDone },
      );
    } else {
      add.mutate({ ...fields, name }, { onSuccess: onDone });
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Check the scanned details</DialogTitle>
      </DialogHeader>
      {(result.warnings.length > 0 || nameDiffers) && (
        <ul className="flex flex-col gap-1 rounded-control bg-warning/10 px-3 py-2 text-sm">
          {nameDiffers && (
            <li className="flex gap-2">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />
              The document reads “{result.name}”, the booking says “{stayGuest?.name}”.
            </li>
          )}
          {result.warnings.map((w) => (
            <li key={w} className="flex gap-2">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />
              {w}
            </li>
          ))}
        </ul>
      )}
      {editableName && (
        <FormField label="Name" htmlFor="scan-name">
          <Input id="scan-name" required value={name} onChange={(e) => setName(e.target.value)} />
        </FormField>
      )}
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Nationality" htmlFor="scan-nationality">
          <SuggestInput
            id="scan-nationality"
            maxLength={2}
            value={nationality}
            suggestions={countrySuggestions}
            onValueChange={(v) => setNationality(v.toUpperCase())}
            className="uppercase"
          />
        </FormField>
        <FormField label="Date of birth" htmlFor="scan-birth">
          <DatePicker
            id="scan-birth"
            value={dateOfBirth}
            min="1900-01-01"
            max={hotelTodayIso()}
            clearable
            onChange={setDateOfBirth}
          />
        </FormField>
      </div>
      <Segmented
        label="Document"
        value={documentType}
        options={documentOptions}
        onChange={setDocumentType}
        className="self-start"
      />
      <FormField
        label="Document number"
        htmlFor="scan-document"
        hint={result.expiresOn ? `Valid until ${result.expiresOn}` : undefined}
      >
        <Input
          id="scan-document"
          autoComplete="off"
          value={documentNumber}
          onChange={(e) => setDocumentNumber(e.target.value)}
          className="font-mono"
        />
      </FormField>
      <FormField
        label={abroad ? 'Home address' : 'Home address (optional)'}
        htmlFor="scan-address"
        hint={abroad ? 'Required for guests from abroad' : undefined}
      >
        <Input id="scan-address" value={address} onChange={(e) => setAddress(e.target.value)} />
      </FormField>
      {save.error && <ErrorNotice message={save.error.message} />}
      <DialogFooter className="sm:justify-between">
        <Button type="button" variant="ghost" onClick={onRetake}>
          <Camera /> Scan again
        </Button>
        <Button type="submit" disabled={save.isPending || (editableName && !name.trim())}>
          Save to guest book
        </Button>
      </DialogFooter>
    </form>
  );
}
