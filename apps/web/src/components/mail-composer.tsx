import type { Attachment, Recipient } from '@orbit/shared';
import { ArrowLeft, Send, Trash2, X } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { AttachButton, AttachmentList } from '@/components/attachments';
import { ErrorNotice } from '@/components/error-notice';
import { RecipientField } from '@/components/recipient-field';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { Textarea } from '@/components/ui/textarea';
import { useAddressBook } from '@/hooks/use-address-book';
import { useAutosave } from '@/hooks/use-autosave';
import { useComposeMessage, useDeleteDraft, useSaveDraft } from '@/lib/api';

export interface ComposerStart {
  draftId: string;
  forwardOf: string | null;
  to: Recipient[];
  cc: Recipient[];
  bcc: Recipient[];
  subject: string;
  body: string;
  attachments: Attachment[];
  /** Already kept as a draft, so discarding deletes it. */
  saved: boolean;
}

/**
 * A new email or a forward, written in the reading pane and kept as a draft while staff type,
 * so it can be left and picked up again from Drafts.
 */
export function MailComposer({ start, back }: { start: ComposerStart; back: string }) {
  const compose = useComposeMessage();
  const save = useSaveDraft();
  const remove = useDeleteDraft();
  const navigate = useNavigate();
  const book = useAddressBook();
  const [to, setTo] = useState(start.to);
  const [cc, setCc] = useState(start.cc);
  const [bcc, setBcc] = useState(start.bcc);
  const [showCopies, setShowCopies] = useState(start.cc.length + start.bcc.length > 0);
  const [subject, setSubject] = useState(start.subject);
  const [body, setBody] = useState(start.body);
  const [files, setFiles] = useState(start.attachments);
  const [sent, setSent] = useState(false);
  const ready = to.length > 0 && subject.trim() && body.trim();
  const draft = {
    forwardOf: start.forwardOf,
    to,
    cc,
    bcc,
    subject,
    body,
    attachmentIds: files.map((f) => f.id),
  };
  const touched =
    to.length + cc.length + bcc.length + files.length > 0 || !!subject.trim() || !!body.trim();
  useAutosave(draft, (d) => save.mutate({ id: start.draftId, body: d }), touched && !sent);

  function send(e?: FormEvent) {
    e?.preventDefault();
    if (!ready || compose.isPending) return;
    setSent(true);
    compose.mutate(
      { ...draft, draftId: start.saved || save.isSuccess ? start.draftId : null },
      {
        onSuccess: (m) => void navigate(`/inbox/${m.id}`, { replace: true }),
        onError: () => setSent(false),
      },
    );
  }

  function discard() {
    setSent(true);
    if (start.saved || save.isSuccess || save.isPending) remove.mutate(start.draftId);
    void navigate(back);
  }

  return (
    <article className="mx-auto flex min-h-full max-w-4xl flex-col gap-4 px-6 py-6">
      <header className="flex items-center gap-2">
        <Button variant="ghost" size="icon-sm" asChild className="lg:hidden">
          <Link to={back} aria-label="Back to the list">
            <ArrowLeft />
          </Link>
        </Button>
        <h2 className="min-w-0 flex-1 truncate text-xl font-semibold tracking-tight">
          {subject.trim() || (start.forwardOf ? 'Forward' : 'New email')}
        </h2>
        <Button variant="ghost" size="icon-sm" asChild className="max-lg:hidden">
          <Link to={back} aria-label="Close" title="Close">
            <X />
          </Link>
        </Button>
      </header>

      <form
        onSubmit={send}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send();
        }}
        className="flex flex-1 flex-col rounded-card bg-surface-sunken p-1 ring-1 ring-ink/5 ring-inset"
      >
        <div className="relative flex flex-1 flex-col rounded-stage bg-background shadow-[0_1px_2px_var(--shadow-soft)] stroke-lit">
          <RecipientField
            label="To"
            value={to}
            onChange={setTo}
            book={book}
            autoFocus={to.length === 0}
            trailing={
              !showCopies && (
                <button
                  type="button"
                  onClick={() => setShowCopies(true)}
                  className="shrink-0 text-sm text-muted-foreground hover:text-foreground"
                >
                  Cc Bcc
                </button>
              )
            }
          />
          {showCopies && (
            <>
              <RecipientField label="Cc" value={cc} onChange={setCc} book={book} />
              <RecipientField label="Bcc" value={bcc} onChange={setBcc} book={book} />
            </>
          )}
          <div className="flex items-center gap-3 border-b px-4">
            <label
              htmlFor="compose-subject"
              className="w-14 shrink-0 text-sm text-muted-foreground"
            >
              Subject
            </label>
            <input
              id="compose-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
          </div>
          <Textarea
            aria-label="Message"
            autoFocus={to.length > 0}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your message…"
            className="min-h-64 flex-1 resize-none rounded-none border-0 bg-transparent px-4 py-3 leading-relaxed shadow-none focus-visible:ring-0"
          />
          <AttachmentList
            files={files}
            onRemove={(f) => setFiles((all) => all.filter((x) => x.id !== f.id))}
            className="px-4 pb-3"
          />
          <div className="flex items-center gap-2 border-t px-2 py-2">
            <Button type="submit" size="sm" disabled={!ready || compose.isPending}>
              <Send /> Send
            </Button>
            <AttachButton onAttached={(f) => setFiles((all) => [...all, f])} />
            <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
              {save.isPending ? 'Saving…' : save.isSuccess ? 'Saved' : null}
              <span className="max-sm:hidden">
                <Kbd>⌘</Kbd> <Kbd>Enter</Kbd>
              </span>
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Discard draft"
              title="Discard draft"
              onClick={discard}
            >
              <Trash2 />
            </Button>
          </div>
        </div>
        {(compose.error ?? save.error) && (
          <ErrorNotice message={(compose.error ?? save.error)!.message} className="mt-1" />
        )}
      </form>
    </article>
  );
}
