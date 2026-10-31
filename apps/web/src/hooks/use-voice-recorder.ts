import { useCallback, useEffect, useRef, useState } from 'react';
import { recordingToWav } from '@/lib/wav';

export type RecorderState = 'idle' | 'recording' | 'converting';

function micError(err: unknown): string {
  if (err instanceof DOMException && err.name === 'NotAllowedError') {
    return 'Microphone access is blocked. Allow it for this site, or type instead.';
  }
  if (err instanceof DOMException && err.name === 'NotFoundError') {
    return 'No microphone found. Type instead.';
  }
  return 'Recording is not available in this browser. Type instead.';
}

/**
 * Records from the microphone and hands back a 16 kHz mono WAV when stopped. Stops by itself
 * after `maxSeconds`.
 */
export function useVoiceRecorder({
  maxSeconds = 120,
  onRecorded,
}: {
  maxSeconds?: number;
  onRecorded: (wav: Blob) => void;
}) {
  const [state, setState] = useState<RecorderState>('idle');
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const discard = useRef(false);

  const stop = useCallback(() => {
    if (recorder.current?.state === 'recording') recorder.current.stop();
  }, []);

  const cancel = useCallback(() => {
    discard.current = true;
    stop();
  }, [stop]);

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: Blob[] = [];
      const media = new MediaRecorder(stream);
      media.ondataavailable = (e) => chunks.push(e.data);
      media.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        recorder.current = null;
        if (discard.current) {
          discard.current = false;
          setState('idle');
          return;
        }
        setState('converting');
        recordingToWav(new Blob(chunks, { type: media.mimeType }))
          .then(onRecorded)
          .catch(() => setError('The recording could not be read. Please try again.'))
          .finally(() => setState('idle'));
      };
      recorder.current = media;
      discard.current = false;
      setSeconds(0);
      media.start();
      setState('recording');
    } catch (err) {
      setError(micError(err));
      setState('idle');
    }
  }, [onRecorded]);

  useEffect(() => {
    if (state !== 'recording') return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [state]);

  useEffect(() => {
    if (state === 'recording' && seconds >= maxSeconds) stop();
  }, [state, seconds, maxSeconds, stop]);

  // Release the microphone if the component goes away mid-recording.
  useEffect(() => cancel, [cancel]);

  return { state, seconds, error, start, stop, cancel };
}
