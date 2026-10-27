/**
 * Choreography for the welcome scene's glitches: rectangles on the glyph grid where the image is
 * smeared (pixel sort), turned into ASCII, or shows a line of live hotel data. Deterministic in
 * time, so the shader and the text overlay always agree.
 */

/** `glyphsort`: ASCII drawn over a smear. */
export type WindowKind = 'sort' | 'ascii' | 'glyphsort' | 'data';

export interface GlitchWindow {
  kind: WindowKind;
  col: number;
  row: number;
  cols: number;
  rows: number;
  /** Which data line a `data` window shows. */
  data: number | null;
}

export interface Grid {
  cols: number;
  rows: number;
}

export interface Cell {
  col: number;
  row: number;
}

/** The shader's window arrays hold this many. */
export const MAX_WINDOWS = 8;
/** The cursor lens, in cells. */
export const LENS = { cols: 16, rows: 7 };

const fract = (x: number) => x - Math.floor(x);
const hash = (a: number, b: number) => fract(Math.sin(a * 127.1 + b * 311.7) * 43758.5453);
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/**
 * Every few seconds, a stepped stack of bars down the left side: each bar is a smear or an ASCII
 * render, and they switch on one after another and off in reverse, like a bad signal.
 */
export function burstWindows(t: number, grid: Grid): GlitchWindow[] {
  const period = 2.8;
  const k = Math.floor(t / period);
  const start = k * period + hash(k, 1) * 0.9;
  const length = 0.45 + hash(k, 2) * 1.1;
  const local = t - start;
  if (local < 0 || local > length) return [];

  const count = 2 + Math.floor(hash(k, 3) * 4);
  const anchor = Math.floor(hash(k, 4) * grid.cols * 0.25);
  let row = Math.floor(hash(k, 5) * grid.rows * 0.65);
  const windows: GlitchWindow[] = [];
  for (let i = 0; i < count; i++) {
    const rows = 1 + Math.floor(hash(k, 10 + i) * 4);
    const cols = Math.min(grid.cols, 6 + Math.floor(hash(k, 20 + i) * grid.cols * 0.45));
    const col = clamp(anchor + Math.floor((hash(k, 30 + i) - 0.35) * 10), 0, grid.cols - cols);
    const on = local >= i * 0.05 && local <= length - (count - 1 - i) * 0.04;
    if (on && row + rows <= grid.rows) {
      const roll = hash(k, 40 + i);
      windows.push({
        kind: roll < 0.45 ? 'sort' : roll < 0.8 ? 'glyphsort' : 'ascii',
        col,
        row,
        cols,
        rows,
        data: null,
      });
    }
    row += rows + (hash(k, 50 + i) < 0.5 ? 0 : 1 + Math.floor(hash(k, 60 + i) * 3));
  }
  return windows;
}

/** A tall column of ASCII that flickers on the right now and then. */
export function columnWindow(t: number, grid: Grid): GlitchWindow | null {
  const period = 4.1;
  const k = Math.floor(t / period);
  const start = k * period + hash(k, 71) * 1.5;
  const local = t - start;
  if (local < 0 || local > 1.2 + hash(k, 72) * 2) return null;
  const cols = Math.min(grid.cols, 3 + Math.floor(hash(k, 73) * 5));
  const rows = Math.min(grid.rows, 5 + Math.floor(hash(k, 74) * 8));
  return {
    kind: 'ascii',
    col: clamp(Math.floor(grid.cols * (0.55 + hash(k, 75) * 0.4)), 0, grid.cols - cols),
    row: clamp(Math.floor(hash(k, 76) * grid.rows * 0.8), 0, grid.rows - rows),
    cols,
    rows,
    data: null,
  };
}

/** One line of live data at a time, in the lower half, cycling through the lines. */
export function dataWindow(t: number, grid: Grid, lengths: number[]): GlitchWindow | null {
  if (lengths.length === 0) return null;
  const period = 5.2;
  const k = Math.floor(t / period);
  if (t - k * period > 3.4) return null;
  const data = k % lengths.length;
  const cols = Math.min(grid.cols, lengths[data]! + 2);
  return {
    kind: 'data',
    col: clamp(Math.floor(hash(k, 81) * grid.cols * 0.45), 0, grid.cols - cols),
    row: clamp(Math.floor(grid.rows * (0.55 + hash(k, 82) * 0.3)), 0, grid.rows - 1),
    cols,
    rows: 1,
    data,
  };
}

/** The ASCII lens around the pointer's cell, kept inside the grid. */
export function lensWindow(cell: Cell, grid: Grid): GlitchWindow {
  const cols = Math.min(LENS.cols, grid.cols);
  const rows = Math.min(LENS.rows, grid.rows);
  return {
    kind: 'ascii',
    col: clamp(cell.col - Math.floor(cols / 2), 0, grid.cols - cols),
    row: clamp(cell.row - Math.floor(rows / 2), 0, grid.rows - rows),
    cols,
    rows,
    data: null,
  };
}

/**
 * All windows at time `t`, bottom to top: bursts, the column, the lens, then data, which must
 * stay readable. At most MAX_WINDOWS; the oldest burst bars give way first.
 */
export function windowsAt(
  t: number,
  grid: Grid,
  dataLengths: number[],
  lens: Cell | null,
): GlitchWindow[] {
  const windows = [...burstWindows(t, grid)];
  const column = columnWindow(t, grid);
  if (column) windows.push(column);
  if (lens) windows.push(lensWindow(lens, grid));
  const data = dataWindow(t, grid, dataLengths);
  if (data) windows.push(data);
  return windows.slice(-MAX_WINDOWS);
}
