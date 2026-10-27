/**
 * The daylight theme: the app's palette and an underglow follow the time of day.
 *
 * `night` blends every color token from the day palette (0) to the night palette (1). `ink` does
 * the same for text, but switches over a short window around night = 0.5 so text keeps its
 * contrast while the surfaces pass through mid-tones. The glow is an oklch color under the app.
 */

export const MINUTES_PER_DAY = 24 * 60;

export interface Glow {
  l: number;
  c: number;
  /** Hue in degrees. Keyframes may go below 0 to pick the direction hues travel around the wheel. */
  h: number;
  alpha: number;
}

export interface DaylightState {
  night: number;
  ink: number;
  glow: Glow;
}

type Keyframe = [minute: number, night: number, l: number, c: number, h: number, alpha: number];

// Sunrise glows orange, the day sky blue, dusk darkens the surfaces, and the moon rises pale blue.
// Hues run 55 → -115 (= 245) through rose and violet, like a morning sky. The surfaces dim slowly
// but cross the mid-tones within twenty minutes (05:50–06:10, 19:20–19:40), where contrast is lowest.
const keyframes: Keyframe[] = [
  [0, 1, 0.82, 0.08, -125, 0.55], // night, full moon glow
  [300, 1, 0.8, 0.06, -110, 0.3], // 05:00 moon fading
  [350, 0.8, 0.72, 0.1, 10, 0.35], // 05:50 first light
  [370, 0.25, 0.74, 0.13, 40, 0.55], // 06:10 dawn
  [420, 0, 0.76, 0.16, 55, 0.85], // 07:00 sunrise
  [540, 0, 0.78, 0.13, 45, 0.6], // 09:00 morning
  [660, 0, 0.72, 0.14, -115, 0.55], // 11:00 blue sky
  [960, 0, 0.72, 0.14, -115, 0.55], // 16:00
  [1080, 0.05, 0.64, 0.14, -112, 0.5], // 18:00 dusk starts
  [1160, 0.3, 0.58, 0.13, -105, 0.4], // 19:20
  [1180, 0.75, 0.52, 0.11, -100, 0.3], // 19:40
  [1260, 1, 0.72, 0.07, -125, 0.35], // 21:00 moonrise
  [1350, 1, 0.82, 0.08, -125, 0.55], // 22:30 moon up
];

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const round = (n: number) => Math.round(n * 1000) / 1000;

/** Text switches palettes within night 0.475–0.525. */
export function inkFor(night: number): number {
  return clamp01((night - 0.5) * 20 + 0.5);
}

/** The theme at a minute of the day (0–1439); wraps around midnight. */
export function daylightAt(minute: number): DaylightState {
  const m = ((minute % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  let i = keyframes.length - 1;
  while (i > 0 && keyframes[i]![0] > m) i--;
  const from = keyframes[i]!;
  const [firstMinute, ...firstValues] = keyframes[0]!;
  const to: Keyframe = keyframes[i + 1] ?? [firstMinute + MINUTES_PER_DAY, ...firstValues];
  const t = (m - from[0]) / (to[0] - from[0]);
  const night = round(lerp(from[1], to[1], t));
  return {
    night,
    ink: round(inkFor(night)),
    glow: {
      l: round(lerp(from[2], to[2], t)),
      c: round(lerp(from[3], to[3], t)),
      h: round(lerp(from[4], to[4], t)),
      alpha: round(lerp(from[5], to[5], t)),
    },
  };
}

export function glowColor({ l, c, h, alpha }: Glow, alphaScale = 1): string {
  return `oklch(${l} ${c} ${h} / ${round(alpha * alphaScale)})`;
}

export function minuteOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

/** "07:05" */
export function formatMinute(minute: number): string {
  const m = ((Math.round(minute) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function phaseLabel(minute: number): string {
  const m = ((minute % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  if (m >= 330 && m < 540) return 'Sunrise';
  if (m >= 540 && m < 1050) return 'Daytime';
  if (m >= 1050 && m < 1260) return 'Dusk';
  return 'Night';
}

/** Color stops for a slider track that previews the whole day, midnight to midnight. */
export function dayGradient(steps = 24): string {
  const stops = Array.from({ length: steps + 1 }, (_, i) => {
    const s = daylightAt((i / steps) * MINUTES_PER_DAY);
    const surface = `color-mix(in oklch, oklch(0.97 0.003 264), oklch(0.24 0.006 264) ${round(s.night * 100)}%)`;
    return `color-mix(in oklch, ${surface}, ${glowColor({ ...s.glow, alpha: 1 })} ${round(s.glow.alpha * 70)}%) ${round((i / steps) * 100)}%`;
  });
  return `linear-gradient(to right, ${stops.join(', ')})`;
}
