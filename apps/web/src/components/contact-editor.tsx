import {
  type Contact,
  type Language,
  languages,
  type Trade,
  tradeLabels,
  trades,
} from '@orbit/shared';
import { type FormEvent, useState } from 'react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { ErrorNotice } from '@/components/error-notice';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useHotelProfile, useRemoveContact, useSaveContact } from '@/lib/api';
import { languageLabels } from '@/lib/format';
import { cn } from '@/lib/utils';

interface ContactEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The contact to edit; leave out to add one. */
  contact?: Contact;
  /** What a new contact does, e.g. when added from a repair. */
  trade?: Trade;
}

/** Adds, edits or deletes a supplier or contractor. */
export function ContactEditorDialog({ open, onOpenChange, contact, trade }: ContactEditorProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="shadow-floating sm:max-w-lg">
        {open && <ContactForm contact={contact} trade={trade} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function ContactForm({
  contact,
  trade,
  onDone,
}: {
  contact: Contact | undefined;
  trade: Trade | undefined;
  onDone: () => void;
}) {
  const hotelLanguage = useHotelProfile().data?.language ?? 'en';
  const [name, setName] = useState(contact?.name ?? '');
  const [person, setPerson] = useState(contact?.person ?? '');
  const [does, setDoes] = useState<Trade[]>(contact?.trades ?? (trade ? [trade] : []));
  const [phone, setPhone] = useState(contact?.phone ?? '');
  const [email, setEmail] = useState(contact?.email ?? '');
  const [language, setLanguage] = useState<Language>(contact?.language ?? hotelLanguage);
  const [notes, setNotes] = useState(contact?.notes ?? '');
  const [deleting, setDeleting] = useState(false);
  const save = useSaveContact();
  const remove = useRemoveContact();
  const error = save.error ?? remove.error;

  const toggle = (t: Trade) =>
    setDoes((d) => (d.includes(t) ? d.filter((x) => x !== t) : [...d, t]));

  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate(
      {
        id: contact?.id ?? null,
        body: { name, person, trades: does, phone, email, language, notes },
      },
      { onSuccess: onDone },
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{contact ? contact.name : 'New contact'}</DialogTitle>
      </DialogHeader>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Name" htmlFor="ct-name">
          <Input
            id="ct-name"
            required
            autoFocus={!contact}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </FormField>
        <FormField label="Ask for" htmlFor="ct-person">
          <Input id="ct-person" value={person} onChange={(e) => setPerson(e.target.value)} />
        </FormField>
        <fieldset className="flex flex-col gap-1.5 sm:col-span-2">
          <legend className="mb-1.5 text-xs font-medium text-muted-foreground">Does</legend>
          <div className="flex flex-wrap gap-1.5">
            {trades.map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={does.includes(t)}
                onClick={() => toggle(t)}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
                  does.includes(t) && 'border-primary/40 bg-primary-soft text-foreground',
                )}
              >
                {tradeLabels[t]}
              </button>
            ))}
          </div>
        </fieldset>
        <FormField label="Phone" htmlFor="ct-phone">
          <Input
            id="ct-phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </FormField>
        <FormField label="Email" htmlFor="ct-email">
          <Input
            id="ct-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </FormField>
        <FormField label="Write in" htmlFor="ct-language">
          <Select
            id="ct-language"
            value={language}
            onValueChange={(value) => setLanguage(value as Language)}
          >
            {languages.map((l) => (
              <option key={l} value={l}>
                {languageLabels[l]}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Notes" htmlFor="ct-notes" className="sm:col-span-2">
          <Textarea
            id="ct-notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </FormField>
      </div>
      {error && <ErrorNotice message={error.message} />}
      <DialogFooter>
        {contact && (
          <Button
            type="button"
            variant="ghost"
            className="mr-auto text-destructive"
            onClick={() => setDeleting(true)}
          >
            Delete
          </Button>
        )}
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={!name.trim() || does.length === 0 || save.isPending}>
          {contact ? 'Save changes' : 'Add contact'}
        </Button>
      </DialogFooter>
      {contact && (
        <ConfirmDialog
          open={deleting}
          onOpenChange={setDeleting}
          title={`Delete ${contact.name}?`}
          description="Orbit stops suggesting them for repairs."
          confirmLabel="Delete"
          destructive
          busy={remove.isPending}
          onConfirm={() => remove.mutate(contact.id, { onSuccess: onDone })}
        />
      )}
    </form>
  );
}
