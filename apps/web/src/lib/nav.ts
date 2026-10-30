import {
  BedDouble,
  BookOpenText,
  ChartColumn,
  History,
  CalendarRange,
  DoorOpen,
  Inbox,
  type LucideIcon,
  Settings,
  Sun,
  Tags,
  Users,
} from 'lucide-react';

/** Front desk: the day-to-day work. Office: rooms and rates, numbers, history and setup. */
export type NavGroup = 'desk' | 'office';

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  group: NavGroup;
}

export const navItems: NavItem[] = [
  { group: 'desk', label: 'Today', path: '/', icon: Sun },
  { group: 'desk', label: 'Tape chart', path: '/tape-chart', icon: CalendarRange },
  { group: 'desk', label: 'Inbox', path: '/inbox', icon: Inbox },
  { group: 'desk', label: 'Housekeeping', path: '/housekeeping', icon: BedDouble },
  { group: 'desk', label: 'Guests', path: '/guests', icon: Users },
  { group: 'office', label: 'Rooms', path: '/rooms', icon: DoorOpen },
  { group: 'office', label: 'Rates', path: '/rates', icon: Tags },
  { group: 'office', label: 'Knowledge', path: '/knowledge', icon: BookOpenText },
  { group: 'office', label: 'Reports', path: '/reports', icon: ChartColumn },
  { group: 'office', label: 'Activity', path: '/activity', icon: History },
  { group: 'office', label: 'Settings', path: '/settings', icon: Settings },
];

export function navItemFor(pathname: string): NavItem | undefined {
  return navItems.find((item) =>
    item.path === '/' ? pathname === '/' : pathname.startsWith(item.path),
  );
}
