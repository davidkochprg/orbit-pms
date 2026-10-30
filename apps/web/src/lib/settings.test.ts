import type { HotelInfoEntry, HotelProfile } from '@orbit/shared';
import { describe, expect, it } from 'vitest';
import {
  fromPercent,
  fromSurcharge,
  isEntrySection,
  isSettingsSection,
  newSeason,
  sameSettings,
  toPercent,
  toSurcharge,
} from './settings';

const entry = (id: string): HotelInfoEntry => ({
  id,
  category: 'policies',
  title: 'Title',
  details: 'Details',
});

describe('isSettingsSection', () => {
  it('accepts known sections only', () => {
    expect(isSettingsSection('team')).toBe(true);
    expect(isSettingsSection('property')).toBe(true);
    expect(isSettingsSection('amenity')).toBe(false);
    expect(isSettingsSection('billing')).toBe(false);
    // Rooms and rates have their own pages.
    expect(isSettingsSection('rooms')).toBe(false);
    expect(isSettingsSection('rates')).toBe(false);
    expect(isSettingsSection(undefined)).toBe(false);
  });
});

describe('isEntrySection', () => {
  it('knows the old Settings tabs that moved to Knowledge', () => {
    expect(isEntrySection('amenity')).toBe(true);
    expect(isEntrySection('policies')).toBe(false);
    expect(isEntrySection('team')).toBe(false);
    expect(isEntrySection(undefined)).toBe(false);
  });
});

describe('sameSettings', () => {
  const profile: HotelProfile = {
    country: 'US',
    language: 'en',
    coordinates: null,
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
