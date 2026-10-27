import type { StaffMember, StaffRole } from '@orbit/shared';

export const staffRoleLabels: Record<StaffRole, string> = {
  manager: 'Manager',
  receptionist: 'Receptionist',
  housekeeping: 'Housekeeping',
};

const STORAGE_KEY = 'orbit.staffId';
const listeners = new Set<() => void>();
let memoryId: string | null = null;

/**
 * The signed-in staff member's ID, sent as `x-staff-id` with every request (ADR 0009). Kept in
 * the browser; storage may be unavailable, so it falls back to memory for the session.
 */
export function storedStaffId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? memoryId;
  } catch {
    return memoryId;
  }
}

export function storeStaffId(id: string): void {
  memoryId = id;
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Memory only.
  }
  for (const listener of listeners) listener();
}

/** Signs out: the app shows the welcome page until someone enters again. */
export function clearStaffId(): void {
  memoryId = null;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Memory only.
  }
  for (const listener of listeners) listener();
}

export function subscribeStaffId(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Who is signed in: the stored member while they are active, otherwise nobody. */
export function resolveSignedIn(staff: StaffMember[], storedId: string | null): StaffMember | null {
  return staff.find((s) => s.active && s.id === storedId) ?? null;
}

/** Who "Enter demo" signs in as: the first active manager, so every feature can be tried. */
export function demoManager(staff: StaffMember[]): StaffMember | null {
  const active = staff.filter((s) => s.active);
  return active.find((s) => s.role === 'manager') ?? active[0] ?? null;
}

export const canManage = (member: StaffMember | null) =>
  member?.active === true && member.role === 'manager';
