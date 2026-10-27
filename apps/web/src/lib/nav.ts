export interface NavItem {
  label: string;
  path: string;
}

export const navItems: NavItem[] = [
  { label: 'Dashboard', path: '/' },
  { label: 'Tape chart', path: '/tape-chart' },
  { label: 'Inbox', path: '/inbox' },
  { label: 'Housekeeping', path: '/housekeeping' },
  { label: 'Guests', path: '/guests' },
];
