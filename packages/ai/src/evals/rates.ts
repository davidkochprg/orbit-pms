import { addDays, type OpenInquiry, type RateReviewInput } from '@orbit/domain';
import type { IsoDate, NightOutlook, RateSignal } from '@orbit/shared';

export interface RateReviewFixture {
  id: string;
  /** What the case checks, for the report. */
  about: string;
  input: RateReviewInput;
  /** Problems with the signals; empty when they pass. */
  check: (signals: RateSignal[]) => string[];
}

const ROOMS = 50;

/** `days` ordinary nights from `today`: about two in five rooms sold, as usual for the weekday. */
function nights(today: IsoDate, days: number): NightOutlook[] {
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(today, i);
    return {
      date,
      roomsSold: 18 + (i % 3),
      roomsTotal: ROOMS,
      typicalOccupancy: 0.42,
      currentPercent: 0,
      suggestedPercent: 0,
      rates: [],
      factors: [],
      events: [],
      weather: null,
      expectedNoShows: 0,
    };
  });
}

function request(id: string, sent: IsoDate, subject: string, message: string): OpenInquiry {
  return {
    id,
    receivedAt: `${sent}T09:00:00.000Z`,
    subject,
    message,
    checkIn: null,
    checkOut: null,
    adults: null,
  };
}

const covers = (s: RateSignal, night: IsoDate) => s.firstNight <= night && night <= s.lastNight;
const up = (signals: RateSignal[], night: IsoDate) =>
  signals.some((s) => s.direction === 'up' && covers(s, night));

const lodge = { name: 'Eval Lodge', location: 'A mountain town', country: 'US' };

/**
 * Rate reviews on made-up outlooks with fixed dates (the input states today, so they don't go
 * stale): a block of rooms is a signal, a single couple's request is not, and a public holiday
 * the rules know nothing about is found.
 */
export const rateReviewFixtures: RateReviewFixture[] = [
  {
    id: 'rate_group',
    about: 'block of eight rooms is up, one couple is not',
    input: {
      today: '2026-10-31',
      hotel: lodge,
      nights: nights('2026-10-31', 21),
      events: [],
      inquiries: [
        request(
          'inq_offsite',
          '2026-10-30',
          'Team offsite: 8 rooms',
          "Hi, we're planning an offsite for nine people and need eight rooms, arriving Tuesday, November 10 and leaving Thursday, November 12. Could you hold them and send a group rate? Thanks, Sam",
        ),
        request(
          'inq_couple',
          '2026-10-29',
          'Weekend away',
          'Hello, do you have a double room for my partner and me on Saturday, November 14? Best, Alex',
        ),
      ],
    },
    check: (signals) => [
      ...(up(signals, '2026-11-10') && up(signals, '2026-11-11')
        ? []
        : ['no up signal on the offsite nights Nov 10-11']),
      ...(signals.some((s) => covers(s, '2026-11-14'))
        ? ['a signal for one couple on Nov 14']
        : []),
    ],
  },
  {
    id: 'rate_holiday',
    about: 'Thanksgiving is found without any request',
    input: {
      today: '2026-11-09',
      hotel: lodge,
      nights: nights('2026-11-09', 28),
      events: [],
      inquiries: [],
    },
    check: (signals) =>
      up(signals, '2026-11-26') || up(signals, '2026-11-27')
        ? []
        : ['no up signal over Thanksgiving, Nov 26-27'],
  },
  {
    id: 'rate_quiet',
    about: 'an ordinary October fortnight in Czechia needs no strong signal',
    input: {
      today: '2026-10-05',
      hotel: { ...lodge, location: 'A mountain village', country: 'CZ' },
      nights: nights('2026-10-05', 14),
      events: [],
      inquiries: [],
    },
    check: (signals) => [
      ...signals.filter((s) => s.strength === 'strong').map((s) => `strong: ${s.label}`),
      ...(signals.length > 2 ? [`${signals.length} signals for an ordinary fortnight`] : []),
    ],
  },
];
