/**
 * The welcome scene's glyph overlay: small blocks of monospace characters that pop up on a grid,
 * flicker and fade. A few blocks show live hotel numbers instead of noise. Deterministic in time.
 */

export const CLUSTER_GLYPHS = '/_#HMSX0I48\\';
const SLOTS = 9;
/** Slots that show data lines instead of noise, when there is data. */
const DATA_SLOTS = 2;

export interface Grid {
  cols: number;
  rows: number;
}

export interface Cluster {
  slot: number;
  col: number;
  row: number;
  width: number;
  height: number;
  /** Seconds when it appears and disappears. */
  start: number;
  end: number;
  /** Text to show, one string per row; null for noise glyphs. */
  lines: string[] | null;
  /** Column where a pixel-sort smear behind the cluster starts, or null for none. */
  smearFrom: number | null;
}

const fract = (x: number) => x - Math.floor(x);
const hash = (a: number, b: number) => fract(Math.sin(a * 127.1 + b * 311.7) * 43758.5453);

/** The clusters visible at time `t` on a grid. */
export function activeClusters(t: number, grid: Grid, data: string[]): Cluster[] {
  const clusters: Cluster[] = [];
  for (let slot = 0; slot < SLOTS; slot++) {
    const period = 2.4 + hash(slot, 1) * 3.2;
    const offset = hash(slot, 2) * period;
    const k = Math.floor((t + offset) / period);
    const start = k * period - offset;
    const end = start + period * (0.45 + hash(slot, k) * 0.35);
    if (t >= end) continue;

    const isData = slot < DATA_SLOTS && data.length > 0;
    const lines = isData
      ? Array.from(
          { length: 1 + Math.floor(hash(slot, k + 0.5) * Math.min(3, data.length)) },
          (_, i) => data[(Math.floor(hash(slot, k + 0.9) * data.length) + i) % data.length]!,
        )
      : null;
    const width = lines
      ? Math.max(...lines.map((l) => l.length))
      : 2 + Math.floor(hash(slot, k + 0.3) * 8);
    const height = lines ? lines.length : 1 + Math.floor(hash(slot, k + 0.7) * 4);
    const col = Math.floor(hash(slot, k + 0.11) * Math.max(1, grid.cols - width));
    clusters.push({
      slot,
      col,
      row: Math.floor(hash(slot, k + 0.23) * Math.max(1, grid.rows - height)),
      width,
      height,
      start,
      end,
      lines,
      // About half the noise clusters drag a smear behind them, reaching back towards the left.
      smearFrom:
        !lines && hash(slot, k + 0.41) > 0.5
          ? Math.max(0, col - Math.floor(hash(slot, k + 0.57) * grid.cols * 0.45))
          : null,
    });
  }
  return clusters;
}

const randomGlyph = (a: number, b: number) =>
  CLUSTER_GLYPHS[Math.floor(hash(a, b) * CLUSTER_GLYPHS.length)]!;

/** The character in a cluster's cell at time `t`, or null for a gap. */
export function clusterGlyph(cluster: Cluster, x: number, y: number, t: number): string | null {
  if (cluster.lines) {
    const ch = cluster.lines[y]?.[x];
    if (!ch || ch === ' ') return null;
    // Now and then a character of the data scrambles for a frame.
    const step = Math.floor(t * 12);
    return hash(x + y * 7 + cluster.slot, step) > 0.93 ? randomGlyph(x, step) : ch;
  }
  if (hash(cluster.slot * 31 + x, y + cluster.start) > 0.68) return null;
  const step = Math.floor(t * (6 + hash(cluster.slot, 5) * 6));
  return randomGlyph(x + cluster.slot * 13 + step * 0.37, y * 3.1 + step);
}

/** Opacity: a quick fade in, a slower fade out, and the odd flicker. */
export function clusterAlpha(cluster: Cluster, t: number): number {
  if (t < cluster.start || t >= cluster.end) return 0;
  const fadeIn = Math.min(1, (t - cluster.start) / 0.12);
  const fadeOut = Math.min(1, (cluster.end - t) / 0.25);
  const flicker = hash(cluster.slot, Math.floor(t * 18)) < 0.06 ? 0.25 : 1;
  return Math.min(fadeIn, fadeOut) * flicker;
}
