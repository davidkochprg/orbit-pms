import { describe, expect, it, vi } from 'vitest';
import { createOpenMeteo, parseForecast, weatherKind } from './weather';

const body = {
  daily: {
    time: ['2026-11-06', '2026-11-07', '2026-11-08'],
    weather_code: [73, 0, null],
    temperature_2m_max: [-1.4, 6.6, 3],
    temperature_2m_min: [-7.2, -2.1, 0],
    precipitation_sum: [9.84, 0, 0],
    snowfall_sum: [14.7, 0, 0],
  },
};
const at = { latitude: 37.65, longitude: -118.97 };

describe('weatherKind', () => {
  it('groups WMO codes', () => {
    expect([0, 2, 45, 61, 71, 86, 81, 95].map(weatherKind)).toEqual([
      'clear',
      'cloudy',
      'fog',
      'rain',
      'snow',
      'snow',
      'rain',
      'storm',
    ]);
  });
});

describe('parseForecast', () => {
  it('reads daily values and leaves out days with gaps', () => {
    expect(parseForecast(body)).toEqual([
      {
        date: '2026-11-06',
        kind: 'snow',
        tempMaxC: -1,
        tempMinC: -7,
        precipitationMm: 9.8,
        snowfallCm: 14.7,
      },
      {
        date: '2026-11-07',
        kind: 'clear',
        tempMaxC: 7,
        tempMinC: -2,
        precipitationMm: 0,
        snowfallCm: 0,
      },
    ]);
    expect(() => parseForecast({ hourly: {} })).toThrow();
  });
});

describe('createOpenMeteo', () => {
  it('asks once per place within three hours and gives null when the request fails', async () => {
    let time = Date.parse('2026-11-06T08:00:00Z');
    const fetchFn = vi.fn(() => Promise.resolve(Response.json(body)));
    const source = createOpenMeteo({ fetchFn, clock: () => new Date(time) });
    expect(await source.forecast(at, 'America/Los_Angeles')).toHaveLength(2);
    await source.forecast(at, 'America/Los_Angeles');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const url = new URL(String((fetchFn.mock.calls[0] as unknown[])[0]));
    expect(url.searchParams.get('latitude')).toBe('37.65');
    expect(url.searchParams.get('timezone')).toBe('America/Los_Angeles');

    const failing = createOpenMeteo({
      fetchFn: () => Promise.reject(new Error('offline')),
      clock: () => new Date(time),
    });
    expect(await failing.forecast(at, 'UTC')).toBeNull();
    time += 4 * 3600_000;
    await source.forecast(at, 'America/Los_Angeles');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});
