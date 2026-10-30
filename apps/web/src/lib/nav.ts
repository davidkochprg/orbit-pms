import {
  BedDouble,
  BookOpenText,
  ChartColumn,
  History,
  CalendarRange,
  Contact,
  DoorOpen,
  Inbox,
  type LucideIcon,
  Settings,
  Sun,
  Tags,
  Users,
} from 'lucide-react';

/**
 * Front desk: the day-to-day work. Office: rooms and rates, what guests are told, who to call and
 * the numbers. Utility: the change history and setup, kept apart at the bottom of the sidebar.
 */
export type NavGroup = 'desk' | 'office' | 'utility';

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
  { group: 'office', label: 'Contacts', path: '/contacts', icon: Contact },
  { group: 'office', label: 'Reports', path: '/reports', icon: ChartColumn },
  { group: 'utility', label: 'Activity', path: '/activity', icon: History },
  { group: 'utility', label: 'Settings', path: '/settings', icon: Settings },
];

export function navItemFor(pathname: string): NavItem | undefined {
  return navItems.find((item) =>
    item.path === '/' ? pathname === '/' : pathname.startsWith(item.path),
  );
}
