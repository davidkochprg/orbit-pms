import type { StaffMember } from '@orbit/shared';
import { describe, expect, it } from 'vitest';
import { canManage, resolveSignedIn } from './session';

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

  it('falls back to the first active manager', () => {
    expect(resolveSignedIn(staff, null)?.id).toBe('boss');
    expect(resolveSignedIn(staff, 'gone')?.id).toBe('boss');
    expect(resolveSignedIn(staff, 'unknown')?.id).toBe('boss');
  });

  it('takes anyone active without a manager, or nobody', () => {
    expect(resolveSignedIn([member('desk')], null)?.id).toBe('desk');
    expect(resolveSignedIn([], null)).toBeNull();
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
