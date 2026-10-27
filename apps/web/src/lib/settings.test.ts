import type { HotelInfoEntry, HotelProfile } from '@orbit/shared';
import { describe, expect, it } from 'vitest';
import { isSettingsSection, newEntry, sameProfile } from './settings';

const entry = (id: string): HotelInfoEntry => ({
  id,
  category: 'policy',
  title: 'Title',
  details: 'Details',
});

describe('isSettingsSection', () => {
  it('accepts known sections only', () => {
    expect(isSettingsSection('team')).toBe(true);
    expect(isSettingsSection('amenity')).toBe(true);
    expect(isSettingsSection('billing')).toBe(false);
    expect(isSettingsSection(undefined)).toBe(false);
  });
});

describe('newEntry', () => {
  it('makes a blank entry with an unused ID', () => {
    expect(newEntry('amenity', [])).toEqual({
      id: 'amenity-1',
      category: 'amenity',
      title: '',
      details: '',
    });
    expect(newEntry('policy', [entry('policy-2'), entry('policy-3')]).id).toBe('policy-4');
  });
});

describe('sameProfile', () => {
  const profile: HotelProfile = {
    name: 'A',
    location: 'B',
    description: null,
    phone: null,
    email: null,
    website: null,
    checkInFrom: '15:00',
    checkOutBy: '10:00',
    entries: [entry('x')],
  };

  it('compares by value', () => {
    expect(sameProfile(profile, structuredClone(profile))).toBe(true);
    expect(sameProfile(profile, { ...profile, entries: [] })).toBe(false);
  });
});
