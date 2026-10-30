import type {
  AuditActor,
  HotelInfoCategory,
  HotelInfoDraft,
  HotelInfoEntry,
  HotelInfoProposal,
  HotelInfoSource,
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

/** Who wrote an entry and when, kept on it for Knowledge to show. */
export interface EntryStamp {
  source: HotelInfoSource;
  at: string;
}

function newEntryId(profile: HotelProfile, category: HotelInfoCategory): string {
  const taken = new Set(profile.entries.map((e) => e.id));
  let n = profile.entries.length + 1;
  while (taken.has(`${category}-${n}`)) n++;
  return `${category}-${n}`;
}

function assertRoom(profile: HotelProfile) {
  if (profile.entries.length >= MAX_HOTEL_INFO_ENTRIES) {
    throw new DomainError(
      'invalid_input',
      `The profile holds at most ${MAX_HOTEL_INFO_ENTRIES} entries; remove one first`,
    );
  }
}

const toEntry = (id: string, draft: HotelInfoDraft, stamp: EntryStamp): HotelInfoEntry => ({
  id,
  category: draft.category,
  title: draft.title.trim(),
  details: draft.details.trim(),
  until: draft.until,
  source: stamp.source,
  updatedAt: stamp.at,
});

const replace = (profile: HotelProfile, entry: HotelInfoEntry): HotelProfile => ({
  ...profile,
  entries: profile.entries.map((e) => (e.id === entry.id ? entry : e)),
});

/**
 * The profile with the fact the agent proposed: it replaces the entry with the same title, in any
 * category, or is added as a new one.
 */
export function withHotelInfo(
  profile: HotelProfile,
  draft: HotelInfoDraft,
  today: IsoDate,
  stamp: EntryStamp,
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
  if (!replaced) assertRoom(profile);
  const entry = toEntry(replaced?.id ?? newEntryId(profile, draft.category), draft, stamp);
  return {
    profile: replaced
      ? replace(profile, entry)
      : { ...profile, entries: [...profile.entries, entry] },
    entry,
    replaced,
  };
}

/**
 * The profile with an entry staff added (`id` null) or edited. Titles stay unique, so the agent's
 * corrections find the one entry they mean; an end date may only be set to today or later.
 */
export function withEntry(
  profile: HotelProfile,
  id: string | null,
  draft: HotelInfoDraft,
  today: IsoDate,
  stamp: EntryStamp,
): { profile: HotelProfile; entry: HotelInfoEntry } {
  const current = id === null ? null : profile.entries.find((e) => e.id === id);
  if (current === undefined) throw new DomainError('not_found', `Entry ${id} not found`);
  const clash = profile.entries.find((e) => e.id !== id && sameTitle(e.title, draft.title));
  if (clash) {
    throw new DomainError('conflict', `There is already an entry called "${clash.title}"`);
  }
  if (draft.until && draft.until < today && draft.until !== current?.until) {
    throw new DomainError('invalid_input', 'A notice has to last until today or later');
  }
  if (!current) assertRoom(profile);
  const entry = toEntry(current?.id ?? newEntryId(profile, draft.category), draft, stamp);
  return {
    profile: current
      ? replace(profile, entry)
      : { ...profile, entries: [...profile.entries, entry] },
    entry,
  };
}

/** Throws unless `by` is an active staff member: anyone on the team keeps Knowledge up to date. */
function assertStaff(by: StaffMember | null): asserts by is StaffMember {
  if (!by?.active) throw new DomainError('forbidden', 'Sign in as an active staff member');
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
    async previewHotelInfo({ source, ...draft }: HotelInfoProposal) {
      const now = clock();
      return withHotelInfo(await getProfile(), draft, hotelToday(now), {
        source,
        at: now.toISOString(),
      });
    },

    /**
     * Saves one fact, as staff confirm it from the agent or a reply. Like Knowledge, this is open
     * to all staff: one entry, confirmed by a person, and in the audit log.
     */
    async saveHotelInfo(
      { source, ...draft }: HotelInfoProposal,
      actor: AuditActor,
    ): Promise<HotelInfoEntry> {
      return repos.transaction(async (tx) => {
        const now = clock();
        const before = (await tx.settings.getProfile()) ?? emptyHotelProfile;
        const { profile, entry, replaced } = withHotelInfo(before, draft, hotelToday(now), {
          source,
          at: now.toISOString(),
        });
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

    /** Adds an entry (`id` null) or edits one, from Knowledge; any active staff member. */
    async saveEntry(
      id: string | null,
      draft: HotelInfoDraft,
      by: StaffMember | null,
    ): Promise<HotelInfoEntry> {
      assertStaff(by);
      return repos.transaction(async (tx) => {
        const now = clock();
        const before = (await tx.settings.getProfile()) ?? emptyHotelProfile;
        const { profile, entry } = withEntry(before, id, draft, hotelToday(now), {
          source: 'staff',
          at: now.toISOString(),
        });
        assertValidProfile(profile);
        await tx.settings.saveProfile(profile);
        await tx.audit.append({
          actor: 'user',
          action: 'settings.entry',
          subjectId: entry.id,
          payload: {
            by: by.id,
            title: entry.title,
            category: entry.category,
            replaced: id !== null,
          },
        });
        return entry;
      });
    },

    /** Removes an entry; any active staff member. */
    async removeEntry(id: string, by: StaffMember | null): Promise<void> {
      assertStaff(by);
      await repos.transaction(async (tx) => {
        const before = (await tx.settings.getProfile()) ?? emptyHotelProfile;
        const entry = before.entries.find((e) => e.id === id);
        if (!entry) throw new DomainError('not_found', `Entry ${id} not found`);
        await tx.settings.saveProfile({
          ...before,
          entries: before.entries.filter((e) => e.id !== id),
        });
        await tx.audit.append({
          actor: 'user',
          action: 'settings.entry_remove',
          subjectId: id,
          payload: { by: by.id, title: entry.title, category: entry.category },
        });
      });
    },

    /**
     * Replaces the property details; managers only. The entries stay as stored: they are kept in
     * Knowledge, so a Settings form opened earlier can't undo a fact saved since. A save that
     * changes nothing writes no audit entry.
     */
    async updateProfile(next: HotelProfile, by: StaffMember | null): Promise<HotelProfile> {
      assertManager(by);
      return repos.transaction(async (tx) => {
        const before = (await tx.settings.getProfile()) ?? emptyHotelProfile;
        const profile = { ...next, entries: before.entries };
        assertValidProfile(profile);
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
