import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { hotelInfoDraftSchema } from './hotel';

const note = {
  category: 'wellness',
  title: 'Private wellness',
  details: 'Private wellness is 60 an hour.',
};

describe('hotelInfoDraftSchema', () => {
  it('reads a note without an end date as always applying', () => {
    expect(hotelInfoDraftSchema.parse(note)).toEqual({ ...note, tags: [], until: null });
    expect(hotelInfoDraftSchema.parse({ ...note, until: '' }).until).toBeNull();
    expect(hotelInfoDraftSchema.parse({ ...note, until: 'null' }).until).toBeNull();
  });

  it('keeps a notice end date and refuses one that is not a date', () => {
    expect(hotelInfoDraftSchema.parse({ ...note, until: '2026-05-15' }).until).toBe('2026-05-15');
    expect(hotelInfoDraftSchema.safeParse({ ...note, until: 'Friday' }).success).toBe(false);
  });

  it('reads tags given as one comma-separated string as a list', () => {
    expect(hotelInfoDraftSchema.parse({ ...note, tags: 'Spa, private ,' }).tags).toEqual([
      'spa',
      'private',
    ]);
  });

  it('asks a model only for the folder, title and details', () => {
    const schema = z.toJSONSchema(hotelInfoDraftSchema, { io: 'input' });
    expect(schema.required).toEqual(['category', 'title', 'details']);
  });
});
