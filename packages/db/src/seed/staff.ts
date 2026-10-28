import type { StaffMember } from '@orbit/shared';

/**
 * The Czech guesthouse's team: synthetic people on example.com, reading Czech. The first manager
 * is who the demo signs in as.
 */
export const czechStaff: StaffMember[] = [
  {
    id: 'stf_martina',
    name: 'Martina Kovářová',
    email: 'martina@example.com',
    role: 'manager',
    language: 'cs',
    active: true,
  },
  {
    id: 'stf_petr',
    name: 'Petr Svoboda',
    email: 'petr@example.com',
    role: 'receptionist',
    language: 'cs',
    active: true,
  },
  {
    id: 'stf_lucie',
    name: 'Lucie Benešová',
    email: 'lucie@example.com',
    role: 'receptionist',
    language: 'cs',
    active: true,
  },
  {
    id: 'stf_eva',
    name: 'Eva Marková',
    email: 'eva@example.com',
    role: 'housekeeping',
    language: 'cs',
    active: true,
  },
  {
    id: 'stf_tomas',
    name: 'Tomáš Král',
    email: 'tomas@example.com',
    role: 'receptionist',
    language: 'cs',
    active: false,
  },
];

/** The US demo lodge's team: synthetic people on example.com, reading English. */
export const usStaff: StaffMember[] = [
  ['stf_jordan', 'Jordan Lee', 'manager', true],
  ['stf_sam', 'Sam Rivera', 'receptionist', true],
  ['stf_taylor', 'Taylor Brooks', 'receptionist', true],
  ['stf_morgan', 'Morgan Ellis', 'housekeeping', true],
  ['stf_casey', 'Casey Nguyen', 'receptionist', false],
].map(([id, name, role, active]) => ({
  id: id as string,
  name: name as string,
  email: `${(id as string).slice(4)}@example.com`,
  role: role as StaffMember['role'],
  language: 'en' as const,
  active: active as boolean,
}));
