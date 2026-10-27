/**
 * The daylight theme: the app switches between the light and dark palettes at fixed times, and a
 * glow behind and through the app follows the color of daylight continuously.
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

// Modeled on the real sky. Night is faint cool moonlight; the blue hour before sunrise is indigo;
// dawn passes the pink "Belt of Venus" into an orange sun and golden light. Midday light is near
// white, then a pale, low-saturation sky blue. Late afternoon turns golden, sunset goes orange to
// red-pink to a violet afterglow, and the evening blue hour fades into moonlight.
//
// Hues are unwrapped (they may go below 0 or above 360) so each segment turns the intended way
// around the wheel. Where the hue would cross unrelated colors, chroma drops to 0 first.
const keyframes: Keyframe[] = [
  [0, 0.76, 0.05, -105, 0.32], // moonlight
  [270, 0.7, 0.05, -105, 0.22], // 04:30 deep night
  [330, 0.55, 0.12, -85, 0.38], // 05:30 blue hour
  [360, 0.76, 0.09, 15, 0.4], // 06:00 dawn pink
  [390, 0.78, 0.14, 50, 0.5], // 06:30 sunrise
  [435, 0.85, 0.13, 75, 0.45], // 07:15 golden light
  [510, 0.91, 0.05, 85, 0.3], // 08:30 warm morning
  [555, 0.93, 0, 85, 0.22], // 09:15 white daylight
  [556, 0.93, 0, 235, 0.22],
  [630, 0.87, 0.07, 235, 0.3], // 10:30 pale sky blue
  [930, 0.87, 0.07, 235, 0.3], // 15:30
  [975, 0.92, 0, 235, 0.22], // 16:15 white daylight
  [976, 0.92, 0, 85, 0.22],
  [1050, 0.86, 0.12, 75, 0.42], // 17:30 golden hour
  [1110, 0.74, 0.16, 45, 0.55], // 18:30 sunset
  [1140, 0.66, 0.15, 20, 0.5], // 19:00 red-pink
  [1170, 0.56, 0.12, -30, 0.42], // 19:30 violet afterglow
  [1200, 0.5, 0.13, -85, 0.4], // 20:00 blue hour
  [1260, 0.7, 0.06, -105, 0.32], // 21:00 moonrise
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

const phases: [from: number, label: string][] = [
  [0, 'Night'],
  [300, 'Blue hour'],
  [350, 'Dawn'],
  [385, 'Sunrise'],
  [480, 'Morning'],
  [690, 'Midday'],
  [840, 'Afternoon'],
  [1020, 'Golden hour'],
  [1095, 'Sunset'],
  [1155, 'Dusk'],
  [1215, 'Night'],
];

export function phaseLabel(minute: number): string {
  const m = wrap(minute);
  return phases.findLast(([from]) => from <= m)![1];
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
