import { addDays, emptyHotelProfile, hotelPolicy, usDemoPricing } from '@orbit/domain';
import type { ArrivalNote, IsoDate } from '@orbit/shared';
import { arrivalNoteProblems, type ArrivalNoteFacts } from '../arrival-notes';
import { type HotelContext, hotelFacts } from '../prompts/hotel';
import { amountsInText } from '../price-guard';

/** A small synthetic US lodge with the facts a note before a stay would draw on. */
export const arrivalNoteHotel: HotelContext = {
  profile: {
    ...emptyHotelProfile,
    name: 'Eval Lodge',
    location: 'Mountain Village, California',
    country: 'US',
    checkInFrom: '15:00',
    checkOutBy: '11:00',
    entries: [
      {
        id: 'spa',
        category: 'wellness',
        title: 'Spa',
        details: 'Sauna and outdoor hot tub, open 4 PM to 9 PM.',
      },
      {
        id: 'parking',
        category: 'policies',
        title: 'Parking',
        details: 'Free parking by the lodge. In winter, chains may be required on the pass road.',
      },
      {
        id: 'dogs',
        category: 'policies',
        title: 'Dogs',
        details: 'Dogs are welcome in the cabin suites, but not in the breakfast room or the spa.',
      },
      {
        id: 'kids',
        category: 'services',
        title: 'For kids',
        details: 'A game room with board games.',
      },
    ],
  },
  policy: hotelPolicy,
  pricing: usDemoPricing,
};

export interface ArrivalNoteFixture {
  id: string;
  facts: ArrivalNoteFacts;
  /** The first name, or the start of it where the language changes its ending. */
  nameStem: string;
  /** How the check-in time is written in the guest's language. */
  checkIn: RegExp;
  /** What the note must also mention, e.g. the snow or the dog. */
  mentions: { label: string; pattern: RegExp }[];
}

const noAddons = { wellness: false, dogs: 0, extraBeds: 0 };

export function buildArrivalNoteFixtures(today: IsoDate): ArrivalNoteFixture[] {
  const checkIn = addDays(today, 1);
  const stay = (nights: number) => ({ checkIn, checkOut: addDays(checkIn, nights) });
  const weather = (kind: 'snow' | 'rain' | 'clear', snowfallCm = 0, precipitationMm = 0) => ({
    date: checkIn,
    kind,
    tempMinC: kind === 'snow' ? -7 : 4,
    tempMaxC: kind === 'snow' ? 1 : 12,
    snowfallCm,
    precipitationMm,
  });
  const base = { idsFrom: 'main_guest' as const, signer: 'Jordan Lee', today };
  return [
    {
      id: 'an_en_snow_spa',
      facts: {
        ...base,
        guest: { name: 'Amelia Holloway', language: 'en' },
        stay: {
          ...stay(2),
          adults: 2,
          childAges: [],
          roomTypeName: 'Queen room',
          addons: { ...noAddons, wellness: true },
        },
        weather: weather('snow', 12),
      },
      nameStem: 'Amelia',
      checkIn: /3\s?PM/i,
      mentions: [
        { label: 'the snow', pattern: /snow/i },
        { label: 'the spa', pattern: /spa|sauna|hot tub/i },
      ],
    },
    {
      id: 'an_de_dog',
      facts: {
        ...base,
        guest: { name: 'Elias Bauer', language: 'de' },
        stay: {
          ...stay(3),
          adults: 2,
          childAges: [],
          roomTypeName: 'Cabin suite',
          addons: { ...noAddons, dogs: 1 },
        },
        weather: weather('clear'),
      },
      nameStem: 'Elias',
      checkIn: /15(:00)?\s?Uhr|3\s?PM/i,
      mentions: [{ label: 'the dog', pattern: /hund/i }],
    },
    {
      id: 'an_cs_family',
      facts: {
        ...base,
        guest: { name: 'Vojtěch Kolář', language: 'cs' },
        stay: {
          ...stay(4),
          adults: 2,
          childAges: [5, 9],
          roomTypeName: 'Family room',
          addons: noAddons,
        },
        weather: weather('rain', 0, 8),
      },
      nameStem: 'Vojt',
      checkIn: /15(:00)?|3\s?PM/i,
      mentions: [],
    },
    {
      id: 'an_pl_plain',
      facts: {
        ...base,
        guest: { name: 'Tomasz Testowy', language: 'pl' },
        stay: {
          ...stay(1),
          adults: 1,
          childAges: [],
          roomTypeName: 'Cozy single',
          addons: noAddons,
        },
        weather: null,
      },
      nameStem: 'Tomasz',
      checkIn: /15(:00)?|3\s?PM/i,
      mentions: [],
    },
  ];
}

const plain = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** What is wrong with a written note: the guard's problems plus what this guest's note needs. */
export function scoreArrivalNote(f: ArrivalNoteFixture, note: ArrivalNote): string[] {
  const problems = arrivalNoteProblems(note, amountsInText(hotelFacts(arrivalNoteHotel)));
  if (!plain(note.body).includes(plain(f.nameStem))) problems.push('no greeting by name');
  if (!f.checkIn.test(note.body)) problems.push('no check-in time');
  if (note.body.split(/\s+/).length > 200) problems.push('too long');
  for (const m of f.mentions) {
    if (!m.pattern.test(note.body)) problems.push(`doesn't mention ${m.label}`);
  }
  return problems;
}
