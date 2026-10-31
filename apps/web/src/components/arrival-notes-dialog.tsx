import type { ArrivalNote, ArrivalNoteDue, ArrivalNotes } from '@orbit/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Check, PenLine, Send } from 'lucide-react';
import { useState } from 'react';
import { ThinkingOrb } from 'thinking-orbs';
import { RoomBadge } from '@/components/agent-mention';
import { ErrorNotice } from '@/components/error-notice';
import { GuestAvatar } from '@/components/guest-avatar';
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
import { useToast } from '@/hooks/use-toast';
import { useDraftArrivalNote, useSendArrivalNote } from '@/lib/api';
import { formatDate, formatParty, languageLabels } from '@/lib/format';

type NoteState =
  | { status: 'idle' }
  | { status: 'drafting' }
  | { status: 'ready'; note: ArrivalNote }
  | { status: 'sending'; note: ArrivalNote }
  | { status: 'sent' }
  | { status: 'error'; message: string; note?: ArrivalNote };

/** At most this many notes are written at once. */
const PARALLEL = 3;

/**
 * Tomorrow's guests who haven't heard from the hotel: a note for each, written on request in the
 * guest's language, to read, change and send. Each goes out as an email linked to the booking.
 */
export function ArrivalNotesDialog({
  notes,
  open,
  onOpenChange,
}: {
  notes: ArrivalNotes;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const draft = useDraftArrivalNote();
  const send = useSendArrivalNote();
  const [states, setStates] = useState<Record<string, NoteState>>({});
  const stateOf = (id: string): NoteState => states[id] ?? { status: 'idle' };
  const set = (id: string, state: NoteState) => setStates((s) => ({ ...s, [id]: state }));

  const write = (id: string) => {
    set(id, { status: 'drafting' });
    return draft
      .mutateAsync(id)
      .then((note) => set(id, { status: 'ready', note }))
      .catch((err: Error) => set(id, { status: 'error', message: err.message }));
  };

  const writeAll = async () => {
    const queue = notes.due
      .map((d) => d.bookingId)
      .filter((id) => ['idle', 'error'].includes(stateOf(id).status));
    const next = async (): Promise<void> => {
      const id = queue.shift();
      if (!id) return;
      await write(id);
      return next();
    };
    await Promise.all(Array.from({ length: PARALLEL }, next));
  };

  const deliver = (id: string, note: ArrivalNote) => {
    set(id, { status: 'sending', note });
    return send
      .mutateAsync({ bookingId: id, note })
      .then(() => set(id, { status: 'sent' }))
      .catch((err: Error) => set(id, { status: 'error', message: err.message, note }));
  };

  const ready = notes.due.flatMap((d) => {
    const s = stateOf(d.bookingId);
    return s.status === 'ready' ? [{ id: d.bookingId, note: s.note }] : [];
  });
  const writable = notes.due.filter((d) =>
    ['idle', 'error'].includes(stateOf(d.bookingId).status),
  ).length;
  const drafting = notes.due.some((d) => stateOf(d.bookingId).status === 'drafting');
  const sent = notes.due.filter((d) => stateOf(d.bookingId).status === 'sent').length;

  const close = (next: boolean) => {
    onOpenChange(next);
    if (next) return;
    if (sent > 0) {
      toast({ title: sent === 1 ? 'Sent 1 note' : `Sent ${sent} notes` });
      void queryClient.invalidateQueries({ queryKey: ['arrival-notes'] });
    }
    setStates({});
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="shadow-floating sm:max-w-2xl" aria-describedby={undefined}>
        <DialogHeader className="flex-row items-center gap-3 pr-8">
          <DialogTitle className="flex-1">Arriving {formatDate(notes.date)}</DialogTitle>
          {writable > 0 && (
            <Button size="sm" variant="outline" disabled={drafting} onClick={() => void writeAll()}>
              <PenLine /> {writable === notes.due.length ? 'Draft all' : `Draft ${writable} more`}
            </Button>
          )}
        </DialogHeader>
        <ul className="scrollbar-thin -mx-6 flex max-h-[60vh] flex-col overflow-y-auto px-6">
          {notes.due.map((d) => (
            <NoteRow
              key={d.bookingId}
              due={d}
              state={stateOf(d.bookingId)}
              onDraft={() => void write(d.bookingId)}
              onEdit={(note) => set(d.bookingId, { status: 'ready', note })}
              onSend={(note) => void deliver(d.bookingId, note)}
            />
          ))}
        </ul>
        <DialogFooter>
          <Button variant="ghost" onClick={() => close(false)}>
            {sent > 0 ? 'Done' : 'Not now'}
          </Button>
          {ready.length > 1 && (
            <Button onClick={() => ready.forEach(({ id, note }) => void deliver(id, note))}>
              <Send /> Send {ready.length}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NoteRow({
  due,
  state,
  onDraft,
  onEdit,
  onSend,
}: {
  due: ArrivalNoteDue;
  state: NoteState;
  onDraft: () => void;
  onEdit: (note: ArrivalNote) => void;
  onSend: (note: ArrivalNote) => void;
}) {
  const note = 'note' in state ? state.note : undefined;
  const editable = state.status === 'ready' || (state.status === 'error' && note);
  return (
    <li className="flex flex-col gap-2 border-b py-3 last:border-b-0">
      <div className="flex items-center gap-3">
        <GuestAvatar name={due.guestName} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium">{due.guestName}</span>
          <span className="truncate text-xs text-muted-foreground">
            {languageLabels[due.language]} · {due.roomTypeName} ·{' '}
            {formatParty(due.adults, due.childAges)}
          </span>
        </span>
        <RoomBadge name={due.roomName} />
        <span className="flex w-24 shrink-0 justify-end">
          {state.status === 'idle' && (
            <Button size="xs" variant="outline" onClick={onDraft}>
              Draft
            </Button>
          )}
          {state.status === 'drafting' && (
            <ThinkingOrb state="composing" size={20} aria-label="Drafting" />
          )}
          {state.status === 'sending' && <ThinkingOrb state="searching" size={20} />}
          {state.status === 'sent' && (
            <span className="flex items-center gap-1 text-xs text-success">
              <Check className="size-3.5" /> Sent
            </span>
          )}
          {state.status === 'error' && !note && (
            <Button size="xs" variant="outline" onClick={onDraft}>
              Try again
            </Button>
          )}
          {editable && note && (
            <Button size="xs" onClick={() => onSend(note)}>
              Send
            </Button>
          )}
        </span>
      </div>
      {state.status === 'error' && <ErrorNotice message={state.message} />}
      {editable && note && (
        <div className="ml-11 flex flex-col gap-1.5">
          <Input
            aria-label={`Subject for ${due.guestName}`}
            value={note.subject}
            onChange={(e) => onEdit({ ...note, subject: e.target.value })}
            className="h-8 text-sm font-medium"
          />
          <Textarea
            aria-label={`Note to ${due.guestName}`}
            value={note.body}
            onChange={(e) => onEdit({ ...note, body: e.target.value })}
            className="max-h-72 min-h-40 text-[0.8125rem] leading-5"
          />
        </div>
      )}
    </li>
  );
}
