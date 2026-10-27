import { describe, expect, it } from 'vitest';
import {
  burstWindows,
  dataWindow,
  LENS,
  lensWindow,
  MAX_WINDOWS,
  windowsAt,
} from './glitch-windows';

const grid = { cols: 75, rows: 56 };
const times = Array.from({ length: 400 }, (_, i) => i * 0.137);

describe('windowsAt', () => {
  it('keeps every window inside the grid and within the shader limit', () => {
    for (const t of times) {
      const windows = windowsAt(t, grid, [24, 15], { col: 74, row: 0 });
      expect(windows.length).toBeLessThanOrEqual(MAX_WINDOWS);
      for (const w of windows) {
        expect(w.col).toBeGreaterThanOrEqual(0);
        expect(w.row).toBeGreaterThanOrEqual(0);
        expect(w.col + w.cols).toBeLessThanOrEqual(grid.cols);
        expect(w.row + w.rows).toBeLessThanOrEqual(grid.rows);
      }
    }
  });

  it('is the same for the same moment', () => {
    expect(windowsAt(7.3, grid, [24], null)).toEqual(windowsAt(7.3, grid, [24], null));
  });

  it('puts the data line last, so it draws on top', () => {
    const t = times.find((x) => dataWindow(x, grid, [24]) !== null)!;
    expect(windowsAt(t, grid, [24], { col: 10, row: 10 }).at(-1)?.kind).toBe('data');
  });
});

describe('burstWindows', () => {
  it('comes and goes, with stacked bars that never overlap', () => {
    const bursts = times.map((t) => burstWindows(t, grid));
    expect(bursts.some((b) => b.length === 0)).toBe(true);
    expect(bursts.some((b) => b.length >= 2)).toBe(true);
    for (const b of bursts) {
      for (let i = 1; i < b.length; i++) {
        expect(b[i]!.row).toBeGreaterThanOrEqual(b[i - 1]!.row + b[i - 1]!.rows);
      }
      expect(b.every((w) => w.kind !== 'data')).toBe(true);
    }
  });
});

describe('dataWindow', () => {
  it('cycles through the data lines, sized to fit them', () => {
    const shown = times.map((t) => dataWindow(t, grid, [24, 15])).filter((w) => w !== null);
    expect(new Set(shown.map((w) => w.data))).toEqual(new Set([0, 1]));
    expect(shown.every((w) => w.cols === [24, 15][w.data!]! + 2 && w.rows === 1)).toBe(true);
    expect(dataWindow(1, grid, [])).toBeNull();
  });
});

describe('lensWindow', () => {
  it('centres on the pointer and stays inside the grid at the edges', () => {
    expect(lensWindow({ col: 30, row: 20 }, grid)).toMatchObject({
      kind: 'ascii',
      col: 30 - LENS.cols / 2,
      row: 20 - Math.floor(LENS.rows / 2),
    });
    expect(lensWindow({ col: 0, row: 0 }, grid)).toMatchObject({ col: 0, row: 0 });
    expect(lensWindow({ col: 999, row: 999 }, grid)).toMatchObject({
      col: grid.cols - LENS.cols,
      row: grid.rows - LENS.rows,
    });
  });
});
