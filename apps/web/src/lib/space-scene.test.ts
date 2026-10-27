import { describe, expect, it } from 'vitest';
import {
  GLYPHS,
  glyphIndex,
  onPlanet,
  PLANET,
  RING,
  planetShade,
  ringShade,
  satellitePosition,
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
