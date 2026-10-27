/** Staff roles. Only shown for now; permissions per role come with sign-in. */
export type StaffRole = 'manager' | 'receptionist' | 'housekeeping';

export const staffRoleLabels: Record<StaffRole, string> = {
  manager: 'Manager',
  receptionist: 'Receptionist',
  housekeeping: 'Housekeeping',
};

export interface StaffUser {
  name: string;
  role: StaffRole;
}

/** The signed-in staff member: a fixed, synthetic demo user until sign-in exists. */
export const currentUser: StaffUser = { name: 'Martina Kovářová', role: 'manager' };
