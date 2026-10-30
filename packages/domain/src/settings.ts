import type {
  AuditActor,
  HotelInfoDraft,
  HotelInfoEntry,
  HotelProfile,
  IsoDate,
  StaffMember,
} from '@orbit/shared';
import { DomainError } from './errors';
import type { Repositories } from './repositories';
import { hotelToday } from './dates';
import { assertManager } from './staff';

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
  country: 'US',
  language: 'en',
  coordinates: null,
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

/** The most entries a profile holds; all of them go into the agent's prompt. */
export const MAX_HOTEL_INFO_ENTRIES = 100;

const sameTitle = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The profile without notices whose last day has passed, as guests should be told about it. */
export function currentEntries(profile: HotelProfile, today: IsoDate): HotelProfile {
  return { ...profile, entries: profile.entries.filter((e) => !e.until || e.until >= today) };
}

/**
 * The profile with the fact saved: it replaces the entry with the same title, in any category,
 * or is added as a new one.
 */
export function withHotelInfo(
  profile: HotelProfile,
  draft: HotelInfoDraft,
  today: IsoDate,
): { profile: HotelProfile; entry: HotelInfoEntry; replaced: HotelInfoEntry | null } {
  if (draft.until && draft.until < today) {
    throw new DomainError('invalid_input', 'A notice has to last until today or later');
  }
  const replaced = profile.entries.find((e) => sameTitle(e.title, draft.title)) ?? null;
  // A notice ends; the entry it would replace should not end with it.
  if (replaced && draft.until && !replaced.until) {
    throw new DomainError(
      'invalid_input',
      `"${replaced.title}" always applies; give the notice its own title, e.g. "${replaced.title} closed"`,
    );
  }
  if (!replaced && profile.entries.length >= MAX_HOTEL_INFO_ENTRIES) {
    throw new DomainError(
      'invalid_input',
      `The profile holds at most ${MAX_HOTEL_INFO_ENTRIES} entries; remove one first`,
    );
  }
  const taken = new Set(profile.entries.map((e) => e.id));
  let n = profile.entries.length + 1;
  while (taken.has(`${draft.category}-${n}`)) n++;
  const entry: HotelInfoEntry = {
    id: replaced?.id ?? `${draft.category}-${n}`,
    category: draft.category,
    title: draft.title.trim(),
    details: draft.details.trim(),
    until: draft.until,
  };
  return {
    profile: {
      ...profile,
      entries: replaced
        ? profile.entries.map((e) => (e.id === replaced.id ? entry : e))
        : [...profile.entries, entry],
    },
    entry,
    replaced,
  };
}

export interface SettingsDeps {
  repos: Repositories;
  clock?: () => Date;
}

/** The hotel profile: property details, policies, amenities and guest information. */
export function createSettingsService({ repos, clock = () => new Date() }: SettingsDeps) {
  async function getProfile(): Promise<HotelProfile> {
    return (await repos.settings.getProfile()) ?? emptyHotelProfile;
  }

  return {
    getProfile,

    /** What saving the fact would change, without saving it. */
    async previewHotelInfo(draft: HotelInfoDraft) {
      return withHotelInfo(await getProfile(), draft, hotelToday(clock()));
    },

    /**
     * Saves one fact, as staff confirm it from the agent or a reply. Unlike editing Settings this
     * is open to all staff: it is one entry, confirmed by a person, and in the audit log.
     */
    async saveHotelInfo(draft: HotelInfoDraft, actor: AuditActor): Promise<HotelInfoEntry> {
      return repos.transaction(async (tx) => {
        const before = (await tx.settings.getProfile()) ?? emptyHotelProfile;
        const { profile, entry, replaced } = withHotelInfo(before, draft, hotelToday(clock()));
        assertValidProfile(profile);
        await tx.settings.saveProfile(profile);
        await tx.audit.append({
          actor,
          action: 'settings.entry',
          subjectId: entry.id,
          payload: { title: entry.title, category: entry.category, replaced: replaced !== null },
        });
        return entry;
      });
    },

    /** Replaces the profile; managers only. A save that changes nothing writes no audit entry. */
    async updateProfile(profile: HotelProfile, by: StaffMember | null): Promise<HotelProfile> {
      assertManager(by);
      assertValidProfile(profile);
      return repos.transaction(async (tx) => {
        const before = (await tx.settings.getProfile()) ?? emptyHotelProfile;
        const changed = changedProfileFields(before, profile);
        if (changed.length === 0) return before;
        await tx.settings.saveProfile(profile);
        await tx.audit.append({
          actor: 'user',
          action: 'settings.profile',
          subjectId: null,
          payload: { by: by.id, changed },
        });
        return profile;
      });
    },
  };
}

export type SettingsService = ReturnType<typeof createSettingsService>;
