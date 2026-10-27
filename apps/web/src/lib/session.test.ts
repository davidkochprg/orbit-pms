import type { StaffMember } from '@orbit/shared';
import { describe, expect, it } from 'vitest';
import { canManage, demoManager, resolveSignedIn } from './session';

const member = (id: string, overrides: Partial<StaffMember> = {}): StaffMember => ({
  id,
  name: id,
  email: null,
  role: 'receptionist',
  active: true,
  ...overrides,
});

const staff = [
  member('desk'),
  member('boss', { role: 'manager' }),
  member('gone', { role: 'manager', active: false }),
];

describe('resolveSignedIn', () => {
  it('keeps the stored member while they are active', () => {
    expect(resolveSignedIn(staff, 'desk')?.id).toBe('desk');
  });

  it('signs nobody in without a stored, active member', () => {
    expect(resolveSignedIn(staff, null)).toBeNull();
    expect(resolveSignedIn(staff, 'gone')).toBeNull();
    expect(resolveSignedIn(staff, 'unknown')).toBeNull();
  });
});

describe('demoManager', () => {
  it('picks the first active manager, else anyone active, else nobody', () => {
    expect(demoManager(staff)?.id).toBe('boss');
    expect(demoManager([member('desk')])?.id).toBe('desk');
    expect(demoManager([])).toBeNull();
  });
});

describe('canManage', () => {
  it('is true only for active managers', () => {
    expect(canManage(staff[1]!)).toBe(true);
    expect(canManage(staff[0]!)).toBe(false);
    expect(canManage(staff[2]!)).toBe(false);
    expect(canManage(null)).toBe(false);
  });
});
