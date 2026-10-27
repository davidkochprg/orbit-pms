import type { RoomStatus } from '@orbit/shared';

export interface ExpectedUpdate {
  room: string;
  status: RoomStatus | null;
  /** Whether the note reports something to fix. The wording is not scored. */
  issue: boolean;
}

export interface HousekeepingNoteFixture {
  id: string;
  language: string;
  note: string;
  expected: ExpectedUpdate[];
  /** Whether the model should report something it could not map. */
  unclear: boolean;
}

/** Room names of the demo hotel, as the model sees them. */
export const evalRoomNames = [
  '101',
  '102',
  '103',
  '104',
  '105',
  '201',
  '202',
  '203',
  '204',
  '205',
  'A1',
  'A2',
];

/** Synthetic housekeeping notes, written the way a transcript of a short voice note reads. */
export const housekeepingNoteFixtures: HousekeepingNoteFixture[] = [
  {
    id: 'hk_01',
    language: 'en',
    note: 'Room 104 is done. The bedside lamp is broken.',
    expected: [{ room: '104', status: 'clean', issue: true }],
    unclear: false,
  },
  {
    id: 'hk_02',
    language: 'cs',
    note: 'Sto dva hotovo, sto tři taky. Ve sto třech kape kohoutek.',
    expected: [
      { room: '102', status: 'clean', issue: false },
      { room: '103', status: 'clean', issue: true },
    ],
    unclear: false,
  },
  {
    id: 'hk_03',
    language: 'de',
    note: 'Zimmer 201 ist fertig und kontrolliert.',
    expected: [{ room: '201', status: 'inspected', issue: false }],
    unclear: false,
  },
  {
    id: 'hk_04',
    language: 'pl',
    note: 'Pokój 205 gotowy, brakuje ręczników.',
    expected: [{ room: '205', status: 'clean', issue: true }],
    unclear: false,
  },
  {
    id: 'hk_05',
    language: 'cs',
    note: 'Apartmán A2 nejde použít, teče voda ze stropu v koupelně.',
    expected: [{ room: 'A2', status: 'out_of_order', issue: true }],
    unclear: false,
  },
  {
    id: 'hk_06',
    language: 'en',
    note: 'Checked 101 and 105, both look good.',
    expected: [
      { room: '101', status: 'inspected', issue: false },
      { room: '105', status: 'inspected', issue: false },
    ],
    unclear: false,
  },
  {
    id: 'hk_07',
    language: 'en',
    note: 'The guest in 203 just left, the room needs a full clean.',
    expected: [{ room: '203', status: 'dirty', issue: false }],
    unclear: false,
  },
  {
    id: 'hk_08',
    language: 'cs',
    note: 'Pokoj 305 je hotový.',
    expected: [],
    unclear: true,
  },
  {
    id: 'hk_09',
    language: 'en',
    note: 'All good on the second floor.',
    expected: [],
    unclear: true,
  },
  {
    id: 'hk_10',
    language: 'de',
    note: 'A1 fertig, aber die Dusche in A1 ist kaputt. 202 bitte noch mal saugen.',
    expected: [
      { room: 'A1', status: 'clean', issue: true },
      { room: '202', status: 'dirty', issue: false },
    ],
    unclear: false,
  },
];
