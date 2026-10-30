import { type HotelInfoCategory, hotelInfoCategories, type HotelInfoEntry } from '@orbit/shared';
import { type FormEvent, useState } from 'react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { ErrorNotice } from '@/components/error-notice';
import { FormField } from '@/components/form-field';
import { Segmented } from '@/components/segmented';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useRemoveEntry, useSaveEntry } from '@/lib/api';
import { entryHints } from '@/lib/settings';

/** Adds an entry to Knowledge (`entry` null) or edits or deletes one. */
export function KnowledgeEditor({
  entry,
  category: initialCategory,
  onClose,
}: {
  entry: HotelInfoEntry | null;
  /** For a new entry: the kind the page was showing. */
  category: HotelInfoCategory;
  onClose: () => void;
}) {
  const save = useSaveEntry();
  const remove = useRemoveEntry();
  const [category, setCategory] = useState(entry?.category ?? initialCategory);
  const [title, setTitle] = useState(entry?.title ?? '');
  const [details, setDetails] = useState(entry?.details ?? '');
  const [until, setUntil] = useState(entry?.until ?? '');
  const [confirming, setConfirming] = useState(false);
  const valid = title.trim() !== '' && details.trim() !== '';

  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate(
      {
        id: entry?.id ?? null,
        draft: { category, title, details, until: until || null },
      },
      { onSuccess: onClose },
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-describedby={undefined} className="shadow-floating sm:max-w-lg">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{entry ? 'Edit entry' : 'New entry'}</DialogTitle>
          </DialogHeader>
          <Segmented
            label="Kind"
            value={category}
            options={hotelInfoCategories.map((c) => ({ value: c, label: entryHints[c].title }))}
            onChange={setCategory}
            className="self-start"
          />
          <FormField label="Title" htmlFor="entry-title">
            <Input
              id="entry-title"
              required
              maxLength={80}
              placeholder={entryHints[category].example}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </FormField>
          <FormField label="Details" htmlFor="entry-details">
            <Textarea
              id="entry-details"
              required
              rows={4}
              maxLength={600}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
            />
          </FormField>
          <FormField label="Until" htmlFor="entry-until" className="w-44">
            <Input
              id="entry-until"
              type="date"
              value={until}
              onChange={(e) => setUntil(e.target.value)}
            />
          </FormField>
          {(save.error ?? remove.error) && (
            <ErrorNotice message={(save.error ?? remove.error)!.message} />
          )}
          <DialogFooter className="sm:justify-between">
            {entry ? (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={() => setConfirming(true)}
              >
                Delete
              </Button>
            ) : (
              <span />
            )}
            <span className="flex gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={!valid || save.isPending}>
                Save
              </Button>
            </span>
          </DialogFooter>
        </form>
      </DialogContent>
      {entry && (
        <ConfirmDialog
          open={confirming}
          onOpenChange={setConfirming}
          title={`Delete "${entry.title}"?`}
          description="Orbit stops telling guests about it."
          confirmLabel="Delete"
          destructive
          busy={remove.isPending}
          onConfirm={() => remove.mutate(entry.id, { onSuccess: onClose })}
        />
      )}
    </Dialog>
  );
}
