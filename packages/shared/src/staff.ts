import { z } from 'zod';

/** Managers run Settings and the team; everyone else works the front desk or the rooms. */
export const staffRoles = ['manager', 'receptionist', 'housekeeping'] as const;
export const staffRoleSchema = z.enum(staffRoles);
export type StaffRole = z.infer<typeof staffRoleSchema>;

export const staffMemberSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  role: staffRoleSchema,
  /** Inactive members keep their history but can no longer sign in. */
  active: z.boolean(),
});
export type StaffMember = z.infer<typeof staffMemberSchema>;

const staffEmailSchema = z
  .union([z.literal(''), z.email()])
  .nullable()
  .transform((s) => (s === '' ? null : s));

export const newStaffBodySchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: staffEmailSchema.default(null),
  role: staffRoleSchema,
});
export type NewStaffBody = z.infer<typeof newStaffBodySchema>;

export const updateStaffBodySchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    email: staffEmailSchema,
    role: staffRoleSchema,
    active: z.boolean(),
  })
  .partial();
export type UpdateStaffBody = z.infer<typeof updateStaffBodySchema>;

/** Header the web app sends with the signed-in staff member's ID. */
export const STAFF_HEADER = 'x-staff-id';
