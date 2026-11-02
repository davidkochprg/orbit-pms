import { describe, expect, it } from 'vitest';
import { imperialWeather, type WeatherDay, weatherReadings } from './revenue';

const day = (w: Partial<WeatherDay>): WeatherDay => ({
  date: '2026-11-13',
  kind: 'snow',
  tempMinC: -3,
  tempMaxC: 12,
  precipitationMm: 0,
  snowfallCm: 0,
  ...w,
});

describe('weatherReadings', () => {
  it('writes Celsius and metric outside the US', () => {
    expect(weatherReadings(day({ snowfallCm: 5.6 }), false)).toEqual({
      temperature: '-3 to 12 °C',
      fall: '5.6 cm of snow',
    });
    expect(weatherReadings(day({ precipitationMm: 4 }), false).fall).toBe('4 mm of rain');
  });

  it('writes Fahrenheit and inches in the US', () => {
    expect(weatherReadings(day({ snowfallCm: 5.6 }), true)).toEqual({
      temperature: '27 to 54 °F',
      fall: '2.2 in of snow',
    });
    expect(weatherReadings(day({ precipitationMm: 12.7 }), true).fall).toBe('0.5 in of rain');
  });

  it('prefers snow over rain and keeps a drizzle above zero', () => {
    expect(weatherReadings(day({ snowfallCm: 1, precipitationMm: 9 }), false).fall).toBe(
      '1 cm of snow',
    );
    expect(weatherReadings(day({ precipitationMm: 0.1 }), true).fall).toBe('0.1 in of rain');
    expect(weatherReadings(day({}), true).fall).toBeNull();
  });

  it('uses imperial only for the US', () => {
    expect(imperialWeather('US')).toBe(true);
    expect(imperialWeather('CZ')).toBe(false);
  });
});
