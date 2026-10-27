/** Meta's speech-to-text takes mono 16-bit PCM WAV at 16 kHz. */
export const VOICE_SAMPLE_RATE = 16_000;

/** Encodes mono samples in [-1, 1] as a 16-bit PCM WAV file. */
export function encodeWav(
  samples: Float32Array,
  sampleRate = VOICE_SAMPLE_RATE,
): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const text = (offset: number, value: string) =>
    [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  text(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, i) => {
    const s = Math.max(-1, Math.min(1, sample));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  });
  return bytes;
}

/**
 * Turns a browser recording (WebM/Opus, MP4/AAC, …) into a 16 kHz mono WAV: decode, then let an
 * OfflineAudioContext downmix and resample.
 */
export async function recordingToWav(recording: Blob): Promise<Blob> {
  const decoded = await new AudioContext().decodeAudioData(await recording.arrayBuffer());
  const frames = Math.ceil(decoded.duration * VOICE_SAMPLE_RATE);
  const offline = new OfflineAudioContext(1, frames, VOICE_SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();
  return new Blob([encodeWav(rendered.getChannelData(0))], { type: 'audio/wav' });
}
