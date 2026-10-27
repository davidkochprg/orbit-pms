import {
  BedDouble,
  ChartColumn,
  CalendarRange,
  Inbox,
  type LucideIcon,
  Settings,
  Sun,
  Users,
} from 'lucide-react';

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
}

export const navItems: NavItem[] = [
  { label: 'Today', path: '/', icon: Sun },
  { label: 'Tape chart', path: '/tape-chart', icon: CalendarRange },
  { label: 'Inbox', path: '/inbox', icon: Inbox },
  { label: 'Housekeeping', path: '/housekeeping', icon: BedDouble },
  { label: 'Guests', path: '/guests', icon: Users },
  { label: 'Reports', path: '/reports', icon: ChartColumn },
  { label: 'Settings', path: '/settings', icon: Settings },
];

export function navItemFor(pathname: string): NavItem | undefined {
  return navItems.find((item) =>
    item.path === '/' ? pathname === '/' : pathname.startsWith(item.path),
  );
}
