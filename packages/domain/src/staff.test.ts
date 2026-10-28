import type { StaffMember } from '@orbit/shared';
import { describe, expect, it } from 'vitest';
import { assertKeepsManager, assertManager, assertUniqueEmail, createStaffService } from './staff';
import { createMemoryRepositories } from './testing';

const manager: StaffMember = {
  id: 'stf_m',
  name: 'Test Manager',
  email: 'manager@example.com',
  role: 'manager',
  language: 'cs',
  active: true,
};
const desk: StaffMember = {
  id: 'stf_d',
  name: 'Test Desk',
  email: 'desk@example.com',
  role: 'receptionist',
  language: 'cs',
  active: true,
};
const former: StaffMember = {
  ...desk,
  id: 'stf_f',
  name: 'Former Desk',
  email: null,
  active: false,
};

function setup(staff: StaffMember[] = [manager, desk, former]) {
  const repos = createMemoryRepositories({ staff });
  let n = 0;
  return { repos, service: createStaffService({ repos, newId: (p) => `${p}_${++n}` }) };
}

describe('staff rules', () => {
  it('lets only active managers manage', () => {
    expect(() => assertManager(manager)).not.toThrow();
    expect(() => assertManager(desk)).toThrow(/Only a manager/);
    expect(() => assertManager({ ...manager, active: false })).toThrow(/Only a manager/);
    expect(() => assertManager(null)).toThrow(/Only a manager/);
  });

  it('keeps emails unique, ignoring case', () => {
    expect(() => assertUniqueEmail([manager, desk], 'DESK@example.com')).toThrow(
      'DESK@example.com already belongs to Test Desk',
    );
    expect(() => assertUniqueEmail([manager, desk], 'desk@example.com', 'stf_d')).not.toThrow();
    expect(() => assertUniqueEmail([manager, desk], null)).not.toThrow();
  });

  it('never leaves the team without an active manager', () => {
    expect(() => assertKeepsManager([manager, desk], { ...manager, active: false })).toThrow(
      /at least one active manager/,
    );
    expect(() =>
      assertKeepsManager([manager, desk], { ...manager, role: 'housekeeping' }),
    ).toThrow();
    expect(() => assertKeepsManager([manager, desk], { ...desk, role: 'manager' })).not.toThrow();
  });
});

describe('createStaffService', () => {
  it('lists active members first, then by name', async () => {
    const { service } = setup([former, manager, desk]);
    expect((await service.list()).map((s) => s.id)).toEqual(['stf_d', 'stf_m', 'stf_f']);
  });

  it('identifies only active members', async () => {
    const { service } = setup();
    expect(await service.identify('stf_d')).toEqual(desk);
    expect(await service.identify('stf_f')).toBeNull();
    expect(await service.identify('nope')).toBeNull();
    expect(await service.identify(undefined)).toBeNull();
  });

  it('adds a member and audits who did it', async () => {
    const { service, repos } = setup();
    const created = await service.create(
      { name: 'New Housekeeper', email: null, role: 'housekeeping', language: 'cs' },
      manager,
    );
    expect(created).toEqual({
      id: 'stf_1',
      name: 'New Housekeeper',
      email: null,
      role: 'housekeeping',
      language: 'cs',
      active: true,
    });
    expect(repos.state.audit).toEqual([
      expect.objectContaining({
        action: 'staff.create',
        subjectId: 'stf_1',
        payload: { by: 'stf_m', role: 'housekeeping' },
      }),
    ]);
  });

  it('refuses changes from anyone but a manager', async () => {
    const { service, repos } = setup();
    await expect(
      service.create({ name: 'X', email: null, role: 'manager', language: 'cs' }, desk),
    ).rejects.toMatchObject({ code: 'forbidden' });
    await expect(service.update('stf_d', { role: 'manager' }, desk)).rejects.toMatchObject({
      code: 'forbidden',
    });
    expect(repos.state.staff).toHaveLength(3);
  });

  it('changes role and status, auditing the changed fields', async () => {
    const { service, repos } = setup();
    expect(await service.update('stf_d', { role: 'manager', name: 'Test Desk' }, manager)).toEqual({
      ...desk,
      role: 'manager',
    });
    expect(repos.state.audit.at(-1)).toMatchObject({
      action: 'staff.update',
      payload: { by: 'stf_m', changed: ['role'] },
    });
    // Now there are two managers, so the first may step down.
    await service.update('stf_m', { active: false }, manager);
    expect((await repos.staff.get('stf_m'))?.active).toBe(false);
  });

  it('rejects a change that removes the last manager, or reuses an email', async () => {
    const { service } = setup();
    await expect(service.update('stf_m', { active: false }, manager)).rejects.toMatchObject({
      code: 'invalid_input',
    });
    await expect(
      service.update('stf_d', { email: 'Manager@example.com' }, manager),
    ).rejects.toMatchObject({ code: 'conflict' });
    await expect(service.update('nope', { active: false }, manager)).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  it('writes nothing when nothing changed', async () => {
    const { service, repos } = setup();
    await service.update('stf_d', { role: 'receptionist' }, manager);
    expect(repos.state.audit).toEqual([]);
  });
});
