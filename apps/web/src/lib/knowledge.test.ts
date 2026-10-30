import type { HotelInfoEntry } from '@orbit/shared';
import { describe, expect, it } from 'vitest';
import {
  activeNotices,
  findNote,
  matchesNote,
  noteBlocks,
  parseTags,
  tagCounts,
  vaultFolders,
} from './knowledge';

const notes: HotelInfoEntry[] = [
  {
    id: 'spa',
    category: 'wellness',
    title: 'Spa',
    details: 'Sauna, 4 to 9 PM.',
    tags: ['sauna', 'add-on'],
  },
  {
    id: 'dogs',
    category: 'policies',
    title: 'Dogs',
    details: 'Not in the [[Spa]].',
    tags: ['pets', 'sauna'],
  },
  { id: 'bus', category: 'getting_here', title: 'Bus', details: 'Stop nearby.' },
  {
    id: 'closed',
    category: 'wellness',
    title: 'Hot tub closed',
    details: 'Repairs.',
    until: '2026-05-12',
  },
  { id: 'old', category: 'wellness', title: 'Pool closed', details: 'Done.', until: '2026-05-01' },
];

describe('noteBlocks', () => {
  it('reads lines as paragraphs and "- " lines as one list', () => {
    expect(noteBlocks('Open daily.\n\n- Sauna\n- [[Spa]] tub\nAsk at the desk.')).toEqual([
      { kind: 'text', runs: [{ text: 'Open daily.' }] },
      { kind: 'list', items: [[{ text: 'Sauna' }], [{ link: 'Spa' }, { text: ' tub' }]] },
      { kind: 'text', runs: [{ text: 'Ask at the desk.' }] },
    ]);
  });
});

describe('findNote', () => {
  it('finds a linked note by title, ignoring case', () => {
    expect(findNote(notes, 'spa')?.id).toBe('spa');
    expect(findNote(notes, 'Pool')).toBeUndefined();
  });
});

describe('matchesNote', () => {
  it('matches the title, the text without brackets and tags', () => {
    expect(matchesNote(notes[1]!, 'dog')).toBe(true);
    expect(matchesNote(notes[1]!, 'the spa')).toBe(true);
    expect(matchesNote(notes[1]!, '#pets')).toBe(true);
    expect(matchesNote(notes[1]!, 'parking')).toBe(false);
    expect(matchesNote(notes[1]!, ' ')).toBe(true);
  });
});

describe('vaultFolders', () => {
  it('groups notes by folder in the fixed order, sorted by title, without empty folders', () => {
    expect(vaultFolders(notes).map((f) => [f.folder, f.notes.map((n) => n.id)])).toEqual([
      ['policies', ['dogs']],
      ['wellness', ['closed', 'old', 'spa']],
      ['getting_here', ['bus']],
    ]);
  });
});

describe('activeNotices', () => {
  it('lists notices still in effect today', () => {
    expect(activeNotices(notes, '2026-05-10').map((n) => n.id)).toEqual(['closed']);
    expect(activeNotices(notes, '2026-05-13')).toEqual([]);
  });
});

describe('tagCounts', () => {
  it('counts tags, most used first, then by name', () => {
    expect(tagCounts(notes)).toEqual([
      { tag: 'sauna', count: 2 },
      { tag: 'add-on', count: 1 },
      { tag: 'pets', count: 1 },
    ]);
  });
});

describe('parseTags', () => {
  it('splits typed tags on commas without "#"', () => {
    expect(parseTags(' pets, #dogs,, ')).toEqual(['pets', 'dogs']);
  });
});
