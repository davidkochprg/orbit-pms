/**
 * Choreography for the welcome scene's glitches: rectangles on the glyph grid where the image is
 * smeared (pixel sort), turned into ASCII, or shows a line of live hotel data. Each fades in and
 * out. Deterministic in time, so the shader and the text overlay always agree.
 */

/** `glyphsort`: ASCII drawn over a smear. */
export type WindowKind = 'sort' | 'ascii' | 'glyphsort' | 'data';

export interface GlitchWindow {
  kind: WindowKind;
  /** Position in cells; `col` may be fractional while a bar drifts. */
  col: number;
  row: number;
  cols: number;
  rows: number;
  /** 0..1, for fading in and out. */
  alpha: number;
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
export const MAX_WINDOWS = 12;
/** The cursor lens, in cells. */
export const LENS = { cols: 16, rows: 7 };

const fract = (x: number) => x - Math.floor(x);
const hash = (a: number, b: number) => fract(Math.sin(a * 127.1 + b * 311.7) * 43758.5453);
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const smooth = (x: number) => {
  const c = clamp(x, 0, 1);
  return c * c * (3 - 2 * c);
};

/** Opacity over a visible span: eased in, held, eased out. */
export function fade(local: number, length: number, inTime = 0.22, outTime = 0.35): number {
  if (local < 0 || local > length) return 0;
  return Math.min(smooth(local / inTime), smooth((length - local) / outTime));
}

interface BurstStream {
  seed: number;
  period: number;
  /** Share of the grid's width the bars start in, from the left. */
  spread: number;
}

/** Two overlapping streams: a frequent one down the left, and a slower one anywhere. */
const STREAMS: BurstStream[] = [
  { seed: 0, period: 2.1, spread: 0.25 },
  { seed: 500, period: 2.9, spread: 0.6 },
];

/**
 * A stepped stack of bars: each a smear, ASCII over a smear, or ASCII, fading in one after another
 * and out in reverse, drifting slowly sideways while they show.
 */
export function burstWindows(t: number, grid: Grid, stream: BurstStream = STREAMS[0]!) {
  const { seed, period, spread } = stream;
  const k = Math.floor(t / period);
  const s = k + seed;
  const start = k * period + hash(s, 1) * period * 0.25;
  const length = 1.1 + hash(s, 2) * 1.4;
  const local = t - start;
  if (local < 0 || local > length) return [];

  const count = 2 + Math.floor(hash(s, 3) * 5);
  const anchor = Math.floor(hash(s, 4) * grid.cols * spread);
  let row = Math.floor(hash(s, 5) * grid.rows * 0.7);
  const windows: GlitchWindow[] = [];
  for (let i = 0; i < count; i++) {
    const rows = 1 + Math.floor(hash(s, 10 + i) * 4);
    const cols = Math.min(grid.cols, 6 + Math.floor(hash(s, 20 + i) * grid.cols * 0.4));
    const drift = (hash(s, 70 + i) - 0.5) * 3 * (local / length);
    const col = clamp(anchor + (hash(s, 30 + i) - 0.35) * 10 + drift, 0, grid.cols - cols);
    const delay = i * 0.07;
    const alpha = fade(local - delay, length - delay - (count - 1 - i) * 0.06);
    if (alpha > 0 && row + rows <= grid.rows) {
      const roll = hash(s, 40 + i);
      windows.push({
        kind: roll < 0.45 ? 'sort' : roll < 0.8 ? 'glyphsort' : 'ascii',
        col,
        row,
        cols,
        rows,
        alpha,
        data: null,
      });
    }
    row += rows + (hash(s, 50 + i) < 0.5 ? 0 : 1 + Math.floor(hash(s, 60 + i) * 3));
  }
  return windows;
}

/** A tall column of ASCII that fades in on the right now and then. */
export function columnWindow(t: number, grid: Grid, seed = 0): GlitchWindow | null {
  const period = 2.6;
  const k = Math.floor(t / period);
  const s = k + seed;
  const local = t - (k * period + hash(s, 71) * 0.8);
  const length = 1.4 + hash(s, 72) * 1.6;
  const alpha = fade(local, length, 0.3, 0.45);
  if (alpha <= 0) return null;
  const cols = Math.min(grid.cols, 3 + Math.floor(hash(s, 73) * 5));
  const rows = Math.min(grid.rows, 5 + Math.floor(hash(s, 74) * 8));
  return {
    kind: 'ascii',
    col: clamp(Math.floor(grid.cols * (0.5 + hash(s, 75) * 0.45)), 0, grid.cols - cols),
    row: clamp(Math.floor(hash(s, 76) * grid.rows * 0.8), 0, grid.rows - rows),
    cols,
    rows,
    alpha,
    data: null,
  };
}

/** One line of live data at a time, in the lower half, cycling through the lines. */
export function dataWindow(t: number, grid: Grid, lengths: number[]): GlitchWindow | null {
  if (lengths.length === 0) return null;
  const period = 5.2;
  const k = Math.floor(t / period);
  const alpha = fade(t - k * period, 3.4, 0.15, 0.4);
  if (alpha <= 0) return null;
  const data = k % lengths.length;
  const cols = Math.min(grid.cols, lengths[data]! + 2);
  return {
    kind: 'data',
    col: clamp(Math.floor(hash(k, 81) * grid.cols * 0.45), 0, grid.cols - cols),
    row: clamp(Math.floor(grid.rows * (0.55 + hash(k, 82) * 0.3)), 0, grid.rows - 1),
    cols,
    rows: 1,
    alpha,
    data,
  };
}

/** The ASCII lens around the pointer's cell, kept inside the grid. */
export function lensWindow(cell: Cell, grid: Grid, alpha = 1): GlitchWindow {
  const cols = Math.min(LENS.cols, grid.cols);
  const rows = Math.min(LENS.rows, grid.rows);
  return {
    kind: 'ascii',
    col: clamp(cell.col - Math.floor(cols / 2), 0, grid.cols - cols),
    row: clamp(cell.row - Math.floor(rows / 2), 0, grid.rows - rows),
    cols,
    rows,
    alpha,
    data: null,
  };
}

/**
 * All windows at time `t`, bottom to top: bursts, columns, the lens, then data, which must stay
 * readable. At most MAX_WINDOWS; the first burst bars give way first.
 */
export function windowsAt(
  t: number,
  grid: Grid,
  dataLengths: number[],
  lens: (Cell & { alpha: number }) | null,
): GlitchWindow[] {
  const windows = STREAMS.flatMap((stream) => burstWindows(t, grid, stream));
  for (const seed of [0, 900]) {
    const column = columnWindow(t, grid, seed);
    if (column) windows.push(column);
  }
  if (lens && lens.alpha > 0) windows.push(lensWindow(lens, grid, lens.alpha));
  const data = dataWindow(t, grid, dataLengths);
  if (data) windows.push(data);
  return windows.slice(-MAX_WINDOWS);
}
