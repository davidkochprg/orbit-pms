import { addDays } from '@orbit/domain';
import type { IsoDate, LocalEvent } from '@orbit/shared';
import type { SeedRegion } from './regions';

/** The first Friday at least `days` after `today`. */
export function fridayAfter(today: IsoDate, days: number): IsoDate {
  let date = addDays(today, days);
  while (new Date(`${date}T12:00:00Z`).getUTCDay() !== 5) date = addDays(date, 1);
  return date;
}

const names: Record<SeedRegion, [string, string, string, string]> = {
  us: [
    'Ski area opening weekend',
    'Mountain film festival',
    'Holiday craft market',
    'Trail half marathon',
  ],
  cz: ['Ski season opening', 'Mountain film festival', 'Christmas market', 'Ski jumping cup'],
};

/**
 * Mock local events for the demo, dated relative to today: a big weekend next week that the seed
 * also fills up, and three smaller ones within the 60 nights the Rates page shows.
 */
export function buildEvents(today: IsoDate, region: SeedRegion): LocalEvent[] {
  const [big, festival, market, race] = names[region];
  const opening = fridayAfter(today, 7);
  const film = fridayAfter(today, 18);
  const crafts = fridayAfter(today, 30);
  const half = fridayAfter(today, 42);
  return [
    { id: 'evt_1', name: big, firstNight: opening, lastNight: addDays(opening, 1), impact: 'high' },
    {
      id: 'evt_2',
      name: festival,
      firstNight: film,
      lastNight: addDays(film, 2),
      impact: 'medium',
    },
    { id: 'evt_3', name: market, firstNight: crafts, lastNight: addDays(crafts, 1), impact: 'low' },
    {
      id: 'evt_4',
      name: race,
      firstNight: addDays(half, 1),
      lastNight: addDays(half, 1),
      impact: 'medium',
    },
  ];
}
