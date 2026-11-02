import { type Contact, type Repair, tradeLabels, type WorkOrder } from '@orbit/shared';
import { Check, Mail, Phone, Send, UserPlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ConversationList } from '@/components/conversation-list';
import { ErrorNotice } from '@/components/error-notice';
import { LogoMark } from '@/components/logo-mark';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useAskOrbit } from '@/hooks/use-ask-orbit';
import { useToast } from '@/hooks/use-toast';
import {
  useAskToRepair,
  useContacts,
  useInbox,
  useRepair,
  useSendWorkOrder,
  useWorkOrder,
} from '@/lib/api';
import { accessLabel, contactName, repairConversations, telHref } from '@/lib/repairs';
import { cn } from '@/lib/utils';

/** A repair's contractors in a dialog, from a room card or Today's list. */
export function RepairDialog({
  taskId,
  writeTo,
  onOpenChange,
}: {
  taskId: string | null;
  /** Opens straight on the email to this contact. */
  writeTo?: string;
  onOpenChange: (open: boolean) => void;
}) {
  const repair = useRepair(taskId);
  const ask = useAskOrbit();
  return (
    <Dialog open={taskId !== null} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="shadow-floating sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{repair.data?.task.notes ?? 'Repair'}</DialogTitle>
          {repair.data && <RepairMeta repair={repair.data} />}
        </DialogHeader>
        {repair.isError ? (
          <ErrorNotice message={repair.error.message} />
        ) : repair.data ? (
          <RepairContacts
            repair={repair.data}
            writeTo={writeTo}
            onLeave={() => onOpenChange(false)}
          />
        ) : (
          <Skeleton className="h-24" />
        )}
        {ask && taskId && (
          <Button
            variant="ghost"
            size="sm"
            className="justify-self-end"
            onClick={() => {
              onOpenChange(false);
              ask({ kind: 'repair', id: taskId });
            }}
          >
            <LogoMark className="text-primary-text" /> Ask Orbit
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** "Room 203 · Plumbing · Free until Sat, Nov 7". */
export function RepairMeta({ repair, className }: { repair: Repair; className?: string }) {
  return (
    <p className={cn('text-sm text-muted-foreground', className)}>
      Room {repair.roomName}
      {repair.task.trade && ` · ${tradeLabels[repair.task.trade]}`} · {accessLabel(repair.access)}
    </p>
  );
}

/**
 * Who can fix a repair, each with a call link and a drafted email, and the emails about it.
 * Calling or sending the email records them as asked. Anyone else in the contacts can be picked
 * too.
 */
export function RepairContacts({
  repair,
  writeTo,
  onLeave,
}: {
  repair: Repair;
  writeTo?: string;
  /** Runs when an email is opened in the inbox, e.g. to close the dialog. */
  onLeave?: () => void;
}) {
  const all = useContacts();
  const inbox = useInbox();
  const ask = useAskToRepair(repair.task.id);
  const [picked, setPicked] = useState<string[]>([]);
  const [writing, setWriting] = useState<Contact | null>(
    () => repair.contacts.find((c) => c.id === writeTo) ?? null,
  );
  const shown = [
    ...(repair.contact && !repair.contacts.some((c) => c.id === repair.contact!.id)
      ? [repair.contact]
      : []),
    ...repair.contacts,
    ...(all.data ?? []).filter((c) => picked.includes(c.id)),
  ].filter((c, i, list) => list.findIndex((o) => o.id === c.id) === i);
  const others = (all.data ?? []).filter((c) => !shown.some((s) => s.id === c.id));
  const asked = (id: string) => repair.contact?.id === id || ask.variables === id;
  const emails = repairConversations(repair.task.id, inbox.data ?? []);

  if (writing) {
    return (
      <WorkOrderEditor
        repair={repair}
        contact={writing}
        onBack={() => setWriting(null)}
        onSent={() => setWriting(null)}
      />
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {emails.length > 0 && <ConversationList conversations={emails} onOpen={onLeave} />}
      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No {repair.task.trade ? tradeLabels[repair.task.trade].toLowerCase() : ''} contact yet
        </p>
      ) : (
        <ul className="-mx-2 flex flex-col">
          {shown.map((contact) => (
            <li key={contact.id} className="flex items-center gap-3 rounded-lg px-2 py-2">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-center gap-1.5 truncate font-medium">
                  {contactName(contact)}
                  {asked(contact.id) && (
                    <span className="flex items-center gap-0.5 text-xs font-normal text-success">
                      <Check className="size-3" /> Asked
                    </span>
                  )}
                </span>
                {contact.notes && (
                  <span className="truncate text-xs text-muted-foreground">{contact.notes}</span>
                )}
              </span>
              <span className="flex shrink-0 items-center gap-1">
                {contact.phone && (
                  <Button asChild variant="outline" size="xs">
                    <a href={telHref(contact.phone)} onClick={() => ask.mutate(contact.id)}>
                      <Phone /> {contact.phone}
                    </a>
                  </Button>
                )}
                {contact.email && (
                  <Button variant="outline" size="xs" onClick={() => setWriting(contact)}>
                    <Mail /> Email
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {ask.error && <ErrorNotice message={ask.error.message} onDismiss={() => ask.reset()} />}
      <div className="flex items-center gap-2 border-t pt-3">
        {others.length > 0 && (
          <div className="min-w-0 flex-1">
            <Select
              aria-label="Someone else"
              value=""
              onValueChange={(value) => setPicked((p) => [...p, value])}
              className="h-8"
            >
              <option value="" disabled>
                Someone else…
              </option>
              {others.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.trades.map((t) => tradeLabels[t]).join(', ')})
                </option>
              ))}
            </Select>
          </div>
        )}
        <Button asChild variant="ghost" size="sm" className="ml-auto">
          <Link
            to={`/contacts?new=contact${repair.task.trade ? `&trade=${repair.task.trade}` : ''}`}
          >
            <UserPlus /> New contact
          </Link>
        </Button>
      </div>
    </div>
  );
}

/** The drafted email, for staff to edit and send from the hotel's mailbox. */
function WorkOrderEditor({
  repair,
  contact,
  onBack,
  onSent,
}: {
  repair: Repair;
  contact: Contact;
  onBack: () => void;
  onSent: () => void;
}) {
  const draft = useWorkOrder(repair.task.id);
  const send = useSendWorkOrder(repair.task.id);
  const navigate = useNavigate();
  const { toast } = useToast();
  const [email, setEmail] = useState<WorkOrder | null>(null);
  const { mutate } = draft;

  useEffect(() => {
    mutate(contact.id, {
      onSuccess: setEmail,
      // Without a draft staff still write it themselves.
      onError: () =>
        setEmail({
          to: contact.email,
          subject: `Room ${repair.roomName}: ${repair.task.notes ?? 'Repair'}`,
          body: '',
        }),
    });
  }, [mutate, contact.id, contact.email, repair.roomName, repair.task.notes]);

  const submit = () => {
    if (!email) return;
    // Sending can take this row off Today's list, so the toast doesn't wait on it staying open.
    send
      .mutateAsync({ contactId: contact.id, subject: email.subject, body: email.body })
      .then((sent) => {
        toast({
          title: `Sent to ${contact.name}`,
          action: {
            label: 'Open',
            run: () => void navigate(`/inbox/${encodeURIComponent(sent.id)}`),
          },
        });
        onSent();
      })
      .catch(() => {
        // Shown below the email while the dialog is open.
      });
  };

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <p className="text-sm">
        To <span className="font-medium">{contactName(contact)}</span>
        <span className="text-muted-foreground"> · {contact.email}</span>
      </p>
      {draft.error && <ErrorNotice message={draft.error.message} />}
      {!email ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8" />
          <Skeleton className="h-40" />
        </div>
      ) : (
        <>
          <Input
            aria-label="Subject"
            value={email.subject}
            onChange={(e) => setEmail({ ...email, subject: e.target.value })}
          />
          <Textarea
            aria-label="Email"
            rows={9}
            value={email.body}
            onChange={(e) => setEmail({ ...email, body: e.target.value })}
          />
        </>
      )}
      {send.error && <ErrorNotice message={send.error.message} onDismiss={() => send.reset()} />}
      <div className="flex items-center gap-1.5">
        <Button variant="ghost" size="sm" onClick={onBack}>
          Back
        </Button>
        <Button
          size="sm"
          className="ml-auto"
          disabled={!email?.subject.trim() || !email.body.trim() || send.isPending}
          onClick={submit}
        >
          <Send /> Send
        </Button>
      </div>
    </div>
  );
}
