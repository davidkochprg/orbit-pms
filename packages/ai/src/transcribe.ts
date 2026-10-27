import { z } from 'zod';

export interface TranscriptionConfig {
  apiKey: string;
  baseURL: string;
  /** e.g. `muse-voice-transcribe-1.0`. */
  model: string;
}

export interface Transcription {
  transcript: string;
  /** Billed duration. */
  audioSeconds: number;
}

export class TranscriptionError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const responseSchema = z.object({ transcript: z.string(), audioDurationMs: z.number() });
const errorSchema = z.object({ error: z.object({ message: z.string() }) });

/**
 * Transcribes a recording with Meta's speech-to-text endpoint (`POST /asr/transcribe`). It is
 * not OpenAI-compatible: a multipart body with a JSON `request` part and a WAV `audio` part
 * (mono 16-bit PCM at 16 or 24 kHz, at most 10 minutes). `keywords` bias recognition, e.g.
 * toward room names.
 */
export async function transcribeWav(
  config: TranscriptionConfig,
  wav: Uint8Array<ArrayBuffer>,
  { keywords = [], signal }: { keywords?: string[]; signal?: AbortSignal } = {},
): Promise<Transcription> {
  const body = new FormData();
  body.append(
    'request',
    new Blob(
      [
        JSON.stringify({
          model: config.model,
          audioEncoding: 'WAV',
          mode: 'PUSH_TO_TALK',
          ...(keywords.length > 0 && { keywords }),
        }),
      ],
      { type: 'application/json' },
    ),
  );
  body.append('audio', new Blob([wav], { type: 'audio/wav' }), 'note.wav');

  const res = await fetch(`${config.baseURL.replace(/\/$/, '')}/asr/transcribe`, {
    method: 'POST',
    headers: { authorization: `Bearer ${config.apiKey}`, accept: 'application/json' },
    body,
    ...(signal && { signal }),
  });
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const parsed = errorSchema.safeParse(json);
    throw new TranscriptionError(
      res.status,
      parsed.success ? parsed.data.error.message : `Transcription failed with ${res.status}`,
    );
  }
  const { transcript, audioDurationMs } = responseSchema.parse(json);
  return { transcript: transcript.trim(), audioSeconds: Math.ceil(audioDurationMs / 1000) };
}
