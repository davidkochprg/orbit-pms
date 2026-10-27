import type { DocumentType, RegistrationBody } from '@orbit/shared';
import { type FormEvent, useState } from 'react';
import { ErrorNotice } from '@/components/error-notice';
import { FormField } from '@/components/form-field';
import { Segmented } from '@/components/segmented';
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
import { Skeleton } from '@/components/ui/skeleton';
import { useRegistration, useSaveRegistration } from '@/lib/api';
import { countryOptions, needsAddress } from '@/lib/registration';

interface Props {
  bookingId: string;
  guestName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after saving; check-in passes this to check the guest in right after. */
  onSaved?: () => void;
  /** The button label, e.g. "Register and check in". */
  submitLabel?: string;
}

const documentTypes: { value: DocumentType; label: string }[] = [
  { value: 'id_card', label: 'ID card' },
  { value: 'passport', label: 'Passport' },
];

/** The guest-book entry for a stay, prefilled from the guest's last stay when there is one. */
export function RegistrationDialog({ open, onOpenChange, ...props }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="shadow-floating sm:max-w-md">
        {open && <Loader {...props} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function Loader({
  bookingId,
  onDone,
  ...props
}: Omit<Props, 'open' | 'onOpenChange'> & { onDone: () => void }) {
  const view = useRegistration(bookingId);
  if (view.isError) return <ErrorNotice message={view.error.message} />;
  if (!view.data) return <Skeleton className="h-96" />;
  const initial = view.data.registration ?? view.data.previous;
  return (
    <RegistrationForm
      bookingId={bookingId}
      initial={initial}
      prefilled={!view.data.registration && view.data.previous !== null}
      onDone={onDone}
      {...props}
    />
  );
}

function RegistrationForm({
  bookingId,
  guestName,
  initial,
  prefilled,
  onSaved,
  submitLabel = 'Save',
  onDone,
}: Omit<Props, 'open' | 'onOpenChange'> & {
  initial: RegistrationBody | null;
  prefilled: boolean;
  onDone: () => void;
}) {
  const save = useSaveRegistration(bookingId);
  const [nationality, setNationality] = useState(initial?.nationality ?? '');
  const [dateOfBirth, setDateOfBirth] = useState(initial?.dateOfBirth ?? '');
  const [documentType, setDocumentType] = useState<DocumentType>(
    initial?.documentType ?? 'id_card',
  );
  const [documentNumber, setDocumentNumber] = useState(initial?.documentNumber ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');
  const abroad = needsAddress(nationality);
  const valid =
    /^[a-z]{2}$/i.test(nationality.trim()) &&
    dateOfBirth !== '' &&
    documentNumber.trim().length >= 3 &&
    (!abroad || address.trim() !== '');

  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate(
      { nationality, dateOfBirth, documentType, documentNumber, address: address || null },
      {
        onSuccess: () => {
          onDone();
          onSaved?.();
        },
      },
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Register {guestName}</DialogTitle>
        <DialogDescription>
          {prefilled
            ? 'Filled in from their last stay. Check it against their ID.'
            : 'For the guest book, from their ID card or passport.'}
        </DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Nationality" htmlFor="reg-nationality" hint="Country code, e.g. CZ">
          <Input
            id="reg-nationality"
            required
            maxLength={2}
            list="reg-countries"
            autoComplete="off"
            value={nationality}
            onChange={(e) => setNationality(e.target.value.toUpperCase())}
            className="uppercase"
          />
          <datalist id="reg-countries">
            {countryOptions.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </datalist>
        </FormField>
        <FormField label="Date of birth" htmlFor="reg-birth">
          <Input
            id="reg-birth"
            type="date"
            required
            value={dateOfBirth}
            onChange={(e) => setDateOfBirth(e.target.value)}
          />
        </FormField>
      </div>
      <Segmented
        label="Document"
        value={documentType}
        options={documentTypes}
        onChange={setDocumentType}
        className="self-start"
      />
      <FormField label="Document number" htmlFor="reg-document">
        <Input
          id="reg-document"
          required
          autoComplete="off"
          value={documentNumber}
          onChange={(e) => setDocumentNumber(e.target.value)}
        />
      </FormField>
      <FormField
        label={abroad ? 'Home address' : 'Home address (optional)'}
        htmlFor="reg-address"
        hint={abroad ? 'Required for guests from abroad.' : undefined}
      >
        <Input
          id="reg-address"
          required={abroad}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
      </FormField>
      {save.error && <ErrorNotice message={save.error.message} />}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={!valid || save.isPending}>
          {submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}
