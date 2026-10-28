import { type Guest, type Language, languages } from '@orbit/shared';
import { type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router';
import { ErrorNotice } from '@/components/error-notice';
import { FormField } from '@/components/form-field';
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
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { useCreateGuest, useHotelProfile, useUpdateGuest } from '@/lib/api';
import { languageLabels } from '@/lib/format';

interface GuestEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The guest to edit; leave out to create one. */
  guest?: Guest;
}

/** Creates or edits a guest record. A new guest's page opens once saved. */
export function GuestEditorDialog({ open, onOpenChange, guest }: GuestEditorProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="shadow-floating sm:max-w-lg">
        {open && <GuestForm guest={guest} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function GuestForm({ guest, onDone }: { guest: Guest | undefined; onDone: () => void }) {
  const [name, setName] = useState(guest?.name ?? '');
  const [email, setEmail] = useState(guest?.email ?? '');
  const [phone, setPhone] = useState(guest?.phone ?? '');
  const hotelLanguage = useHotelProfile().data?.language ?? 'en';
  const [language, setLanguage] = useState<Language>(guest?.language ?? hotelLanguage);
  const [notes, setNotes] = useState(guest?.notes ?? '');
  const create = useCreateGuest();
  const update = useUpdateGuest();
  const navigate = useNavigate();
  const error = create.error ?? update.error;

  function submit(e: FormEvent) {
    e.preventDefault();
    const body = { name, email, phone, language, notes };
    if (guest) {
      update.mutate({ id: guest.id, patch: body }, { onSuccess: onDone });
    } else {
      create.mutate(
        { ...body, email: email || null, phone: phone || null, notes: notes || null },
        {
          onSuccess: (created) => {
            onDone();
            void navigate(`/guests/${created.id}`);
          },
        },
      );
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{guest ? `Edit ${guest.name}` : 'New guest'}</DialogTitle>
        <DialogDescription>
          The guest's language is used for replies the agent drafts.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Name" htmlFor="ge-name">
          <Input
            id="ge-name"
            required
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </FormField>
        <FormField label="Language" htmlFor="ge-language">
          <NativeSelect
            id="ge-language"
            value={language}
            onChange={(e) => setLanguage(e.target.value as Language)}
          >
            {languages.map((l) => (
              <option key={l} value={l}>
                {languageLabels[l]}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="Email" htmlFor="ge-email">
          <Input
            id="ge-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </FormField>
        <FormField label="Phone" htmlFor="ge-phone">
          <Input
            id="ge-phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </FormField>
        <FormField label="Notes" htmlFor="ge-notes" className="sm:col-span-2">
          <Textarea
            id="ge-notes"
            rows={3}
            placeholder="Preferences, allergies, anything to remember"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </FormField>
      </div>
      {error && <ErrorNotice message={error.message} />}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={!name.trim() || create.isPending || update.isPending}>
          {guest ? 'Save changes' : 'Create guest'}
        </Button>
      </DialogFooter>
    </form>
  );
}
