import type { StaffMember } from '@orbit/shared';

/** The demo team: synthetic people on example.com. The first manager is who the demo signs in as. */
export const seedStaff: StaffMember[] = [
  {
    id: 'stf_martina',
    name: 'Martina Kovářová',
    email: 'martina@example.com',
    role: 'manager',
    active: true,
  },
  {
    id: 'stf_petr',
    name: 'Petr Svoboda',
    email: 'petr@example.com',
    role: 'receptionist',
    active: true,
  },
  {
    id: 'stf_lucie',
    name: 'Lucie Benešová',
    email: 'lucie@example.com',
    role: 'receptionist',
    active: true,
  },
  {
    id: 'stf_eva',
    name: 'Eva Marková',
    email: 'eva@example.com',
    role: 'housekeeping',
    active: true,
  },
  {
    id: 'stf_tomas',
    name: 'Tomáš Král',
    email: 'tomas@example.com',
    role: 'receptionist',
    active: false,
  },
];
