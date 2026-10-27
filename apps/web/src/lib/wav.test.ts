import { describe, expect, it } from 'vitest';
import { encodeWav } from './wav';

describe('encodeWav', () => {
  it('writes a mono 16-bit PCM header at the given rate', () => {
    const wav = encodeWav(new Float32Array([0, 0.5, -1, 1]), 16_000);
    const view = new DataView(wav.buffer);
    const text = (offset: number) => String.fromCharCode(...wav.subarray(offset, offset + 4));
    expect(text(0)).toBe('RIFF');
    expect(text(8)).toBe('WAVE');
    expect(text(36)).toBe('data');
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(16_000);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(8);
    expect(wav.length).toBe(44 + 8);
  });

  it('scales and clips samples to 16-bit integers', () => {
    const wav = encodeWav(new Float32Array([0.5, -1, 2]));
    const view = new DataView(wav.buffer);
    expect(view.getInt16(44, true)).toBe(Math.floor(0.5 * 0x7fff));
    expect(view.getInt16(46, true)).toBe(-0x8000);
    expect(view.getInt16(48, true)).toBe(0x7fff);
  });
});
