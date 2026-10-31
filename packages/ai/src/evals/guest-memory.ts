import type { GuestMemoryItem, GuestMemoryKind } from '@orbit/shared';

export interface GuestMemoryFixture {
  id: string;
  /** A guest's history as `guestMemorySource` writes it. */
  source: string;
  /** Kinds that must be among the items. */
  kinds: GuestMemoryKind[];
  /** Each must match some item. */
  mentions: RegExp[];
  /** None may match any item. */
  never: RegExp[];
  /** At most this many items. */
  max: number;
  /** At most one item may match each of these, i.e. repeats are merged. */
  once?: RegExp[];
}

const history = (lines: string[]) => lines.join('\n');

export const guestMemoryFixtures: GuestMemoryFixture[] = [
  {
    id: 'mem_regular',
    source: history([
      'Guest: Simona Testová',
      'Profile notes: none',
      'Earlier stays (2):',
      '- 2026-03-06 to 2026-03-08, Queen room 104, 2 adults. Notes: Asked to move to a quieter room away from the road after the first night. Invoice to the company.',
      '- 2026-06-12 to 2026-06-15, Queen room 309, 2 adults, with wellness. Notes: Celebrating their wedding anniversary on June 14. Loved the bottle of local wine at turndown.',
      'What they wrote to the hotel, newest first:',
      '- 2026-06-01: "We arrive around 18:00, is that fine?"',
    ]),
    kinds: ['preference', 'occasion'],
    mentions: [/quiet/i, /anniversary/i],
    never: [/invoice/i, /18:00/],
    max: 5,
  },
  {
    id: 'mem_logistics',
    source: history([
      'Guest: Jonas Beispiel',
      'Profile notes: none',
      'Earlier stays (1):',
      '- 2026-02-10 to 2026-02-11, Cozy single 108, 1 adult. Notes: Arrived late, key left at the night box. Paid by bank transfer. Left a phone charger, posted back.',
      'What they wrote to the hotel, newest first:',
      '- 2026-02-12: "Thanks for sending the charger!"',
    ]),
    kinds: [],
    mentions: [],
    never: [/charger/i, /transfer/i, /key/i],
    max: 1,
  },
  {
    id: 'mem_sensitive',
    source: history([
      'Guest: Petr Vzorový',
      'Profile notes: Vegan.',
      'Earlier stays (1):',
      '- 2026-01-03 to 2026-01-07, Family room 205, 2 adults and children aged 4, 7. Notes: Complained about the noisy family from Germany next door. Paid late, after two reminders.',
      'What they wrote to the hotel, newest first:',
      '- 2026-09-20: "Můžeme mít zase pokoj s výhledem na hory jako minule? A dětskou postýlku už nepotřebujeme."',
    ]),
    kinds: ['care', 'preference'],
    mentions: [/vegan/i, /mountain/i],
    never: [/german/i, /complain/i, /late|reminder/i, /noisy/i],
    max: 5,
  },
  {
    id: 'mem_merge',
    source: history([
      'Guest: Maria Example',
      'Profile notes: none',
      'Earlier stays (3):',
      '- 2025-12-20 to 2025-12-23, King room 305, 2 adults. Notes: Extra pillows, please.',
      '- 2026-04-02 to 2026-04-05, King room 305, 2 adults. Notes: Asked for extra pillows again; brings her own coffee.',
      '- 2026-08-14 to 2026-08-16, King room 306, 2 adults. Notes: Extra pillows.',
      'What they wrote to the hotel, newest first:',
      '- nothing',
    ]),
    kinds: ['preference'],
    mentions: [/pillow/i],
    never: [],
    max: 5,
    once: [/pillow/i],
  },
];

/** What is wrong with a memory read from a fixture's history. */
export function scoreGuestMemory(f: GuestMemoryFixture, items: GuestMemoryItem[]): string[] {
  const problems: string[] = [];
  if (items.length > f.max) problems.push(`${items.length} items, at most ${f.max}`);
  for (const kind of f.kinds) {
    if (!items.some((i) => i.kind === kind)) problems.push(`no ${kind}`);
  }
  for (const m of f.mentions) {
    if (!items.some((i) => m.test(i.text))) problems.push(`nothing about ${m.source}`);
  }
  for (const n of f.never) {
    if (items.some((i) => n.test(i.text))) problems.push(`mentions ${n.source}`);
  }
  for (const o of f.once ?? []) {
    if (items.filter((i) => o.test(i.text)).length > 1) problems.push(`repeats ${o.source}`);
  }
  return problems;
}
