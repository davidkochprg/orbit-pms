import type { StayReading } from '@orbit/shared';

export interface ExpectedStay {
  bookingId: string;
  source: string;
  pets: boolean;
  /** Any of these levels passes. */
  mess: StayReading['mess'][];
  /**
   * Each entry is one thing to set up, as words any of which an item must contain (e.g. "cot" or
   * "crib"). [] means nothing may be listed. The wording is otherwise not scored.
   */
  prepare: string[][];
}

export interface StayNotesFixture {
  id: string;
  language: string;
  stays: ExpectedStay[];
}

const usual: StayReading['mess'][] = ['usual'];
const more: StayReading['mess'][] = ['more', 'much_more'];

/** Synthetic stay notes and guest messages, one or several stays per model call as in the app. */
export const stayNotesFixtures: StayNotesFixture[] = [
  {
    id: 'stay_01',
    language: 'en',
    stays: [
      {
        bookingId: 'bk_101',
        source:
          'Guest messages:\n- Two colleagues on a work trip, arriving around 10 pm. Please send the invoice to our company.',
        pets: false,
        mess: usual,
        prepare: [],
      },
    ],
  },
  {
    id: 'stay_02',
    language: 'cs',
    stays: [
      {
        bookingId: 'bk_102',
        source: 'Guest messages:\n- Přijedeme se psem, je to malý jezevčík. Doufám, že to nevadí.',
        pets: true,
        mess: usual,
        prepare: [],
      },
    ],
  },
  {
    id: 'stay_03',
    language: 'de',
    stays: [
      {
        bookingId: 'bk_103',
        source: 'Guest messages:\n- Ist ein Hund erlaubt? Wir hätten unseren Labrador dabei.',
        pets: true,
        mess: usual,
        prepare: [],
      },
    ],
  },
  {
    id: 'stay_04',
    language: 'en',
    stays: [
      {
        bookingId: 'bk_104',
        source:
          "Guest messages:\n- It's our daughter's 6th birthday on the 12th. Could you put a few balloons in the room? We'll bring a cake.",
        pets: false,
        mess: ['usual', 'more'],
        prepare: [['balloon']],
      },
    ],
  },
  {
    id: 'stay_05',
    language: 'en',
    stays: [
      {
        bookingId: 'bk_105',
        source: 'Booking notes: Baby cot requested.\nGuest notes: Allergic to feathers.',
        pets: false,
        mess: usual,
        prepare: [
          ['cot', 'crib'],
          ['feather', 'hypoallergenic', 'allerg'],
        ],
      },
    ],
  },
  {
    id: 'stay_06',
    language: 'en',
    stays: [
      {
        bookingId: 'bk_106',
        source:
          "Guest messages:\n- We're riding the mountain bike trails every day. Is there somewhere we can hose down the bikes and our boots?",
        pets: false,
        mess: more,
        prepare: [],
      },
    ],
  },
  {
    id: 'stay_07',
    language: 'pl',
    stays: [
      {
        bookingId: 'bk_107',
        source: 'Guest messages:\n- Czy możemy zameldować się wcześniej? Przyjeżdżamy około 11.',
        pets: false,
        mess: usual,
        prepare: [],
      },
    ],
  },
  {
    id: 'stay_08',
    language: 'en',
    stays: [
      {
        bookingId: 'bk_108',
        source: 'Guest notes: Returning guest. Vegetarian. Pays by card on arrival.',
        pets: false,
        mess: usual,
        prepare: [],
      },
    ],
  },
  {
    id: 'stay_09',
    language: 'cs',
    stays: [
      {
        bookingId: 'bk_109',
        source:
          'Guest messages:\n- Omlouváme se, dcera se v noci pozvracela na postel a koberec. Můžete prosím vyměnit povlečení?',
        pets: false,
        mess: more,
        prepare: [],
      },
    ],
  },
  {
    id: 'stay_10',
    language: 'es',
    stays: [
      {
        bookingId: 'bk_110',
        source: 'Guest messages:\n- Viajamos con un bebé de 8 meses. ¿Tienen cuna?',
        pets: false,
        mess: usual,
        prepare: [['cot', 'crib', 'cuna']],
      },
    ],
  },
  {
    id: 'stay_11',
    language: 'en',
    stays: [
      {
        bookingId: 'bk_111',
        source:
          "Guest messages:\n- Do you allow dogs? Asking for a trip next year; this time we're leaving him with my parents.",
        pets: false,
        mess: usual,
        prepare: [],
      },
    ],
  },
  {
    id: 'stay_12',
    language: 'mixed',
    stays: [
      {
        bookingId: 'bk_121',
        source: 'Booking notes: Travelling with a dog.',
        pets: true,
        mess: usual,
        prepare: [],
      },
      {
        bookingId: 'bk_122',
        source:
          "Guest messages:\n- Four of us celebrating a friend's bachelor party this weekend, we'll try to keep it civilised!",
        pets: false,
        mess: more,
        prepare: [],
      },
      {
        bookingId: 'bk_123',
        source: 'Booking notes: Extra pillows please. Late check-out requested.',
        pets: false,
        mess: usual,
        prepare: [['pillow']],
      },
    ],
  },
];
