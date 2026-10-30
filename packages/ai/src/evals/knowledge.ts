import { addDays } from '@orbit/domain';
import type { FiledNote, HotelInfoCategory, HotelInfoEntry } from '@orbit/shared';

/** A synthetic lodge's notes, as Knowledge holds them when staff describe something new. */
export const evalNotes: HotelInfoEntry[] = [
  {
    id: 'pets',
    category: 'policies',
    title: 'Dogs',
    details: 'Dogs are welcome in the cabin suites for a nightly fee. Not in the [[Spa]].',
    tags: ['pets', 'dogs'],
  },
  {
    id: 'quiet-hours',
    category: 'policies',
    title: 'Quiet hours',
    details: 'From 10 PM to 7 AM.',
    tags: ['noise'],
  },
  {
    id: 'breakfast',
    category: 'food',
    title: 'Breakfast',
    details: 'Continental breakfast from 7 to 10 AM in the lodge room, included in every stay.',
    tags: ['breakfast', 'included'],
  },
  {
    id: 'spa',
    category: 'wellness',
    title: 'Spa',
    details: 'Sauna and outdoor hot tub, open 4 to 9 PM. Booked per guest per night.',
    tags: ['sauna', 'hot tub'],
  },
  {
    id: 'parking',
    category: 'getting_here',
    title: 'Parking',
    details: 'Free self-parking for about 40 cars, with four EV chargers.',
    tags: ['parking', 'ev'],
  },
  {
    id: 'outdoors',
    category: 'activities',
    title: 'Hiking and skiing',
    details: 'Trails start at the door. A small ski area is a 10-minute walk away.',
    tags: ['hiking', 'skiing'],
  },
];

export interface KnowledgeFixture {
  id: string;
  language: string;
  text: string;
  /** Any of these folders passes. */
  folders: HotelInfoCategory[];
  /** The note it should fold into, or null for a new note. */
  updates: string | null;
  notice: boolean;
  /** Words the note must keep or say, ignoring case, each as alternatives any of which passes. */
  says: string[][];
}

export function buildKnowledgeFixtures(today: string): KnowledgeFixture[] {
  const in5 = addDays(today, 5);
  return [
    {
      id: 'kn_01',
      language: 'en',
      text: 'we run an airport shuttle from Reno now, $40 per person each way, book 48h ahead',
      folders: ['getting_here'],
      updates: null,
      notice: false,
      says: [['Reno'], ['40'], ['48']],
    },
    {
      id: 'kn_02',
      language: 'en',
      text: `hot tub is closed for repairs until ${in5}, sauna still open`,
      folders: ['wellness'],
      updates: null,
      notice: true,
      says: [['hot tub'], ['sauna']],
    },
    {
      id: 'kn_03',
      language: 'en',
      text: 'breakfast starts at 6:30 on weekends now',
      folders: ['food'],
      updates: 'breakfast',
      notice: false,
      says: [['6:30'], ['included'], ['continental']],
    },
    {
      id: 'kn_04',
      language: 'en',
      text: 'Dogs: $25 per night, max 2 dogs, must be on a leash in the lodge',
      folders: ['policies'],
      updates: 'pets',
      notice: false,
      says: [['25'], ['leash'], ['cabin']],
    },
    {
      id: 'kn_05',
      language: 'en',
      text: 'coin laundry in the basement, detergent at the front desk',
      folders: ['services'],
      updates: null,
      notice: false,
      says: [['laundry'], ['basement'], ['detergent']],
    },
    {
      id: 'kn_06',
      language: 'cs',
      text: 'Na recepci půjčujeme sněžnice, 15 dolarů na den.',
      folders: ['activities'],
      updates: null,
      notice: false,
      says: [['snowshoe'], ['15']],
    },
    {
      id: 'kn_07',
      language: 'en',
      text: 'quiet hours change to 11pm - 7am',
      folders: ['policies'],
      updates: 'quiet-hours',
      notice: false,
      says: [['11'], ['7']],
    },
    {
      id: 'kn_08',
      language: 'en',
      text: 'rooms on the 3rd floor have a view of the lake, ask for one when booking',
      folders: ['rooms'],
      updates: null,
      notice: false,
      says: [['lake'], ['3', 'third']],
    },
  ];
}

/** What is wrong with a filed note, or nothing. */
export function scoreFiledNote(f: KnowledgeFixture, filed: FiledNote | null): string[] {
  if (!filed) return ['no note'];
  const { draft } = filed;
  return [
    ...(f.folders.includes(draft.category) ? [] : [`folder ${draft.category}`]),
    ...(filed.id === f.updates ? [] : [`updates ${filed.id ?? 'nothing'}`]),
    ...(Boolean(draft.until) === f.notice ? [] : [f.notice ? 'no end date' : 'end date']),
    ...(draft.tags.length > 0 ? [] : ['no tags']),
    ...f.says
      .filter((words) => !words.some((w) => draft.details.toLowerCase().includes(w.toLowerCase())))
      .map((words) => `missing ${words[0]}`),
  ];
}
