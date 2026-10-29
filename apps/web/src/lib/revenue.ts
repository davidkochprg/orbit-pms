import type { EventImpact, NightOutlook, RateFactor, WeatherKind } from '@orbit/shared';

/** "+15%", "-10%", or "Season rate" for no change. */
export function ratePercent(percent: number): string {
  return percent === 0 ? 'Season rate' : `${percent > 0 ? '+' : ''}${percent}%`;
}

/** "+15%" or "-10%"; "0%" for none. */
export function signed(percent: number): string {
  return `${percent > 0 ? '+' : ''}${percent}%`;
}

/** Rooms sold as a share of rooms that can be sold, 0 to 1. */
export function occupancy(night: Pick<NightOutlook, 'roomsSold' | 'roomsTotal'>): number {
  return night.roomsTotal ? night.roomsSold / night.roomsTotal : 0;
}

/** Nights whose suggested rate differs from the current one. */
export function suggestions(nights: NightOutlook[]): NightOutlook[] {
  return nights.filter((n) => n.suggestedPercent !== n.currentPercent);
}

/**
 * The nights laid out in weeks from Monday, padded with nulls before the first night and after the
 * last, so each row is one week.
 */
export function calendarWeeks(nights: NightOutlook[]): (NightOutlook | null)[][] {
  if (nights.length === 0) return [];
  const weekday = new Date(`${nights[0]!.date}T12:00:00Z`).getUTCDay();
  const lead = (weekday + 6) % 7;
  const cells = [...Array<null>(lead).fill(null), ...nights];
  while (cells.length % 7 !== 0) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
}

export const weatherLabels: Record<WeatherKind, string> = {
  clear: 'Clear',
  cloudy: 'Cloudy',
  fog: 'Fog',
  rain: 'Rain',
  snow: 'Snow',
  storm: 'Storm',
};

export const impactLabels: Record<EventImpact, string> = {
  low: 'Small',
  medium: 'Medium',
  high: 'Big',
};

export const factorKindLabels: Record<RateFactor['kind'], string> = {
  demand: 'Demand',
  event: 'Event',
  weather: 'Weather',
};
