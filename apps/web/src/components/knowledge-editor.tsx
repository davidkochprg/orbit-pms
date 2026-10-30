import {
  hotelInfoCategories,
  hotelInfoCategoryLabels,
  type HotelInfoDraft,
  type HotelInfoEntry,
} from '@orbit/shared';
import { type FormEvent, type KeyboardEvent, useState } from 'react';
import { ErrorNotice } from '@/components/error-notice';
import { FormField } from '@/components/form-field';
import { BackToVault, NoteLayout } from '@/components/knowledge-note';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { useSaveEntry } from '@/lib/api';
import { parseTags } from '@/lib/knowledge';

/**
 * Writes a note by hand: a new one (`id` null), an existing one, or one Orbit filed before it is
 * saved. ⌘↵ saves.
 */
export function NoteEditor({
  id,
  initial,
  onSaved,
  onCancel,
}: {
  id: string | null;
  initial: HotelInfoDraft;
  onSaved: (note: HotelInfoEntry) => void;
  onCancel: () => void;
}) {
  const save = useSaveEntry();
  const [category, setCategory] = useState(initial.category);
  const [title, setTitle] = useState(initial.title);
  const [details, setDetails] = useState(initial.details);
  const [tags, setTags] = useState(initial.tags.join(', '));
  const [until, setUntil] = useState(initial.until ?? '');
  const valid = title.trim() !== '' && details.trim() !== '';

  function submit(e?: FormEvent) {
    e?.preventDefault();
    if (!valid || save.isPending) return;
    save.mutate(
      { id, draft: { category, title, details, tags: parseTags(tags), until: until || null } },
      { onSuccess: onSaved },
    );
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
    if (e.key === 'Escape') onCancel();
  }

  return (
    <form onSubmit={submit} onKeyDown={onKeyDown} className="contents">
      <NoteLayout
        header={
          <>
            <BackToVault />
            <h2 className="sr-only">{id ? 'Edit note' : 'New note'}</h2>
            <NativeSelect
              aria-label="Folder"
              value={category}
              onChange={(e) => setCategory(e.target.value as HotelInfoDraft['category'])}
              className="h-8 w-44 text-[0.8125rem]"
            >
              {hotelInfoCategories.map((c) => (
                <option key={c} value={c}>
                  {hotelInfoCategoryLabels[c]}
                </option>
              ))}
            </NativeSelect>
            <span className="ml-auto flex items-center gap-1">
              <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={!valid || save.isPending}>
                Save
              </Button>
            </span>
          </>
        }
      >
        <input
          aria-label="Title"
          required
          maxLength={80}
          autoFocus={!title}
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full bg-transparent text-2xl font-semibold tracking-tight outline-none placeholder:text-subtle-foreground"
        />
        <div className="flex flex-wrap gap-3">
          <FormField label="Tags" htmlFor="note-tags" className="min-w-48 flex-1">
            <Input
              id="note-tags"
              placeholder="pets, dogs"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
            />
          </FormField>
          <FormField label="Until" htmlFor="note-until" className="w-44">
            <Input
              id="note-until"
              type="date"
              value={until}
              onChange={(e) => setUntil(e.target.value)}
            />
          </FormField>
        </div>
        <Textarea
          aria-label="Note"
          required
          maxLength={1000}
          autoFocus={Boolean(title)}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          className="min-h-64 text-[0.9375rem] leading-7 md:text-[0.9375rem]"
        />
        {save.error && <ErrorNotice message={save.error.message} />}
      </NoteLayout>
    </form>
  );
}
