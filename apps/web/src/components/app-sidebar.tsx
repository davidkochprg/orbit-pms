import { Orbit, Search } from 'lucide-react';
import { NavLink, useLocation } from 'react-router';
import { StatusDot } from '@/components/status-dot';
import { ThemeToggle } from '@/components/theme-toggle';
import { Kbd } from '@/components/ui/kbd';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { useCommandPalette } from '@/hooks/use-command-palette';
import { useHealth, useInbox } from '@/lib/api';
import { navItemFor, navItems } from '@/lib/nav';

export function AppSidebar() {
  const active = navItemFor(useLocation().pathname);
  const { openPalette } = useCommandPalette();
  const inbox = useInbox();
  const unread = inbox.data?.filter((m) => m.status === 'new').length ?? 0;

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader className="gap-3 pt-3">
        <div className="flex h-8 items-center gap-2 px-2 group-data-[collapsible=icon]:px-0">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-foreground text-background group-data-[collapsible=icon]:mx-auto">
            <Orbit className="size-3.5" strokeWidth={2.25} />
          </span>
          <span className="truncate text-sm font-semibold tracking-tight group-data-[collapsible=icon]:hidden">
            Orbit
          </span>
        </div>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Ask Orbit or search (⌘K)"
              onClick={() => openPalette()}
              className="h-8 border bg-background text-muted-foreground shadow-raised hover:bg-background hover:text-foreground"
            >
              <Search />
              <span>Ask or search…</span>
              <Kbd className="ml-auto bg-transparent">⌘K</Kbd>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {navItems.map((item) => (
                <SidebarMenuItem key={item.path}>
                  <SidebarMenuButton
                    asChild
                    isActive={active === item}
                    tooltip={item.label}
                    className="h-8 text-muted-foreground data-[active=true]:font-medium data-[active=true]:text-foreground"
                  >
                    <NavLink to={item.path}>
                      <item.icon />
                      <span>{item.label}</span>
                    </NavLink>
                  </SidebarMenuButton>
                  {item.path === '/inbox' && unread > 0 && (
                    <SidebarMenuBadge className="text-muted-foreground tabular-nums">
                      {unread}
                    </SidebarMenuBadge>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="flex-row items-center group-data-[collapsible=icon]:flex-col">
        <AgentStatus />
        <ThemeToggle />
      </SidebarFooter>
    </Sidebar>
  );
}

function AgentStatus() {
  const health = useHealth();
  const label = health.isPending
    ? 'Connecting…'
    : health.isError
      ? 'Server offline'
      : health.data.ai.configured
        ? 'Agent ready'
        : 'Agent not configured';
  const color = health.isPending
    ? 'bg-subtle-foreground'
    : health.isError
      ? 'bg-destructive'
      : health.data.ai.configured
        ? 'bg-success'
        : 'bg-warning';
  return (
    <span
      title={label}
      className="flex min-w-0 flex-1 items-center gap-2 px-2 text-xs text-muted-foreground group-data-[collapsible=icon]:flex-none group-data-[collapsible=icon]:px-0"
    >
      <StatusDot className={color} />
      <span className="truncate group-data-[collapsible=icon]:hidden">{label}</span>
    </span>
  );
}
