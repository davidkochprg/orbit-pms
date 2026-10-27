import { describe, expect, it } from 'vitest';
import { activeClusters, CLUSTER_GLYPHS, clusterAlpha, clusterGlyph } from './glyph-clusters';

const grid = { cols: 80, rows: 60 };
const data = ['OCC 50%', 'ARR 08', 'RM 104'];

describe('activeClusters', () => {
  it('keeps every cluster inside the grid', () => {
    for (let t = 0; t < 60; t += 0.37) {
      for (const c of activeClusters(t, grid, data)) {
        expect(c.col).toBeGreaterThanOrEqual(0);
        expect(c.row).toBeGreaterThanOrEqual(0);
        expect(c.col + c.width).toBeLessThanOrEqual(grid.cols);
        expect(c.row + c.height).toBeLessThanOrEqual(grid.rows);
        expect(c.start).toBeLessThanOrEqual(t);
        expect(c.end).toBeGreaterThan(t);
      }
    }
  });

  it('smears behind some noise clusters, from their left, never behind data', () => {
    const all = Array.from({ length: 200 }, (_, i) => activeClusters(i * 0.3, grid, data)).flat();
    const smeared = all.filter((c) => c.smearFrom !== null);
    expect(smeared.length).toBeGreaterThan(0);
    expect(
      smeared.every((c) => c.lines === null && c.smearFrom! >= 0 && c.smearFrom! <= c.col),
    ).toBe(true);
  });

  it('is the same for the same moment', () => {
    expect(activeClusters(12.5, grid, data)).toEqual(activeClusters(12.5, grid, data));
  });

  it('shows the hotel data in some clusters, and only noise without data', () => {
    const times = Array.from({ length: 200 }, (_, i) => i * 0.3);
    const withData = times.flatMap((t) => activeClusters(t, grid, data));
    expect(withData.some((c) => c.lines?.every((l) => data.includes(l)))).toBe(true);
    const noData = times.flatMap((t) => activeClusters(t, grid, []));
    expect(noData.every((c) => c.lines === null)).toBe(true);
  });
});

describe('clusterGlyph', () => {
  it('draws noise from the glyph set, with gaps', () => {
    const cluster = {
      slot: 5,
      col: 0,
      row: 0,
      width: 8,
      height: 4,
      start: 0,
      end: 3,
      lines: null,
      smearFrom: null,
    };
    const glyphs = Array.from({ length: 32 }, (_, i) => clusterGlyph(cluster, i % 8, i >> 3, 1));
    expect(glyphs.some((g) => g === null)).toBe(true);
    expect(glyphs.filter((g) => g !== null).every((g) => CLUSTER_GLYPHS.includes(g))).toBe(true);
  });

  it('spells out data lines, leaving spaces empty', () => {
    const cluster = {
      slot: 0,
      col: 0,
      row: 0,
      width: 6,
      height: 1,
      start: 0,
      end: 3,
      lines: ['ARR 08'],
      smearFrom: null,
    };
    const text = Array.from({ length: 6 }, (_, x) => clusterGlyph(cluster, x, 0, 1.0));
    expect(text[3]).toBeNull();
    // Most characters are the data itself; an occasional one scrambles.
    expect(text.filter((ch, x) => ch === 'ARR 08'[x]).length).toBeGreaterThanOrEqual(4);
  });
});

describe('clusterAlpha', () => {
  const cluster = {
    slot: 1,
    col: 0,
    row: 0,
    width: 2,
    height: 1,
    start: 10,
    end: 12,
    lines: null,
    smearFrom: null,
  };

  it('is invisible outside its time and fades at the edges', () => {
    expect(clusterAlpha(cluster, 9.9)).toBe(0);
    expect(clusterAlpha(cluster, 12)).toBe(0);
    expect(clusterAlpha(cluster, 10.03)).toBeLessThan(0.5);
    expect(clusterAlpha(cluster, 11.95)).toBeLessThan(0.5);
  });
});
