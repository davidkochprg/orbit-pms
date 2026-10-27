import { describe, expect, it } from 'vitest';
import { daylightAt, formatMinute, glowColor, phaseLabel } from './daylight';

const hue = (minute: number) => ((daylightAt(minute).glow.h % 360) + 360) % 360;

describe('daylightAt', () => {
  it('follows the colors of the sky through the day', () => {
    expect(hue(5 * 60 + 30)).toBe(275); // blue hour, indigo
    expect(hue(6 * 60)).toBe(15); // dawn pink
    expect(hue(7 * 60 + 15)).toBe(75); // golden light
    expect(hue(13 * 60)).toBe(235); // pale sky blue
    expect(hue(18 * 60 + 30)).toBe(45); // sunset orange
    expect(hue(20 * 60)).toBe(275); // evening blue hour
  });

  it('keeps midday light pale and low in saturation', () => {
    const { glow } = daylightAt(13 * 60);
    expect(glow.l).toBeGreaterThan(0.8);
    expect(glow.c).toBeLessThan(0.1);
  });

  it('is faint cool moonlight at night', () => {
    const s = daylightAt(23 * 60);
    expect(s.night).toBe(1);
    expect(hue(23 * 60)).toBe(255);
    expect(s.glow.c).toBeLessThan(0.08);
  });

  it('never turns green when moving between warm and blue light', () => {
    for (let m = 0; m < 1440; m++) {
      const { glow } = daylightAt(m);
      const h = ((glow.h % 360) + 360) % 360;
      if (h > 110 && h < 200) expect(glow.c).toBeLessThan(0.01);
    }
  });

  it('is only ever fully light or fully dark, switching at 06:30 and 19:30', () => {
    const nights = new Set(Array.from({ length: 1440 }, (_, m) => daylightAt(m).night));
    expect(nights).toEqual(new Set([0, 1]));
    expect(daylightAt(6 * 60 + 29).night).toBe(1);
    expect(daylightAt(6 * 60 + 30).night).toBe(0);
    expect(daylightAt(19 * 60 + 29).night).toBe(0);
    expect(daylightAt(19 * 60 + 30).night).toBe(1);
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

describe('formatting', () => {
  it('formats minutes as a clock time and names the phase', () => {
    expect(formatMinute(7 * 60 + 5)).toBe('07:05');
    expect(formatMinute(1440)).toBe('00:00');
    expect(phaseLabel(7 * 60)).toBe('Sunrise');
    expect(phaseLabel(13 * 60)).toBe('Midday');
    expect(phaseLabel(19 * 60)).toBe('Sunset');
    expect(phaseLabel(5 * 60 + 30)).toBe('Blue hour');
    expect(phaseLabel(2 * 60)).toBe('Night');
  });

  it('builds an oklch glow color', () => {
    expect(glowColor({ l: 0.76, c: 0.16, h: 55, alpha: 0.7 }, 0.5)).toBe(
      'oklch(0.76 0.16 55 / 0.35)',
    );
  });
});
