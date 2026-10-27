import type { AuditActor, HotelProfile } from '@orbit/shared';
import { DomainError } from './errors';
import type { Repositories } from './repositories';

/** What Settings shows before anyone has described the property. */
export const emptyHotelProfile: HotelProfile = {
  name: 'Your hotel',
  location: 'Not set yet',
  description: null,
  phone: null,
  email: null,
  website: null,
  checkInFrom: '15:00',
  checkOutBy: '10:00',
  entries: [],
};

/**
 * Throws unless the profile is consistent: entry IDs are unique, and check-out is earlier in the
 * day than check-in, so a room can be turned over between two guests.
 */
export function assertValidProfile(profile: HotelProfile): void {
  const ids = new Set<string>();
  for (const entry of profile.entries) {
    if (ids.has(entry.id)) throw new DomainError('invalid_input', `Duplicate entry ${entry.id}`);
    ids.add(entry.id);
  }
  if (profile.checkOutBy >= profile.checkInFrom) {
    throw new DomainError(
      'invalid_input',
      `Check-out (${profile.checkOutBy}) must be earlier than check-in (${profile.checkInFrom})`,
    );
  }
}

/** Top-level fields that differ between two profiles, for the audit log. */
export function changedProfileFields(before: HotelProfile, after: HotelProfile): string[] {
  return (Object.keys(after) as (keyof HotelProfile)[]).filter(
    (key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]),
  );
}

export interface SettingsDeps {
  repos: Repositories;
}

/** The hotel profile: property details, policies, amenities and guest information. */
export function createSettingsService({ repos }: SettingsDeps) {
  async function getProfile(): Promise<HotelProfile> {
    return (await repos.settings.getProfile()) ?? emptyHotelProfile;
  }

  return {
    getProfile,

    /** Replaces the profile. A save that changes nothing writes no audit entry. */
    async updateProfile(profile: HotelProfile, actor: AuditActor): Promise<HotelProfile> {
      assertValidProfile(profile);
      return repos.transaction(async (tx) => {
        const before = (await tx.settings.getProfile()) ?? emptyHotelProfile;
        const changed = changedProfileFields(before, profile);
        if (changed.length === 0) return before;
        await tx.settings.saveProfile(profile);
        await tx.audit.append({
          actor,
          action: 'settings.profile',
          subjectId: null,
          payload: { changed },
        });
        return profile;
      });
    },
  };
}

export type SettingsService = ReturnType<typeof createSettingsService>;
