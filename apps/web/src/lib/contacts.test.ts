import type { Contact } from '@orbit/shared';
import { describe, expect, it } from 'vitest';
import { contactMatches } from './contacts';

const plumber: Contact = {
  id: 'ct_1',
  name: 'Ridgeline Plumbing',
  person: 'Sam',
  trades: ['plumbing', 'heating'],
  phone: null,
  email: null,
  language: 'en',
  notes: null,
};

describe('contactMatches', () => {
  it('matches by name, person or trade, ignoring case', () => {
    expect(contactMatches(plumber, '')).toBe(true);
    expect(contactMatches(plumber, 'ridge')).toBe(true);
    expect(contactMatches(plumber, 'sam')).toBe(true);
    expect(contactMatches(plumber, 'heat')).toBe(true);
    expect(contactMatches(plumber, 'electric')).toBe(false);
  });
});
