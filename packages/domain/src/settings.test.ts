import type { HotelProfile, StaffMember } from '@orbit/shared';
import { describe, expect, it } from 'vitest';
import { DomainError } from './errors';
import {
  assertValidProfile,
  changedProfileFields,
  createSettingsService,
  currentEntries,
  emptyHotelProfile,
  MAX_HOTEL_INFO_ENTRIES,
  withEntry,
  withHotelInfo,
} from './settings';
import { createMemoryRepositories } from './testing';

const manager: StaffMember = {
  id: 'stf_m',
  name: 'Test Manager',
  email: null,
  role: 'manager',
  language: 'cs',
  active: true,
};

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
    await service.updateProfile(profile, manager);
    expect(await service.getProfile()).toEqual({ ...profile, entries: [] });
    expect(repos.state.audit).toEqual([
      expect.objectContaining({
        actor: 'user',
        action: 'settings.profile',
        payload: { by: 'stf_m', changed: ['name', 'location'] },
      }),
    ]);
  });

  it('keeps the entries as stored, so an older form cannot undo a fact saved since', async () => {
    const repos = createMemoryRepositories({ profile });
    const service = createSettingsService({ repos });
    await service.updateProfile({ ...profile, name: 'Renamed', entries: [] }, manager);
    expect(await service.getProfile()).toEqual({ ...profile, name: 'Renamed' });
  });

  it('lets only an active manager change the profile', async () => {
    const repos = createMemoryRepositories();
    const service = createSettingsService({ repos });
    const receptionist = { ...manager, role: 'receptionist' as const };
    await expect(service.updateProfile(profile, receptionist)).rejects.toMatchObject({
      code: 'forbidden',
    });
    await expect(service.updateProfile(profile, { ...manager, active: false })).rejects.toThrow(
      DomainError,
    );
    await expect(service.updateProfile(profile, null)).rejects.toThrow(DomainError);
    expect(repos.state.profile).toBeNull();
  });

  it('writes nothing when the profile did not change', async () => {
    const repos = createMemoryRepositories({ profile });
    await createSettingsService({ repos }).updateProfile(profile, manager);
    expect(repos.state.audit).toEqual([]);
  });

  it('saves nothing when the profile is invalid', async () => {
    const repos = createMemoryRepositories({ profile });
    await expect(
      createSettingsService({ repos }).updateProfile({ ...profile, checkInFrom: '09:00' }, manager),
    ).rejects.toThrow(DomainError);
    expect(repos.state.profile).toEqual(profile);
  });
});

describe('hotel info from the agent', () => {
  const today = '2026-05-10';
  const stamp = { source: 'agent' as const, at: '2026-05-10T12:00:00.000Z' };
  const draft = {
    category: 'info' as const,
    title: 'EV charging',
    details: 'Two chargers.',
    until: null,
  };

  it('adds a new fact with an ID of its category', () => {
    const { profile: next, entry, replaced } = withHotelInfo(profile, draft, today, stamp);
    expect(replaced).toBeNull();
    expect(entry).toMatchObject({
      id: 'info-3',
      title: 'EV charging',
      until: null,
      source: 'agent',
      updatedAt: stamp.at,
    });
    expect(next.entries).toHaveLength(3);
  });

  it('replaces the entry with the same title, whatever its case', () => {
    const {
      profile: next,
      entry,
      replaced,
    } = withHotelInfo(
      profile,
      { ...draft, category: 'amenity', title: 'parking ', details: 'Paid now.' },
      today,
      stamp,
    );
    expect(replaced?.id).toBe('parking');
    expect(entry).toMatchObject({ id: 'parking', title: 'parking', details: 'Paid now.' });
    expect(next.entries).toHaveLength(2);
  });

  it('keeps a notice from replacing an entry that always applies', () => {
    expect(() =>
      withHotelInfo(
        profile,
        { category: 'amenity', title: 'Parking', details: 'Closed today.', until: today },
        today,
        stamp,
      ),
    ).toThrow(/give the notice its own title/);
  });

  it('refuses a notice that has already ended', () => {
    expect(() => withHotelInfo(profile, { ...draft, until: '2026-05-09' }, today, stamp)).toThrow(
      DomainError,
    );
  });

  it('refuses a new fact when the profile is full', () => {
    const full = {
      ...profile,
      entries: Array.from({ length: MAX_HOTEL_INFO_ENTRIES }, (_, i) => ({
        id: `e${i}`,
        category: 'info' as const,
        title: `Entry ${i}`,
        details: 'x',
      })),
    };
    expect(() => withHotelInfo(full, draft, today, stamp)).toThrow(/at most 100/);
    expect(() => withHotelInfo(full, { ...draft, title: 'Entry 3' }, today, stamp)).not.toThrow();
  });

  it('leaves out notices whose last day has passed', () => {
    const withNotices = {
      ...profile,
      entries: [
        ...profile.entries,
        { id: 'a', category: 'amenity' as const, title: 'Sauna', details: 'Closed.', until: today },
        {
          id: 'b',
          category: 'amenity' as const,
          title: 'Pool',
          details: 'Closed.',
          until: '2026-05-09',
        },
      ],
    };
    expect(currentEntries(withNotices, today).entries.map((e) => e.id)).toEqual([
      'parking',
      'quiet',
      'a',
    ]);
  });

  it('saves a fact for any staff member and logs it', async () => {
    const repos = createMemoryRepositories({ profile });
    const service = createSettingsService({ repos, clock: () => new Date('2026-05-10T12:00:00Z') });
    await service.saveHotelInfo({ ...draft, source: 'reply' }, 'agent');
    expect(repos.state.profile?.entries.at(-1)).toMatchObject({
      title: 'EV charging',
      source: 'reply',
    });
    expect(repos.state.audit).toEqual([
      expect.objectContaining({
        actor: 'agent',
        action: 'settings.entry',
        payload: { title: 'EV charging', category: 'info', replaced: false },
      }),
    ]);
  });
});

describe('Knowledge entries', () => {
  const today = '2026-05-10';
  const stamp = { source: 'staff' as const, at: '2026-05-10T12:00:00.000Z' };
  const receptionist: StaffMember = { ...manager, id: 'stf_r', role: 'receptionist' };
  const draft = {
    category: 'info' as const,
    title: 'Late arrival',
    details: 'Key box.',
    until: null,
  };

  it('adds an entry staff wrote', () => {
    const { profile: next, entry } = withEntry(profile, null, draft, today, stamp);
    expect(entry).toMatchObject({ id: 'info-3', source: 'staff', updatedAt: stamp.at });
    expect(next.entries).toHaveLength(3);
  });

  it('edits an entry in place, also into another category', () => {
    const { profile: next } = withEntry(
      profile,
      'parking',
      { category: 'info', title: 'Parking', details: 'Paid now.', until: null },
      today,
      stamp,
    );
    expect(next.entries[0]).toMatchObject({
      id: 'parking',
      category: 'info',
      details: 'Paid now.',
    });
  });

  it('keeps titles unique', () => {
    expect(() =>
      withEntry(profile, 'parking', { ...draft, title: 'quiet hours' }, today, stamp),
    ).toThrow(/already an entry called "Quiet hours"/);
  });

  it('refuses an unknown entry and a new end date in the past, but keeps an old one', () => {
    expect(() => withEntry(profile, 'nope', draft, today, stamp)).toThrow(/not found/);
    expect(() => withEntry(profile, null, { ...draft, until: '2026-05-01' }, today, stamp)).toThrow(
      /today or later/,
    );
    const ended = {
      ...profile,
      entries: [{ ...profile.entries[0]!, until: '2026-05-01' }, profile.entries[1]!],
    };
    expect(() =>
      withEntry(
        ended,
        'parking',
        { category: 'amenity', title: 'Parking', details: 'Reworded.', until: '2026-05-01' },
        today,
        stamp,
      ),
    ).not.toThrow();
  });

  it('lets any active staff member add, edit and remove entries, and logs who', async () => {
    const repos = createMemoryRepositories({ profile });
    const service = createSettingsService({ repos, clock: () => new Date('2026-05-10T12:00:00Z') });
    const added = await service.saveEntry(null, draft, receptionist);
    await service.saveEntry(added.id, { ...draft, details: 'Key box by the door.' }, receptionist);
    await service.removeEntry('quiet', receptionist);
    expect(repos.state.profile?.entries.map((e) => e.title)).toEqual(['Parking', 'Late arrival']);
    expect(repos.state.audit.map((a) => [a.action, a.payload])).toEqual([
      ['settings.entry', expect.objectContaining({ by: 'stf_r', replaced: false })],
      ['settings.entry', expect.objectContaining({ by: 'stf_r', replaced: true })],
      ['settings.entry_remove', expect.objectContaining({ by: 'stf_r', title: 'Quiet hours' })],
    ]);
  });

  it('refuses someone signed out or no longer active', async () => {
    const service = createSettingsService({ repos: createMemoryRepositories({ profile }) });
    await expect(service.saveEntry(null, draft, null)).rejects.toMatchObject({ code: 'forbidden' });
    await expect(
      service.removeEntry('quiet', { ...receptionist, active: false }),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });
});
