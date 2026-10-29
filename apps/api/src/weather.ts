import type { WeatherDay, WeatherKind } from '@orbit/shared';
import { z } from 'zod';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

/** The daily forecast at the hotel, or null when it can't be had right now. */
export interface WeatherSource {
  forecast(at: Coordinates, timeZone: string): Promise<WeatherDay[] | null>;
}

const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast';
/** A forecast is reused this long; a failed fetch is not retried sooner than `RETRY_MS`. */
const TTL_MS = 3 * 3600_000;
const RETRY_MS = 5 * 60_000;
const TIMEOUT_MS = 4000;

const dailySchema = z.object({
  daily: z.object({
    time: z.array(z.iso.date()),
    weather_code: z.array(z.number().nullable()),
    temperature_2m_max: z.array(z.number().nullable()),
    temperature_2m_min: z.array(z.number().nullable()),
    precipitation_sum: z.array(z.number().nullable()),
    snowfall_sum: z.array(z.number().nullable()),
  }),
});

/** WMO weather codes as Open-Meteo reports them, in a few kinds. */
export function weatherKind(code: number): WeatherKind {
  if (code <= 1) return 'clear';
  if (code <= 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95) return 'storm';
  return 'rain';
}

/** Turns Open-Meteo's daily arrays into days; days with missing values are left out. */
export function parseForecast(body: unknown): WeatherDay[] {
  const { daily } = dailySchema.parse(body);
  return daily.time.flatMap((date, i) => {
    const code = daily.weather_code[i];
    const max = daily.temperature_2m_max[i];
    const min = daily.temperature_2m_min[i];
    if (code == null || max == null || min == null) return [];
    return [
      {
        date,
        kind: weatherKind(code),
        tempMaxC: Math.round(max),
        tempMinC: Math.round(min),
        precipitationMm: Math.round((daily.precipitation_sum[i] ?? 0) * 10) / 10,
        snowfallCm: Math.round((daily.snowfall_sum[i] ?? 0) * 10) / 10,
      },
    ];
  });
}

/**
 * The 16-day forecast from Open-Meteo (free, no key), cached per place. A slow or failed request
 * gives null, so rates are suggested without weather rather than not at all.
 */
export function createOpenMeteo({
  fetchFn = fetch,
  clock = () => new Date(),
}: { fetchFn?: typeof fetch; clock?: () => Date } = {}): WeatherSource {
  const cache = new Map<string, { at: number; days: WeatherDay[] | null }>();
  return {
    async forecast({ latitude, longitude }, timeZone) {
      const key = `${latitude},${longitude},${timeZone}`;
      const now = clock().getTime();
      const hit = cache.get(key);
      if (hit && now - hit.at < (hit.days ? TTL_MS : RETRY_MS)) return hit.days;
      const url = new URL(OPEN_METEO);
      url.search = new URLSearchParams({
        latitude: String(latitude),
        longitude: String(longitude),
        daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,snowfall_sum',
        timezone: timeZone,
        forecast_days: '16',
      }).toString();
      let days: WeatherDay[] | null = null;
      try {
        const res = await fetchFn(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
        if (res.ok) days = parseForecast(await res.json());
      } catch {
        days = null;
      }
      cache.set(key, { at: now, days });
      return days;
    },
  };
}
