import type { HotelProfile } from '@orbit/shared';
import { describe, expect, it } from 'vitest';
import { DomainError } from './errors';
import {
  assertValidProfile,
  changedProfileFields,
  createSettingsService,
  emptyHotelProfile,
} from './settings';
import { createMemoryRepositories } from './testing';

const profile: HotelProfile = {
  ...emptyHotelProfile,
  name: 'Test Lodge',
  location: 'Test Valley',
  entries: [
    { id: 'parking', category: 'amenity', title: 'Parking', details: 'Free, behind the house.' },
    { id: 'quiet', category: 'policy', title: 'Quiet hours', details: 'From 22:00 to 07:00.' },
  ],
};

describe('assertValidProfile', () => {
  it('accepts a consistent profile', () => {
    expect(() => assertValidProfile(profile)).not.toThrow();
  });

  it('rejects duplicate entry IDs', () => {
    const dup = { ...profile, entries: [profile.entries[0]!, profile.entries[0]!] };
    expect(() => assertValidProfile(dup)).toThrow(/Duplicate entry parking/);
  });

  it('needs check-out before check-in, so rooms can be turned over', () => {
    expect(() => assertValidProfile({ ...profile, checkOutBy: '15:00' })).toThrow(DomainError);
    expect(() => assertValidProfile({ ...profile, checkOutBy: '16:00' })).toThrow(
      /must be earlier than check-in/,
    );
  });
});

describe('changedProfileFields', () => {
  it('names the top-level fields that changed', () => {
    expect(changedProfileFields(profile, profile)).toEqual([]);
    expect(
      changedProfileFields(profile, { ...profile, name: 'New', entries: profile.entries.slice(1) }),
    ).toEqual(['name', 'entries']);
  });
});

describe('createSettingsService', () => {
  it('returns the empty profile until one is saved', async () => {
    const service = createSettingsService({ repos: createMemoryRepositories() });
    expect(await service.getProfile()).toEqual(emptyHotelProfile);
  });

  it('saves the profile and audits which fields changed', async () => {
    const repos = createMemoryRepositories();
    const service = createSettingsService({ repos });
    await service.updateProfile(profile, 'user');
    expect(await service.getProfile()).toEqual(profile);
    expect(repos.state.audit).toEqual([
      expect.objectContaining({
        actor: 'user',
        action: 'settings.profile',
        payload: { changed: ['name', 'location', 'entries'] },
      }),
    ]);
  });

  it('writes nothing when the profile did not change', async () => {
    const repos = createMemoryRepositories({ profile });
    await createSettingsService({ repos }).updateProfile(profile, 'user');
    expect(repos.state.audit).toEqual([]);
  });

  it('saves nothing when the profile is invalid', async () => {
    const repos = createMemoryRepositories({ profile });
    await expect(
      createSettingsService({ repos }).updateProfile({ ...profile, checkInFrom: '09:00' }, 'user'),
    ).rejects.toThrow(DomainError);
    expect(repos.state.profile).toEqual(profile);
  });
});
