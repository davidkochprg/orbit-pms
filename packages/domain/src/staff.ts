import type { NewStaffBody, StaffMember, UpdateStaffBody } from '@orbit/shared';
import { DomainError } from './errors';
import type { Repositories } from './repositories';

/** Throws unless `by` is an active manager: only managers change settings and the team. */
export function assertManager(by: StaffMember | null): asserts by is StaffMember {
  if (!by?.active || by.role !== 'manager') {
    throw new DomainError('forbidden', 'Only a manager can change this');
  }
}

/** Throws if `email` is already used by another staff member, ignoring case. */
export function assertUniqueEmail(staff: StaffMember[], email: string | null, exceptId?: string) {
  if (!email) return;
  const taken = staff.find(
    (s) => s.id !== exceptId && s.email?.toLowerCase() === email.toLowerCase(),
  );
  if (taken) throw new DomainError('conflict', `${email} already belongs to ${taken.name}`);
}

/** Throws if the change would leave the team without an active manager. */
export function assertKeepsManager(staff: StaffMember[], updated: StaffMember) {
  const managers = staff
    .map((s) => (s.id === updated.id ? updated : s))
    .filter((s) => s.active && s.role === 'manager');
  if (managers.length === 0) {
    throw new DomainError('invalid_input', 'The team needs at least one active manager');
  }
}

export interface StaffDeps {
  repos: Repositories;
  newId: (prefix: string) => string;
}

/** The team: who can sign in and with which role. Changes need a manager and are audited. */
export function createStaffService({ repos, newId }: StaffDeps) {
  return {
    list: () => repos.staff.list(),

    /** The active staff member with this ID, or null: the demo's sign-in. */
    async identify(id: string | null | undefined): Promise<StaffMember | null> {
      if (!id) return null;
      const member = await repos.staff.get(id);
      return member?.active ? member : null;
    },

    async create(input: NewStaffBody, by: StaffMember | null): Promise<StaffMember> {
      assertManager(by);
      return repos.transaction(async (tx) => {
        assertUniqueEmail(await tx.staff.list(), input.email);
        const member: StaffMember = { id: newId('stf'), ...input, active: true };
        await tx.staff.create(member);
        await tx.audit.append({
          actor: 'user',
          action: 'staff.create',
          subjectId: member.id,
          payload: { by: by.id, role: member.role },
        });
        return member;
      });
    },

    async update(id: string, patch: UpdateStaffBody, by: StaffMember | null): Promise<StaffMember> {
      assertManager(by);
      return repos.transaction(async (tx) => {
        const current = await tx.staff.get(id);
        if (!current) throw new DomainError('not_found', `Staff member ${id} not found`);
        const updated = { ...current, ...patch };
        const staff = await tx.staff.list();
        assertUniqueEmail(staff, updated.email, id);
        assertKeepsManager(staff, updated);
        const changed = (Object.keys(patch) as (keyof UpdateStaffBody)[]).filter(
          (key) => current[key] !== updated[key],
        );
        if (changed.length === 0) return current;
        await tx.staff.update(updated);
        await tx.audit.append({
          actor: 'user',
          action: 'staff.update',
          subjectId: id,
          payload: { by: by.id, changed },
        });
        return updated;
      });
    },
  };
}

export type StaffService = ReturnType<typeof createStaffService>;
