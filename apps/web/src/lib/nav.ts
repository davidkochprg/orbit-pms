import {
  BedDouble,
  CalendarRange,
  Inbox,
  LayoutDashboard,
  type LucideIcon,
  Users,
} from 'lucide-react';

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
}

export const navItems: NavItem[] = [
  { label: 'Dashboard', path: '/', icon: LayoutDashboard },
  { label: 'Tape chart', path: '/tape-chart', icon: CalendarRange },
  { label: 'Inbox', path: '/inbox', icon: Inbox },
  { label: 'Housekeeping', path: '/housekeeping', icon: BedDouble },
  { label: 'Guests', path: '/guests', icon: Users },
];

export function navItemFor(pathname: string): NavItem | undefined {
  return navItems.find((item) =>
    item.path === '/' ? pathname === '/' : pathname.startsWith(item.path),
  );
}
