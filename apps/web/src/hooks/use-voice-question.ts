import { useCallback, useLayoutEffect, useRef } from 'react';
import { useVoiceRecorder } from '@/hooks/use-voice-recorder';
import { useTranscribeQuestion } from '@/lib/api';

export type VoiceQuestionState = 'idle' | 'recording' | 'transcribing';

/** Whether this browser can record at all: plain-HTTP pages and old browsers can't. */
export const canRecord = () =>
  typeof navigator !== 'undefined' &&
  typeof navigator.mediaDevices?.getUserMedia === 'function' &&
  typeof MediaRecorder !== 'undefined';

/**
 * A question asked out loud: records until stopped (at most a minute), transcribes it with Meta's
 * speech-to-text and hands the text to `onText`. Nothing is sent when nothing was heard.
 */
export function useVoiceQuestion(onText: (text: string) => void) {
  const transcribe = useTranscribeQuestion();
  const latest = useRef(onText);
  useLayoutEffect(() => {
    latest.current = onText;
  });
  const { mutate } = transcribe;
  const onRecorded = useCallback(
    (wav: Blob) =>
      mutate(wav, {
        onSuccess: ({ text }) => {
          if (text.trim()) latest.current(text.trim());
        },
      }),
    [mutate],
  );
  const recorder = useVoiceRecorder({ maxSeconds: 60, onRecorded });
  const state: VoiceQuestionState =
    recorder.state === 'recording'
      ? 'recording'
      : recorder.state === 'converting' || transcribe.isPending
        ? 'transcribing'
        : 'idle';

  return {
    state,
    seconds: recorder.seconds,
    error: recorder.error ?? (transcribe.error ? transcribe.error.message : null),
    /** Starts recording, or stops and sends what was said. */
    toggle: () => {
      if (state === 'recording') recorder.stop();
      else if (state === 'idle') {
        transcribe.reset();
        void recorder.start();
      }
    },
    cancel: recorder.cancel,
  };
}

export type VoiceQuestion = ReturnType<typeof useVoiceQuestion>;
