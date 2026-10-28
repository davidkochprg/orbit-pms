import type { HotelInfoEntry, HotelProfile } from '@orbit/shared';
import { describe, expect, it } from 'vitest';
import {
  fromPercent,
  fromSurcharge,
  isProfileSection,
  isSettingsSection,
  newEntry,
  newSeason,
  sameSettings,
  toPercent,
  toSurcharge,
} from './settings';

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

describe('sameSettings', () => {
  const profile: HotelProfile = {
    country: 'US',
    language: 'en',
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
    expect(sameSettings(profile, structuredClone(profile))).toBe(true);
    expect(sameSettings(profile, { ...profile, entries: [] })).toBe(false);
  });
});

describe('isProfileSection', () => {
  it('groups the sections saved as the hotel profile', () => {
    expect(isProfileSection('property')).toBe(true);
    expect(isProfileSection('info')).toBe(true);
    expect(isProfileSection('rates')).toBe(false);
    expect(isProfileSection('rooms')).toBe(false);
    expect(isProfileSection('team')).toBe(false);
  });
});

describe('percent helpers', () => {
  it('round-trips fractions without float noise', () => {
    expect(toPercent(0.15)).toBe(15);
    expect(toPercent(1 / 3)).toBe(33.3);
    expect(fromPercent(15)).toBe(0.15);
    expect(fromPercent(12.5)).toBe(0.125);
  });

  it('shows a season multiplier as a surcharge', () => {
    expect(toSurcharge(1.3)).toBe(30);
    expect(toSurcharge(0.9)).toBe(-10);
    expect(fromSurcharge(30)).toBe(1.3);
    expect(fromSurcharge(-10)).toBe(0.9);
  });
});

describe('newSeason', () => {
  it('picks an unused name', () => {
    expect(newSeason([]).name).toBe('season_1');
    expect(newSeason([newSeason([]), { ...newSeason([]), name: 'season_2' }]).name).toBe(
      'season_3',
    );
  });
});
