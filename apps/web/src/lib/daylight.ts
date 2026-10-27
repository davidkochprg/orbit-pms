/**
 * The daylight theme: the app switches between the light and dark palettes at fixed times, and an
 * underglow below the app follows the time of day continuously.
 *
 * `night` is 0 (light) or 1 (dark); the CSS fades between them when it changes. There are no
 * in-between palettes, because mid-gray surfaces leave too little contrast for text.
 */

export const MINUTES_PER_DAY = 24 * 60;

/** The app turns light at 06:30 and dark at 19:30, local time. */
export const LIGHT_FROM = 6 * 60 + 30;
export const DARK_FROM = 19 * 60 + 30;

export interface Glow {
  l: number;
  c: number;
  /** Hue in degrees. Keyframes may go below 0 to pick the direction hues travel around the wheel. */
  h: number;
  alpha: number;
}

export interface DaylightState {
  night: 0 | 1;
  glow: Glow;
}

type Keyframe = [minute: number, l: number, c: number, h: number, alpha: number];

// Sunrise glows orange, the day sky blue, dusk a deepening blue, and the moon rises pale blue.
// Hues run 55 → -115 (= 245) through rose and violet, like a morning sky.
const keyframes: Keyframe[] = [
  [0, 0.82, 0.08, -125, 0.55], // night, full moon glow
  [300, 0.8, 0.06, -110, 0.3], // 05:00 moon fading
  [350, 0.72, 0.1, 10, 0.35], // 05:50 first light
  [370, 0.74, 0.13, 40, 0.55], // 06:10 dawn
  [420, 0.76, 0.16, 55, 0.85], // 07:00 sunrise
  [540, 0.78, 0.13, 45, 0.6], // 09:00 morning
  [660, 0.72, 0.14, -115, 0.55], // 11:00 blue sky
  [960, 0.72, 0.14, -115, 0.55], // 16:00
  [1080, 0.64, 0.14, -112, 0.5], // 18:00 dusk
  [1170, 0.55, 0.12, -105, 0.35], // 19:30 dark
  [1260, 0.72, 0.07, -125, 0.35], // 21:00 moonrise
  [1350, 0.82, 0.08, -125, 0.55], // 22:30 moon up
];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const round = (n: number) => Math.round(n * 1000) / 1000;
const wrap = (minute: number) => ((minute % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;

/** The theme at a minute of the day (0–1439); wraps around midnight. */
export function daylightAt(minute: number): DaylightState {
  const m = wrap(minute);
  let i = keyframes.length - 1;
  while (i > 0 && keyframes[i]![0] > m) i--;
  const from = keyframes[i]!;
  const [firstMinute, ...firstValues] = keyframes[0]!;
  const to: Keyframe = keyframes[i + 1] ?? [firstMinute + MINUTES_PER_DAY, ...firstValues];
  const t = (m - from[0]) / (to[0] - from[0]);
  return {
    night: m >= LIGHT_FROM && m < DARK_FROM ? 0 : 1,
    glow: {
      l: round(lerp(from[1], to[1], t)),
      c: round(lerp(from[2], to[2], t)),
      h: round(lerp(from[3], to[3], t)),
      alpha: round(lerp(from[4], to[4], t)),
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
  const m = wrap(Math.round(minute));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function phaseLabel(minute: number): string {
  const m = wrap(minute);
  if (m >= 330 && m < 540) return 'Sunrise';
  if (m >= 540 && m < 1050) return 'Daytime';
  if (m >= 1050 && m < DARK_FROM) return 'Dusk';
  return 'Night';
}

/** Color stops for a slider track that previews the whole day, midnight to midnight. */
export function dayGradient(steps = 96): string {
  const stops = Array.from({ length: steps + 1 }, (_, i) => {
    const s = daylightAt((i / steps) * MINUTES_PER_DAY);
    const surface = s.night ? 'oklch(0.24 0.006 264)' : 'oklch(0.97 0.003 264)';
    return `color-mix(in oklch, ${surface}, ${glowColor({ ...s.glow, alpha: 1 })} ${round(s.glow.alpha * 70)}%) ${round((i / steps) * 100)}%`;
  });
  return `linear-gradient(to right, ${stops.join(', ')})`;
}
