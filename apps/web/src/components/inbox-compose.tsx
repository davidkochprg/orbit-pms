import { ArrowLeft, Send, X } from 'lucide-react';
import { type FormEvent, type ReactNode, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ErrorNotice } from '@/components/error-notice';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useComposeMessage } from '@/lib/api';

/** A new email from the hotel to a guest, written in the reading pane like a reply. */
export function ComposeEmail() {
  const compose = useComposeMessage();
  const navigate = useNavigate();
  const [toName, setToName] = useState('');
  const [toAddress, setToAddress] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const ready = toAddress.trim() && subject.trim() && body.trim();

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    compose.mutate(
      { toName: toName.trim() || null, toAddress: toAddress.trim(), subject, body },
      { onSuccess: (sent) => void navigate(`/inbox/${sent.id}`, { replace: true }) },
    );
  }

  return (
    <article className="mx-auto flex min-h-full max-w-4xl flex-col gap-4 px-6 py-6">
      <header className="flex items-center gap-2">
        <Button variant="ghost" size="icon-sm" asChild className="md:hidden">
          <Link to="/inbox" aria-label="Back to the list">
            <ArrowLeft />
          </Link>
        </Button>
        <h2 className="min-w-0 flex-1 text-xl font-semibold tracking-tight">
          {subject.trim() || 'New email'}
        </h2>
        <Button variant="ghost" size="icon-sm" asChild className="max-md:hidden">
          <Link to="/inbox" aria-label="Discard" title="Discard">
            <X />
          </Link>
        </Button>
      </header>
      <p className="-mt-2 text-sm text-muted-foreground">
        Write to a guest. Their answer joins the same conversation.
      </p>

      <form
        onSubmit={onSubmit}
        className="flex flex-1 flex-col rounded-card bg-surface-sunken p-1 ring-1 ring-ink/5 ring-inset"
      >
        <div className="relative flex flex-1 flex-col rounded-stage bg-background shadow-[0_1px_2px_var(--shadow-soft)] stroke-lit">
          <Row label="To" htmlFor="compose-address">
            <input
              id="compose-address"
              type="email"
              required
              autoFocus
              value={toAddress}
              onChange={(e) => setToAddress(e.target.value)}
              placeholder="guest@example.com"
              className={fieldClass}
            />
            <input
              aria-label="Name"
              value={toName}
              onChange={(e) => setToName(e.target.value)}
              placeholder="Name (optional)"
              className={`${fieldClass} max-w-48 border-l pl-3`}
            />
          </Row>
          <Row label="Subject" htmlFor="compose-subject">
            <input
              id="compose-subject"
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className={fieldClass}
            />
          </Row>
          <Textarea
            aria-label="Message"
            required
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your message…"
            className="min-h-64 flex-1 resize-none rounded-none border-0 bg-transparent px-4 py-3 leading-relaxed shadow-none focus-visible:ring-0"
          />
          <div className="flex items-center gap-2 border-t px-2 py-2">
            <Button type="submit" size="sm" disabled={!ready || compose.isPending}>
              <Send /> Send email
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/inbox">Discard</Link>
            </Button>
          </div>
        </div>
        {compose.error && <ErrorNotice message={compose.error.message} className="mt-1" />}
      </form>
    </article>
  );
}

const fieldClass =
  'h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-subtle-foreground';

/** A mail header line: a label on the left, borderless fields after it, a hairline below. */
function Row({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 border-b px-4">
      <label htmlFor={htmlFor} className="w-14 shrink-0 text-sm text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}
