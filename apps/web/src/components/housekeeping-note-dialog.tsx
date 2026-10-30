import type { HousekeepingNoteResult } from '@orbit/shared';
import { ArrowRight, LoaderCircle, Mic, Square, Wrench } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { ErrorNotice } from '@/components/error-notice';
import { StatusDot } from '@/components/status-dot';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useVoiceRecorder } from '@/hooks/use-voice-recorder';
import { useHousekeepingNote } from '@/lib/api';
import { changeLabel, formatSeconds } from '@/lib/housekeeping';
import { roomStatusColor } from '@/lib/status';
import { cn } from '@/lib/utils';

export type NoteMode = 'voice' | 'text';

/**
 * Record or type a housekeeping note. Orbit transcribes it, reads it and applies the changes
 * right away; the result lists exactly what changed.
 */
export function HousekeepingNoteDialog({
  open,
  onOpenChange,
  mode,
  onModeChange,
  voiceAvailable,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: NoteMode;
  onModeChange: (mode: NoteMode) => void;
  voiceAvailable: boolean;
}) {
  const note = useHousekeepingNote();
  const reset = () => note.reset();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent aria-describedby={undefined} className="gap-5 shadow-floating sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Housekeeping note</DialogTitle>
        </DialogHeader>

        {note.data ? (
          <NoteResult result={note.data} onAnother={reset} onClose={() => onOpenChange(false)} />
        ) : note.isPending ? (
          <p className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            {mode === 'voice' ? 'Listening to your note…' : 'Reading your note…'}
          </p>
        ) : mode === 'voice' && voiceAvailable ? (
          <VoiceInput
            onRecorded={(audio) => note.mutate({ audio })}
            onType={() => onModeChange('text')}
          />
        ) : (
          <TextInput
            onSubmit={(text) => note.mutate({ text })}
            onVoice={voiceAvailable ? () => onModeChange('voice') : undefined}
          />
        )}

        {note.isError && <ErrorNotice message={note.error.message} />}
      </DialogContent>
    </Dialog>
  );
}

function VoiceInput({
  onRecorded,
  onType,
}: {
  onRecorded: (wav: Blob) => void;
  onType: () => void;
}) {
  const recorder = useVoiceRecorder({ onRecorded });
  const recording = recorder.state === 'recording';

  return (
    <div className="flex flex-col items-center gap-4 py-2">
      <button
        type="button"
        aria-label={recording ? 'Stop recording' : 'Start recording'}
        disabled={recorder.state === 'converting'}
        onClick={() => (recording ? recorder.stop() : void recorder.start())}
        className={cn(
          'relative flex size-20 items-center justify-center rounded-full text-primary-foreground shadow-floating outline-none focus-visible:ring-4 focus-visible:ring-ring',
          recording ? 'bg-destructive' : 'bg-primary',
        )}
      >
        {recording && (
          <span className="absolute inset-0 animate-ping rounded-full bg-destructive/30 motion-reduce:animate-none" />
        )}
        {recording ? <Square className="size-6 fill-current" /> : <Mic className="size-7" />}
      </button>
      <p className="text-sm text-muted-foreground tabular-nums">
        {recording
          ? `Recording ${formatSeconds(recorder.seconds)}. Tap to finish.`
          : recorder.state === 'converting'
            ? 'Preparing the recording…'
            : 'Tap to record'}
      </p>
      {recorder.error && <ErrorNotice message={recorder.error} className="w-full" />}
      <Button variant="ghost" size="sm" onClick={onType} disabled={recording}>
        Type instead
      </Button>
    </div>
  );
}

function TextInput({
  onSubmit,
  onVoice,
}: {
  onSubmit: (text: string) => void;
  onVoice: (() => void) | undefined;
}) {
  const [text, setText] = useState('');
  function submit(e: FormEvent) {
    e.preventDefault();
    if (text.trim()) onSubmit(text.trim());
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <Textarea
        autoFocus
        rows={4}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="104 is done, the bedside lamp is broken. 201 checked."
      />
      <div className="flex items-center gap-2">
        {onVoice && (
          <Button type="button" variant="ghost" size="sm" onClick={onVoice}>
            <Mic /> Record instead
          </Button>
        )}
        <Button type="submit" size="sm" className="ml-auto" disabled={!text.trim()}>
          Apply note
        </Button>
      </div>
    </form>
  );
}

function NoteResult({
  result,
  onAnother,
  onClose,
}: {
  result: HousekeepingNoteResult;
  onAnother: () => void;
  onClose: () => void;
}) {
  const nothing = result.changes.length === 0;
  return (
    <div className="flex flex-col gap-4">
      {result.transcript && (
        <blockquote className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
          {result.transcript}
        </blockquote>
      )}
      <ul className="flex flex-col gap-2">
        {result.changes.map((change, i) => (
          <li key={i} className="flex items-center gap-2.5 text-sm">
            {change.kind === 'room_status' ? (
              <span className="flex items-center gap-1">
                <StatusDot className={roomStatusColor[change.from]} />
                <ArrowRight className="size-3 text-subtle-foreground" />
                <StatusDot className={roomStatusColor[change.to]} />
              </span>
            ) : (
              <Wrench className="size-4 text-muted-foreground" />
            )}
            {changeLabel(change)}
          </li>
        ))}
        {result.skipped.map((s, i) => (
          <li key={`s${i}`} className="text-sm text-warning">
            Not changed: {s.reason}
          </li>
        ))}
        {result.unclear && <li className="text-sm text-muted-foreground">{result.unclear}</li>}
        {nothing && result.skipped.length === 0 && !result.unclear && (
          <li className="text-sm text-muted-foreground">Nothing to change in this note.</li>
        )}
      </ul>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onAnother}>
          Another note
        </Button>
        <Button size="sm" onClick={onClose}>
          Done
        </Button>
      </div>
    </div>
  );
}
