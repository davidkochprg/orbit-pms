import { Mic, Square } from 'lucide-react';
import { ThinkingOrb } from 'thinking-orbs';
import { Button } from '@/components/ui/button';
import type { VoiceQuestion } from '@/hooks/use-voice-question';
import { cn } from '@/lib/utils';

/** Starts asking out loud, or stops and sends what was said. */
export function MicButton({ voice }: { voice: VoiceQuestion }) {
  const recording = voice.state === 'recording';
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={recording ? 'Stop and ask' : 'Ask out loud'}
      tooltip={recording ? 'Stop and ask' : 'Ask out loud'}
      disabled={voice.state === 'transcribing'}
      onClick={voice.toggle}
      className={cn('shrink-0', recording && 'text-destructive hover:text-destructive')}
    >
      {recording ? <Square className="size-3.5 fill-current" /> : <Mic className="size-[18px]" />}
    </Button>
  );
}

/** Takes the input's place while a question is being recorded or read. */
export function VoiceStatus({ voice }: { voice: VoiceQuestion }) {
  if (voice.state === 'recording') {
    const s = voice.seconds;
    return (
      <span role="status" className="flex flex-1 items-center gap-2.5 text-base text-foreground">
        <span className="relative flex size-2.5">
          <span className="absolute inset-0 animate-ping rounded-full bg-destructive/60 motion-reduce:hidden" />
          <span className="relative size-2.5 rounded-full bg-destructive" />
        </span>
        Listening…
        <span className="font-mono text-sm text-muted-foreground tabular-nums">
          {Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}
        </span>
      </span>
    );
  }
  return (
    <span
      role="status"
      className="flex flex-1 items-center gap-2.5 text-base text-muted-foreground"
    >
      <ThinkingOrb state="searching" size={20} aria-hidden />
      Transcribing…
    </span>
  );
}
