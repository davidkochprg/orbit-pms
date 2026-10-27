/**
 * The welcome page's space scene, as brightness per point. Coordinates are `u` (right) and `v`
 * (down), scaled so the panel's shorter side spans -1..1. The renderer turns brightness into
 * glyphs.
 */

/** Characters from empty to full, used as the ASCII brightness ramp. */
export const GLYPHS = ' .,:;-=+*x#%@';
/** Heavier glyphs that only flash by while the scene decodes or glitches. */
export const NOISE_GLYPHS = '▓▒░█@#%';

export type Vec3 = [number, number, number];

export const PLANET = { u: 0, v: 0.04, r: 0.46 };
/** The ring is an ellipse around the planet, tilted, drawn between two radii with a gap. */
export const RING = {
  a: PLANET.r * 1.85,
  b: PLANET.r * 0.34,
  tilt: -0.32,
  inner: 0.7,
  outer: 1,
  gap: [0.84, 0.88] as const,
};
const ORBIT = { a: 0.94, b: 0.4, tilt: 0.18, speed: 0.11 };
/** The planet's bands lean like a tilted axis. */
const AXIAL_TILT = 0.42;

export function normalize(x: number, y: number, z: number): Vec3 {
  const len = Math.hypot(x, y, z);
  return [x / len, y / len, z / len];
}

/** Sunlight from the top left, in front of the panel. */
export const DEFAULT_LIGHT = normalize(-0.55, -0.45, 0.7);

/** Light from a pointer position, each axis -1..1 across the panel; always in front. */
export function lightFrom(px: number, py: number): Vec3 {
  return normalize(px * 0.95, py * 0.85, 0.62);
}

const fract = (x: number) => x - Math.floor(x);
export const hash = (x: number, y: number) => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453);
const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Smooth value noise in 0..1. */
function noise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = smooth(x - ix);
  const fy = smooth(y - iy);
  const top = hash(ix, iy) + (hash(ix + 1, iy) - hash(ix, iy)) * fx;
  const bottom = hash(ix, iy + 1) + (hash(ix + 1, iy + 1) - hash(ix, iy + 1)) * fx;
  return top + (bottom - top) * fy;
}

function fbm(x: number, y: number): number {
  return 0.55 * noise(x, y) + 0.3 * noise(x * 2.1, y * 2.1) + 0.15 * noise(x * 4.3, y * 4.3);
}

/** Whether a point lies on the planet's disk. */
export function onPlanet(u: number, v: number): boolean {
  return (u - PLANET.u) ** 2 + (v - PLANET.v) ** 2 < PLANET.r ** 2;
}

/** The lit, slowly turning planet at a point, or null off the disk. */
export function planetShade(
  u: number,
  v: number,
  t: number,
  light: Vec3 = DEFAULT_LIGHT,
): number | null {
  const du = u - PLANET.u;
  const dv = v - PLANET.v;
  const d2 = du * du + dv * dv;
  const r2 = PLANET.r * PLANET.r;
  if (d2 >= r2) return null;
  const nx = du / PLANET.r;
  const ny = dv / PLANET.r;
  const nz = Math.sqrt(r2 - d2) / PLANET.r;
  const lambert = nx * light[0] + ny * light[1] + nz * light[2];
  // A soft terminator rather than a hard cut between day and night.
  const diffuse = clamp01(lambert * 1.15 + 0.08);
  // Texture in latitude and longitude around a tilted axis, so the bands lean as it turns.
  const cos = Math.cos(AXIAL_TILT);
  const sin = Math.sin(AXIAL_TILT);
  const tx = nx * cos - ny * sin;
  const ty = nx * sin + ny * cos;
  const lon = Math.atan2(tx, nz) + t * 0.12;
  const lat = Math.asin(Math.max(-1, Math.min(1, ty)));
  const clouds = fbm(lon * 2.2, lat * 3.4);
  const bands = 0.5 + 0.5 * Math.sin(lat * 11 + clouds * 3.2);
  const storm = Math.max(0, 1 - Math.hypot((lon % (Math.PI * 2)) - 1.1, (lat - 0.32) * 2.2) * 3);
  const surface = 0.26 + 0.42 * bands + 0.24 * clouds + 0.3 * storm;
  const specular = Math.max(0, lambert) ** 30 * 0.14;
  const rim = (1 - nz) ** 2.4 * 0.6 * (0.25 + Math.max(0, lambert));
  // Faint light on the night side, so the whole sphere reads.
  const ambient = 0.07 + 0.08 * clouds;
  return clamp01(Math.max(diffuse * surface + specular + rim, ambient));
}

/** Atmospheric glow just outside the disk, strongest on the lit side. */
export function haloShade(u: number, v: number, light: Vec3 = DEFAULT_LIGHT): number {
  const du = u - PLANET.u;
  const dv = v - PLANET.v;
  const d = Math.hypot(du, dv);
  const width = PLANET.r * 0.28;
  if (d <= PLANET.r || d > PLANET.r + width) return 0;
  const falloff = (1 - (d - PLANET.r) / width) ** 2;
  const facing = clamp01(0.3 + ((du * light[0] + dv * light[1]) / d) * 0.9);
  return falloff * 0.42 * facing;
}

/** The ring at a point, 0 where there is none or the planet hides its far side. */
export function ringShade(u: number, v: number): number {
  const du = u - PLANET.u;
  const dv = v - PLANET.v;
  const cos = Math.cos(RING.tilt);
  const sin = Math.sin(RING.tilt);
  const x = du * cos + dv * sin;
  const y = -du * sin + dv * cos;
  const rho = Math.hypot(x / RING.a, y / RING.b);
  if (rho < RING.inner || rho > RING.outer) return 0;
  if (rho > RING.gap[0] && rho < RING.gap[1]) return 0;
  // The lower half of the tilted ellipse is in front of the planet.
  if (y < 0 && onPlanet(u, v)) return 0;
  const stripes = 0.5 + 0.5 * Math.sin(rho * 58);
  // Lit on the near side, dimmer where it curves away behind the planet.
  const near = y > 0 ? 1 : 0.7;
  return (0.26 + 0.34 * stripes) * near;
}

export interface SatellitePosition {
  u: number;
  v: number;
  /** In front of the planet's plane. */
  front: boolean;
  /** Behind the planet, so not drawn. */
  hidden: boolean;
}

/** A point on the satellites' orbit at an angle. */
export function orbitPoint(angle: number): SatellitePosition {
  const x = ORBIT.a * Math.cos(angle);
  const y = ORBIT.b * Math.sin(angle);
  const cos = Math.cos(ORBIT.tilt);
  const sin = Math.sin(ORBIT.tilt);
  const u = PLANET.u + x * cos - y * sin;
  const v = PLANET.v + x * sin + y * cos;
  const front = Math.sin(angle) > 0;
  return { u, v, front, hidden: !front && onPlanet(u, v) };
}

/** Where a satellite with this phase (0..1 around the orbit) is at time `t`. */
export function satellitePosition(phase: number, t: number): SatellitePosition {
  return orbitPoint(phase * Math.PI * 2 + t * ORBIT.speed);
}

/** A sparse, twinkling star field, fixed to the character grid. */
export function starShade(col: number, row: number, t: number): number {
  const h = hash(col * 0.37, row * 0.71);
  if (h < 0.978) return 0;
  const bright = h > 0.997 ? 0.45 : 0;
  return 0.1 + bright + 0.28 * (0.5 + 0.5 * Math.sin(t * 1.7 + h * 90));
}

/** A faint band sweeping down the panel, like a scanner pass. */
export function scanShade(v: number, t: number): number {
  const position = ((t * 0.22) % 2.6) - 1.3;
  return 0.16 * Math.exp(-((v - position) ** 2) * 90);
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** Ordered-dither offset for a cell, -0.5..0.5, for a gritty printed look. */
export function bayer(col: number, row: number): number {
  return BAYER[(row % 4) * 4 + (col % 4)]! / 16 - 0.5;
}

/** Glitch tears: every few seconds, a few bands of rows slide sideways for a moment. */
export function glitchOffset(row: number, t: number): number {
  const period = 5.5;
  const k = Math.floor(t / period);
  const local = t - k * period;
  if (local > 0.22) return 0;
  const band = Math.floor(row / 3);
  const h = hash(band * 1.7, k * 3.1);
  if (h < 0.78) return 0;
  return Math.round((hash(band, k + 9) - 0.5) * 16);
}

/** When a cell settles from scrambled glyphs into the scene, in seconds, on load. */
export function revealAt(col: number, row: number, cols: number, rows: number): number {
  const sweep = row / Math.max(rows, 1);
  return 0.15 + sweep * 0.9 + hash(col * 0.13, row * 0.29) * 0.55 + (col / Math.max(cols, 1)) * 0.1;
}

export interface ShootingStar {
  u: number;
  v: number;
  /** Direction of travel, normalized. */
  du: number;
  dv: number;
}

/** The head of a shooting star crossing the sky, or null between them. */
export function shootingStar(t: number): ShootingStar | null {
  const period = 9;
  const k = Math.floor(t / period);
  const local = t - k * period;
  if (local > 0.9) return null;
  const start = { u: -1.1 + hash(k, 1) * 1.2, v: -1.05 + hash(k, 2) * 0.35 };
  const dir = normalize(0.85, 0.42 + hash(k, 3) * 0.3, 0);
  const travel = local * 2.1;
  return { u: start.u + dir[0] * travel, v: start.v + dir[1] * travel, du: dir[0], dv: dir[1] };
}

/** Index into GLYPHS for a brightness in 0..1. */
export function glyphIndex(brightness: number): number {
  return Math.round(clamp01(brightness) * (GLYPHS.length - 1));
}
