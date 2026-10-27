import { describe, expect, it } from 'vitest';
import {
  bayer,
  DEFAULT_LIGHT,
  GLYPHS,
  glitchOffset,
  haloShade,
  lightFrom,
  glyphIndex,
  onPlanet,
  PLANET,
  RING,
  planetShade,
  ringShade,
  revealAt,
  satellitePosition,
  shootingStar,
  starShade,
} from './space-scene';

describe('planetShade', () => {
  it('is null off the disk and lit towards the top left', () => {
    expect(planetShade(PLANET.u + PLANET.r * 1.01, PLANET.v, 0)).toBeNull();
    const lit = planetShade(PLANET.u - PLANET.r * 0.4, PLANET.v - PLANET.r * 0.3, 0)!;
    const dark = planetShade(PLANET.u + PLANET.r * 0.6, PLANET.v + PLANET.r * 0.5, 0)!;
    expect(lit).toBeGreaterThan(dark);
    expect(lit).toBeLessThanOrEqual(1);
    expect(dark).toBeGreaterThanOrEqual(0);
  });

  it('changes over time as the planet turns', () => {
    const point = [PLANET.u - 0.1, PLANET.v] as const;
    expect(planetShade(...point, 0)).not.toBe(planetShade(...point, 20));
  });
});

describe('ringShade', () => {
  it('draws the ring beside the planet and nothing far away', () => {
    // The ring's far right edge, along its tilted major axis.
    const x = RING.a * 0.9;
    expect(
      ringShade(PLANET.u + x * Math.cos(RING.tilt), PLANET.v + x * Math.sin(RING.tilt)),
    ).toBeGreaterThan(0);
    expect(ringShade(PLANET.u, PLANET.v - 0.95)).toBe(0);
  });
});

describe('satellitePosition', () => {
  it('goes behind the planet for part of its orbit', () => {
    const hidden = Array.from({ length: 200 }, (_, i) => satellitePosition(i / 200, 0)).filter(
      (p) => p.hidden,
    );
    expect(hidden.length).toBeGreaterThan(0);
    expect(hidden.every((p) => !p.front && onPlanet(p.u, p.v))).toBe(true);
  });
});

describe('stars and glyphs', () => {
  it('lights only a few cells', () => {
    let lit = 0;
    for (let col = 0; col < 100; col++) {
      for (let row = 0; row < 100; row++) {
        if (starShade(col, row, 0) > 0) lit++;
      }
    }
    expect(lit).toBeGreaterThan(20);
    expect(lit).toBeLessThan(600);
  });

  it('maps brightness onto the glyph ramp, clamped', () => {
    expect(glyphIndex(0)).toBe(0);
    expect(glyphIndex(1)).toBe(GLYPHS.length - 1);
    expect(glyphIndex(2)).toBe(GLYPHS.length - 1);
    expect(glyphIndex(-1)).toBe(0);
    expect(glyphIndex(0.5)).toBeGreaterThan(glyphIndex(0.2));
  });
});

describe('lighting', () => {
  it('moves the lit side with the pointer', () => {
    const left = [PLANET.u - PLANET.r * 0.6, PLANET.v] as const;
    const fromLeft = planetShade(...left, 0, lightFrom(-1, 0))!;
    const fromRight = planetShade(...left, 0, lightFrom(1, 0))!;
    expect(fromLeft).toBeGreaterThan(fromRight);
  });

  it('glows just outside the disk, brighter towards the light', () => {
    const d = PLANET.r * 1.08;
    expect(haloShade(PLANET.u, PLANET.v - PLANET.r * 2, DEFAULT_LIGHT)).toBe(0);
    expect(haloShade(PLANET.u - d * 0.7, PLANET.v - d * 0.7)).toBeGreaterThan(
      haloShade(PLANET.u + d * 0.7, PLANET.v + d * 0.7),
    );
  });
});

describe('effects', () => {
  it('dithers within -0.5..0.5', () => {
    const values = Array.from({ length: 16 }, (_, i) => bayer(i % 4, Math.floor(i / 4)));
    expect(new Set(values).size).toBe(16);
    expect(Math.min(...values)).toBe(-0.5);
    expect(Math.max(...values)).toBeLessThan(0.5);
  });

  it('tears rows only for a moment every few seconds', () => {
    const torn = (t: number) => Array.from({ length: 90 }, (_, row) => glitchOffset(row, t));
    expect(torn(3).every((o) => o === 0)).toBe(true);
    expect([5.55, 11.05, 16.55, 22.05, 27.55].some((t) => torn(t).some((o) => o !== 0))).toBe(true);
  });

  it('reveals every cell within two seconds, top rows first on average', () => {
    const times = (row: number) =>
      Array.from({ length: 50 }, (_, col) => revealAt(col, row, 50, 40));
    const all = Array.from({ length: 40 }, (_, row) => times(row)).flat();
    expect(Math.max(...all)).toBeLessThan(2);
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(avg(times(0))).toBeLessThan(avg(times(39)));
  });

  it('sends a shooting star now and then', () => {
    expect(shootingStar(9.2)).not.toBeNull();
    expect(shootingStar(13)).toBeNull();
  });
});
