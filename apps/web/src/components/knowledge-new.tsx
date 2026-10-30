import type { FiledNote, HotelInfoDraft, HotelInfoEntry } from '@orbit/shared';
import { LoaderCircle, X } from 'lucide-react';
import { type FormEvent, type KeyboardEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ErrorNotice } from '@/components/error-notice';
import { NoteEditor } from '@/components/knowledge-editor';
import {
  BackToVault,
  FolderLabel,
  NoteBody,
  NoteLayout,
  NoteMeta,
} from '@/components/knowledge-note';
import { Panel } from '@/components/panel';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { useFileNote, useHealth, useSaveEntry } from '@/lib/api';

/**
 * A new note: staff describe it in their own words and Orbit titles, files, tags and links it, or
 * folds it into the note that covers it. They see the note before saving it, and can edit it or
 * write one by hand.
 */
export function NewNote({
  notes,
  today,
  onSaved,
}: {
  notes: HotelInfoEntry[];
  today: string | undefined;
  onSaved: (note: HotelInfoEntry) => void;
}) {
  const navigate = useNavigate();
  const health = useHealth();
  const file = useFileNote();
  const save = useSaveEntry();
  const [text, setText] = useState('');
  // A note being written by hand: blank, from the description, or Orbit's to change.
  const [editing, setEditing] = useState<{ id: string | null; draft: HotelInfoDraft } | null>(null);
  const aiOff = health.data?.ai.configured === false;

  if (editing || aiOff) {
    return (
      <NoteEditor
        id={editing?.id ?? null}
        initial={
          editing?.draft ?? { category: 'services', title: '', details: '', tags: [], until: null }
        }
        onSaved={onSaved}
        onCancel={() => (aiOff ? void navigate('/knowledge') : setEditing(null))}
      />
    );
  }

  const filed = file.data;
  const target = filed?.id ? notes.find((n) => n.id === filed.id) : undefined;

  function submit(e?: FormEvent) {
    e?.preventDefault();
    if (filed) save.mutate(filed, { onSuccess: onSaved });
    else if (text.trim() && !file.isPending) file.mutate(text);
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
  }

  return (
    <NoteLayout
      header={
        <>
          <BackToVault />
          <h2 className="min-w-0 flex-1 text-[0.9375rem] font-medium">
            {target ? `Update ${target.title}` : 'New note'}
          </h2>
          <Button variant="ghost" size="icon-sm" asChild className="max-lg:hidden">
            <Link to="/knowledge" aria-label="Discard" title="Discard">
              <X />
            </Link>
          </Button>
        </>
      }
    >
      <form
        onSubmit={submit}
        onKeyDown={onKeyDown}
        className="flex flex-col rounded-card bg-surface-sunken p-1 ring-1 ring-ink/5 ring-inset"
      >
        <div className="relative flex min-h-64 flex-col rounded-stage bg-background shadow-[0_1px_2px_var(--shadow-soft)] stroke-lit">
          {filed ? (
            <FiledPreview filed={filed} notes={notes} today={today} />
          ) : (
            <textarea
              aria-label="Describe the note"
              autoFocus
              required
              maxLength={1500}
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={file.isPending}
              placeholder="Dogs are welcome in the cabin suites for a nightly fee, but not in the spa."
              className="min-h-64 flex-1 resize-none bg-transparent px-5 py-4 text-[0.9375rem] leading-7 outline-none placeholder:text-subtle-foreground disabled:opacity-60"
            />
          )}
        </div>
        <footer className="flex items-center gap-1.5 px-1.5 pt-1.5 pb-0.5">
          {filed ? (
            <>
              <Button type="button" variant="ghost" size="sm" onClick={() => file.reset()}>
                Back
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="ml-auto"
                onClick={() => setEditing(filed)}
              >
                Edit
              </Button>
              <Button type="submit" size="sm" disabled={save.isPending}>
                {target ? 'Update' : 'Save'}
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  setEditing({
                    id: null,
                    draft: {
                      category: 'services',
                      title: '',
                      details: text.trim(),
                      tags: [],
                      until: null,
                    },
                  })
                }
              >
                Write it myself
              </Button>
              <Kbd className="ml-auto max-sm:hidden">⌘↵</Kbd>
              <Button type="submit" size="sm" disabled={!text.trim() || file.isPending}>
                {file.isPending && <LoaderCircle className="animate-spin" />} Add note
              </Button>
            </>
          )}
        </footer>
      </form>
      {(file.error ?? save.error) && <ErrorNotice message={(file.error ?? save.error)!.message} />}
      {target && (
        <Panel title="Before">
          <div className="px-4 py-3">
            <NoteBody
              details={target.details}
              notes={notes}
              className="text-sm text-muted-foreground"
            />
          </div>
        </Panel>
      )}
    </NoteLayout>
  );
}

/** Orbit's note as it will read once saved. */
function FiledPreview({
  filed: { draft },
  notes,
  today,
}: {
  filed: FiledNote;
  notes: HotelInfoEntry[];
  today: string | undefined;
}) {
  return (
    <div className="flex flex-col gap-4 px-5 py-4 motion-safe:animate-in motion-safe:fade-in">
      <div className="flex flex-col gap-2">
        <FolderLabel folder={draft.category} />
        <h3 className="text-xl font-semibold tracking-tight text-balance">{draft.title}</h3>
        <NoteMeta tags={draft.tags} until={draft.until} today={today} />
      </div>
      <NoteBody details={draft.details} notes={notes} />
    </div>
  );
}
