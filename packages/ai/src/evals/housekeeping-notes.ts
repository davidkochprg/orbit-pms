import type { RoomStatus, Trade } from '@orbit/shared';

export interface ExpectedUpdate {
  room: string;
  status: RoomStatus | null;
  /** Whether the note reports something to fix. The wording is not scored. */
  issue: boolean;
  /** The trades that would fix the issue; any one of them passes. Not scored when left out. */
  trade?: Trade[];
}

export interface HousekeepingNoteFixture {
  id: string;
  language: string;
  note: string;
  expected: ExpectedUpdate[];
  /** Whether the model should report something it could not map. */
  unclear: boolean;
}

/** Room names of the demo hotel (the seed in `packages/db`), as the model sees them. */
export const evalRoomNames = [
  '101',
  '102',
  '103',
  '104',
  '105',
  '106',
  '107',
  '108',
  '109',
  '110',
  '111',
  '201',
  '202',
  '203',
  '204',
  '205',
  '206',
  '207',
  '208',
  '209',
  '210',
  '211',
  '301',
  '302',
  '303',
  '304',
  '305',
  '306',
  '307',
  '308',
  '309',
  '310',
  '311',
  '401',
  '402',
  '403',
  '404',
  '405',
  '406',
  '407',
  '408',
  '409',
  '410',
  '411',
  'A1',
  'A2',
  'A3',
  'A4',
  'A5',
  'A6',
];

/** Synthetic housekeeping notes, written the way a transcript of a short voice note reads. */
export const housekeepingNoteFixtures: HousekeepingNoteFixture[] = [
  {
    id: 'hk_01',
    language: 'en',
    note: 'Room 104 is done. The bedside lamp is broken.',
    expected: [{ room: '104', status: 'clean', issue: true, trade: ['electrical', 'appliances'] }],
    unclear: false,
  },
  {
    id: 'hk_02',
    language: 'cs',
    note: 'Sto dva hotovo, sto tři taky. Ve sto třech kape kohoutek.',
    expected: [
      { room: '102', status: 'clean', issue: false },
      { room: '103', status: 'clean', issue: true, trade: ['plumbing'] },
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
    expected: [{ room: '205', status: 'clean', issue: true, trade: ['supplies', 'cleaning'] }],
    unclear: false,
  },
  {
    id: 'hk_05',
    language: 'cs',
    note: 'Apartmán A2 nejde použít, teče voda ze stropu v koupelně.',
    expected: [
      { room: 'A2', status: 'out_of_order', issue: true, trade: ['plumbing', 'building'] },
    ],
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
    note: 'Pokoj 512 je hotový.',
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
      { room: 'A1', status: 'clean', issue: true, trade: ['plumbing'] },
      { room: '202', status: 'dirty', issue: false },
    ],
    unclear: false,
  },
  {
    id: 'hk_11',
    language: 'en',
    note: "The shower in 104 keeps running, I can't turn it off.",
    expected: [{ room: '104', status: null, issue: true, trade: ['plumbing'] }],
    unclear: false,
  },
  {
    id: 'hk_12',
    language: 'cs',
    note: 'Dvě stě šest uklizeno, ale netopí tam radiátor.',
    expected: [{ room: '206', status: 'clean', issue: true, trade: ['heating'] }],
    unclear: false,
  },
  {
    id: 'hk_13',
    language: 'en',
    note: 'Wifi is down in 302 again.',
    expected: [{ room: '302', status: null, issue: true, trade: ['internet'] }],
    unclear: false,
  },
];
