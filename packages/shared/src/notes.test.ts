import { describe, expect, it } from 'vitest';
import { backlinks, keepLinks, noteLinks, noteRuns, renameLinks, withoutLinks } from './notes';

describe('noteRuns', () => {
  it('splits text into plain runs and links', () => {
    expect(noteRuns('Free, see [[Parking]] and [[ Spa ]].')).toEqual([
      { text: 'Free, see ' },
      { link: 'Parking' },
      { text: ' and ' },
      { link: 'Spa' },
      { text: '.' },
    ]);
  });

  it('reads text without links as one run, and empty or broken brackets as text', () => {
    expect(noteRuns('Open daily.')).toEqual([{ text: 'Open daily.' }]);
    expect(noteRuns('a [[]] b [[x')).toEqual([{ text: 'a [[]] b [[x' }]);
    expect(noteRuns('')).toEqual([]);
  });
});

describe('noteLinks', () => {
  it('lists linked titles once, ignoring case', () => {
    expect(noteLinks('[[Spa]], [[spa]] and [[Parking]]')).toEqual(['Spa', 'Parking']);
  });
});

describe('withoutLinks', () => {
  it('reads links as plain words', () => {
    expect(withoutLinks('Not in the [[Spa]].')).toBe('Not in the Spa.');
  });
});

describe('backlinks', () => {
  const notes = [
    { title: 'Dogs', details: 'Not in the [[spa]].' },
    { title: 'Spa', details: 'Open 4 to 9 PM. See [[Spa]].' },
    { title: 'Parking', details: 'Free.' },
  ];

  it('finds the notes that link to a title, not the note itself', () => {
    expect(backlinks(notes, 'Spa').map((n) => n.title)).toEqual(['Dogs']);
    expect(backlinks(notes, 'Parking')).toEqual([]);
  });
});

describe('renameLinks', () => {
  it('points links at the new title and leaves other links alone', () => {
    expect(renameLinks('[[spa]] and [[Parking]]', 'Spa', 'Spa and sauna')).toBe(
      '[[Spa and sauna]] and [[Parking]]',
    );
  });
});

describe('keepLinks', () => {
  it('turns links to unknown notes into plain words', () => {
    expect(keepLinks('[[Spa]] or [[Pool]]', (t) => t === 'Spa')).toBe('[[Spa]] or Pool');
  });
});
