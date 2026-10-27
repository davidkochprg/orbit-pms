import { afterEach, describe, expect, it, vi } from 'vitest';
import { TranscriptionError, transcribeWav } from './transcribe';

const config = { apiKey: 'k', baseURL: 'https://meta.invalid/v1/', model: 'voice-model' };
const wav = new Uint8Array([82, 73, 70, 70]);

afterEach(() => vi.unstubAllGlobals());

describe('transcribeWav', () => {
  it('sends the multipart request Meta expects and returns the transcript', async () => {
    const fetchMock = vi.fn((_url: string, _init: RequestInit) =>
      Response.json({
        sessionId: 's',
        transcript: ' room 104 done ',
        audioDurationMs: 4200,
        turns: [],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await transcribeWav(config, wav, { keywords: ['104', 'A1'] });

    expect(result).toEqual({ transcript: 'room 104 done', audioSeconds: 5 });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://meta.invalid/v1/asr/transcribe');
    expect(init.headers).toMatchObject({ authorization: 'Bearer k', accept: 'application/json' });
    const form = init.body as FormData;
    expect(JSON.parse(await (form.get('request') as Blob).text())).toEqual({
      model: 'voice-model',
      audioEncoding: 'WAV',
      mode: 'PUSH_TO_TALK',
      keywords: ['104', 'A1'],
    });
    expect((form.get('audio') as Blob).type).toBe('audio/wav');
  });

  it("throws Meta's error message with the status", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Response.json({ error: { message: 'Unsupported WAV' } }, { status: 400 })),
    );
    const error = await transcribeWav(config, wav).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TranscriptionError);
    expect(error).toMatchObject({ status: 400, message: 'Unsupported WAV' });
  });
});
