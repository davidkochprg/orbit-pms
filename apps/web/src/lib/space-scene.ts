/**
 * The welcome page's space scene, as brightness per point. Coordinates are `u` (right) and `v`
 * (down), scaled so the panel's shorter side spans -1..1. The renderer turns brightness into
 * glyphs.
 */

/** Characters from empty to full, used as the ASCII brightness ramp. */
export const GLYPHS = ' .:-=+*#%@';

export const PLANET = { u: 0, v: 0.04, r: 0.46 };
/** The ring is an ellipse around the planet, tilted, drawn between two radii. */
export const RING = { a: PLANET.r * 1.85, b: PLANET.r * 0.34, tilt: -0.32, inner: 0.74, outer: 1 };
const ORBIT = { a: 0.94, b: 0.4, tilt: 0.18, speed: 0.11 };
const LIGHT = normalize(-0.55, -0.45, 0.7);

function normalize(x: number, y: number, z: number): [number, number, number] {
  const len = Math.hypot(x, y, z);
  return [x / len, y / len, z / len];
}

const fract = (x: number) => x - Math.floor(x);
const hash = (x: number, y: number) => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453);
const smooth = (t: number) => t * t * (3 - 2 * t);

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

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Whether a point lies on the planet's disk. */
export function onPlanet(u: number, v: number): boolean {
  return (u - PLANET.u) ** 2 + (v - PLANET.v) ** 2 < PLANET.r ** 2;
}

/** The lit, slowly turning planet at a point, or null off the disk. */
export function planetShade(u: number, v: number, t: number): number | null {
  const du = u - PLANET.u;
  const dv = v - PLANET.v;
  const d2 = du * du + dv * dv;
  const r2 = PLANET.r * PLANET.r;
  if (d2 >= r2) return null;
  const nx = du / PLANET.r;
  const ny = dv / PLANET.r;
  const nz = Math.sqrt(r2 - d2) / PLANET.r;
  const diffuse = Math.max(0, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]);
  // Texture in latitude and longitude, so the surface turns around the vertical axis.
  const lon = Math.atan2(nx, nz) + t * 0.12;
  const lat = Math.asin(ny);
  const clouds = fbm(lon * 2.2, lat * 3.4);
  const bands = 0.5 + 0.5 * Math.sin(lat * 9 + clouds * 3);
  const surface = 0.3 + 0.45 * bands + 0.25 * clouds;
  const rim = (1 - nz) ** 3 * 0.55 * (0.35 + diffuse);
  // Faint light on the night side, so the whole sphere reads.
  const ambient = 0.12 + 0.06 * clouds;
  return clamp01(Math.max(diffuse * surface + rim, ambient));
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
  // The lower half of the tilted ellipse is in front of the planet.
  if (y < 0 && onPlanet(u, v)) return 0;
  const stripes = 0.5 + 0.5 * Math.sin(rho * 46);
  return 0.28 + 0.3 * stripes;
}

export interface SatellitePosition {
  u: number;
  v: number;
  /** In front of the planet's plane. */
  front: boolean;
  /** Behind the planet, so not drawn. */
  hidden: boolean;
}

/** Where a satellite with this phase (0..1 around the orbit) is at time `t`. */
export function satellitePosition(phase: number, t: number): SatellitePosition {
  const angle = phase * Math.PI * 2 + t * ORBIT.speed;
  const x = ORBIT.a * Math.cos(angle);
  const y = ORBIT.b * Math.sin(angle);
  const cos = Math.cos(ORBIT.tilt);
  const sin = Math.sin(ORBIT.tilt);
  const u = PLANET.u + x * cos - y * sin;
  const v = PLANET.v + x * sin + y * cos;
  const front = Math.sin(angle) > 0;
  return { u, v, front, hidden: !front && onPlanet(u, v) };
}

/** A sparse, twinkling star field, fixed to the character grid. */
export function starShade(col: number, row: number, t: number): number {
  const h = hash(col * 0.37, row * 0.71);
  if (h < 0.982) return 0;
  return 0.12 + 0.3 * (0.5 + 0.5 * Math.sin(t * 1.7 + h * 90));
}

/** A faint band sweeping down the panel, like a scanner pass. */
export function scanShade(v: number, t: number): number {
  const position = ((t * 0.22) % 2.6) - 1.3;
  return 0.14 * Math.exp(-((v - position) ** 2) * 90);
}

/** Index into GLYPHS for a brightness in 0..1. */
export function glyphIndex(brightness: number): number {
  return Math.round(clamp01(brightness) * (GLYPHS.length - 1));
}
