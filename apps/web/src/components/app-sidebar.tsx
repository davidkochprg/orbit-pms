import { Search } from 'lucide-react';
import { NavLink, useLocation } from 'react-router';
import { Wordmark } from '@/components/wordmark';
import { ThemeToggle } from '@/components/theme-toggle';
import { UserCard } from '@/components/user-card';
import { Kbd } from '@/components/ui/kbd';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { useCommandPalette } from '@/hooks/use-command-palette';
import { useHotelProfile, useInbox } from '@/lib/api';
import { folderCounts } from '@/lib/inbox';
import { type NavGroup, navItemFor, navItems } from '@/lib/nav';
import { cn, labelCaps } from '@/lib/utils';

/** The utilities have no label and sit at the bottom, above the signed-in staff member. */
const groups: { group: NavGroup; label?: string }[] = [
  { group: 'desk', label: 'Front desk' },
  { group: 'office', label: 'Office' },
  { group: 'utility' },
];

export function AppSidebar() {
  const active = navItemFor(useLocation().pathname);
  const { openPalette } = useCommandPalette();
  const inbox = useInbox();
  const hotel = useHotelProfile();
  const unread = inbox.data ? folderCounts(inbox.data).unread : 0;

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader className="gap-4 px-3 pt-4">
        <div className="flex min-h-9 flex-col justify-center gap-1.5 px-1.5 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-0">
          <Wordmark className="group-data-[collapsible=icon]:hidden" />
          <Wordmark short className="hidden group-data-[collapsible=icon]:inline-flex" />
          <span className="truncate text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
            {hotel.data?.name ?? ' '}
          </span>
        </div>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Ask Orbit or search (⌘K)"
              onClick={() => openPalette()}
              className="relative h-9 rounded-control bg-background/70 pl-3 text-muted-foreground shadow-[0_1px_2px_var(--shadow-soft)] stroke-lit hover:bg-background hover:text-foreground group-data-[collapsible=icon]:rounded-control"
            >
              <Search />
              <span>Ask or search…</span>
              <Kbd className="ml-auto">⌘K</Kbd>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="gap-1 px-1 pt-2">
        {groups.map(({ group, label }) => (
          <SidebarGroup key={group} className={cn(!label && 'mt-auto')}>
            {label && (
              <SidebarGroupLabel className={cn(labelCaps, 'h-7 px-2')}>{label}</SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {navItems
                  .filter((item) => item.group === group)
                  .map((item) => (
                    <SidebarMenuItem key={item.path}>
                      <SidebarMenuButton
                        asChild
                        isActive={active === item}
                        tooltip={item.label}
                        className="h-8 rounded-lg text-muted-foreground transition-colors duration-150 ease-snap hover:bg-accent hover:text-foreground data-[active=true]:bg-sidebar-accent data-[active=true]:font-normal data-[active=true]:text-foreground [&_svg]:text-subtle-foreground data-[active=true]:[&_svg]:text-foreground"
                      >
                        <NavLink to={item.path}>
                          <item.icon />
                          <span>{item.label}</span>
                        </NavLink>
                      </SidebarMenuButton>
                      {item.path === '/inbox' && unread > 0 && (
                        <SidebarMenuBadge className="top-1.5! rounded-full bg-primary-soft px-1.5 font-mono text-[0.6875rem] text-primary-text">
                          {unread}
                        </SidebarMenuBadge>
                      )}
                    </SidebarMenuItem>
                  ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="flex-row items-center gap-1 px-3 pb-4 group-data-[collapsible=icon]:flex-col">
        <UserCard />
        <ThemeToggle />
      </SidebarFooter>
    </Sidebar>
  );
}
