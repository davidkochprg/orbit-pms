import type { HotelInfoEntry } from '@orbit/shared';
import { describe, expect, it } from 'vitest';
import { fileNotePrompt } from './prompts/knowledge';
import { type NoteFiling, toFiledNote } from './knowledge';

const today = '2026-05-10';
const notes: HotelInfoEntry[] = [
  {
    id: 'parking',
    category: 'getting_here',
    title: 'Parking',
    details: 'Free self-parking for 40 cars.',
    tags: ['parking'],
  },
  { id: 'spa', category: 'wellness', title: 'Spa', details: 'Sauna and hot tub, 4 to 9 PM.' },
  {
    id: 'pool-closed',
    category: 'wellness',
    title: 'Pool closed',
    details: 'For repairs.',
    until: '2026-05-12',
  },
];
const filing: NoteFiling = {
  update: null,
  folder: 'policies',
  title: ' Dogs ',
  details: 'Welcome for $25 a night, not in the [[spa]] or [[Breakfast]]. ',
  tags: ['Pets', '#dogs', 'a-tag-much-longer-than-anyone-would-use'],
  until: null,
};

describe('toFiledNote', () => {
  it('files a new note: trimmed, tags tidied, links kept only to notes that exist', () => {
    expect(toFiledNote(filing, notes, today)).toEqual({
      id: null,
      draft: {
        category: 'policies',
        title: 'Dogs',
        details: 'Welcome for $25 a night, not in the [[spa]] or Breakfast.',
        tags: ['pets', 'dogs'],
        until: null,
      },
    });
  });

  it('folds it into the note the model named, or the one with its title', () => {
    const update = {
      ...filing,
      update: 'parking',
      title: 'Parking',
      folder: 'getting_here' as const,
    };
    expect(toFiledNote(update, notes, today)?.id).toBe('parking');
    expect(toFiledNote({ ...update, update: null }, notes, today)?.id).toBe('parking');
  });

  it('never links a note to itself', () => {
    const self = { ...filing, update: 'Spa', title: 'Spa', details: 'The [[Spa]] has a sauna.' };
    expect(toFiledNote(self, notes, today)?.draft.details).toBe('The Spa has a sauna.');
  });

  it('keeps a notice out of a lasting note, as a new note of its own', () => {
    const notice = { ...filing, update: 'Spa', title: 'Spa closed', until: '2026-05-11' };
    expect(toFiledNote(notice, notes, today)).toMatchObject({
      id: null,
      draft: { title: 'Spa closed' },
    });
    expect(toFiledNote({ ...notice, title: 'Spa' }, notes, today)).toBeNull();
  });

  it('updates a notice with a later end date', () => {
    const notice = { ...filing, update: 'Pool closed', title: 'Pool closed', until: '2026-05-20' };
    expect(toFiledNote(notice, notes, today)).toMatchObject({
      id: 'pool-closed',
      draft: { until: '2026-05-20' },
    });
  });

  it('refuses a title another note has, and an empty or overlong note', () => {
    expect(toFiledNote({ ...filing, update: 'Parking', title: 'Spa' }, notes, today)).toBeNull();
    expect(toFiledNote({ ...filing, title: ' ' }, notes, today)).toBeNull();
    expect(toFiledNote({ ...filing, details: 'x'.repeat(1001) }, notes, today)).toBeNull();
  });

  it('drops an end date in the past', () => {
    expect(toFiledNote({ ...filing, until: '2026-05-01' }, notes, today)?.draft.until).toBeNull();
  });
});

describe('fileNotePrompt', () => {
  it('gives the model the notes with folders and tags, the tags in use and the description', () => {
    const prompt = fileNotePrompt({ text: 'Dogs ok in cabins', notes, today });
    expect(prompt).toContain('Today is 2026-05-10.');
    expect(prompt).toContain('- Parking (getting_here; #parking): Free self-parking for 40 cars.');
    expect(prompt).toContain('- Spa (wellness): Sauna and hot tub, 4 to 9 PM.');
    expect(prompt).toContain('Tags in use: parking');
    expect(prompt).toContain('"""\nDogs ok in cabins\n"""');
  });
});
