import { describe, expect, it } from 'vitest';
import { daylightAt, formatMinute, glowColor, inkFor, phaseLabel } from './daylight';

describe('daylightAt', () => {
  it('is white with an orange glow at sunrise', () => {
    const s = daylightAt(7 * 60);
    expect(s.night).toBe(0);
    expect(s.ink).toBe(0);
    expect(s.glow.h).toBe(55);
  });

  it('is fully dark at night with a pale blue moon glow', () => {
    const s = daylightAt(23 * 60);
    expect(s.night).toBe(1);
    expect(s.ink).toBe(1);
    expect(s.glow.l).toBeGreaterThan(0.75);
    expect(((s.glow.h % 360) + 360) % 360).toBe(235);
  });

  it('darkens gradually through dusk', () => {
    const nights = [17, 18, 19, 20, 21].map((h) => daylightAt(h * 60).night);
    expect(nights).toEqual([...nights].sort((a, b) => a - b));
    expect(nights[2]).toBeGreaterThan(0);
    expect(nights[2]).toBeLessThan(1);
  });

  it('crosses the low-contrast mid-tones within twenty minutes, morning and evening', () => {
    const minutes = Array.from({ length: 1440 }, (_, m) => m);
    const mid = minutes.filter((m) => {
      const { night } = daylightAt(m);
      return night > 0.3 && night < 0.75;
    });
    expect(mid.length).toBeLessThanOrEqual(40);
  });

  it('loops smoothly across midnight', () => {
    const before = daylightAt(1439);
    const after = daylightAt(0);
    expect(before.night).toBe(after.night);
    expect(Math.abs(before.glow.alpha - after.glow.alpha)).toBeLessThan(0.01);
    expect(daylightAt(1440)).toEqual(after);
    expect(daylightAt(-60)).toEqual(daylightAt(1380));
  });
});

describe('inkFor', () => {
  it('flips text quickly around the midpoint to keep contrast', () => {
    expect(inkFor(0.4)).toBe(0);
    expect(inkFor(0.5)).toBe(0.5);
    expect(inkFor(0.6)).toBe(1);
  });
});

describe('formatting', () => {
  it('formats minutes as a clock time and names the phase', () => {
    expect(formatMinute(7 * 60 + 5)).toBe('07:05');
    expect(formatMinute(1440)).toBe('00:00');
    expect(phaseLabel(7 * 60)).toBe('Sunrise');
    expect(phaseLabel(13 * 60)).toBe('Daytime');
    expect(phaseLabel(19 * 60)).toBe('Dusk');
    expect(phaseLabel(2 * 60)).toBe('Night');
  });

  it('builds an oklch glow color', () => {
    expect(glowColor({ l: 0.76, c: 0.16, h: 55, alpha: 0.7 }, 0.5)).toBe(
      'oklch(0.76 0.16 55 / 0.35)',
    );
  });
});
