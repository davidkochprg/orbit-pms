import type { Context } from 'hono';
import { errorBody } from './http';

/** About 2.5 minutes of 16 kHz mono 16-bit WAV. */
export const MAX_RECORDING_BYTES = 5 * 1024 * 1024;

function isWav(bytes: Uint8Array): boolean {
  const tag = (from: number) => String.fromCharCode(...bytes.subarray(from, from + 4));
  return bytes.length > 44 && tag(0) === 'RIFF' && tag(8) === 'WAVE';
}

/**
 * The WAV recording uploaded as the multipart field `audio`, or the error response to send: 413
 * when it is too long, 400 when it is missing or not a WAV file.
 */
export async function readRecording(
  c: Context,
): Promise<{ wav: Uint8Array<ArrayBuffer> } | { error: Response }> {
  const tooLong = () => ({
    error: c.json(errorBody('too_large', 'The recording is too long.'), 413),
  });
  if (Number(c.req.header('content-length') ?? 0) > MAX_RECORDING_BYTES) return tooLong();
  const form = await c.req.formData().catch(() => null);
  const audio = form?.get('audio');
  if (!(audio instanceof File)) {
    return {
      error: c.json(errorBody('invalid_input', 'Send the recording as an "audio" file.'), 400),
    };
  }
  const wav = new Uint8Array(await audio.arrayBuffer());
  if (wav.length > MAX_RECORDING_BYTES) return tooLong();
  if (!isWav(wav)) {
    return {
      error: c.json(errorBody('invalid_input', 'The recording must be a WAV file.'), 400),
    };
  }
  return { wav };
}
