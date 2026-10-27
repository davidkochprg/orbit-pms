import { Outlet } from 'react-router';
import { AppSidebar } from '@/components/app-sidebar';
import { BookingDrawer } from '@/components/booking-drawer';
import { CommandPaletteProvider } from '@/components/command-palette';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';

export function AppLayout() {
  return (
    <CommandPaletteProvider>
      <SidebarProvider className="h-svh">
        <AppSidebar />
        <SidebarInset className="min-h-0 min-w-0 overflow-hidden md:peer-data-[variant=inset]:shadow-panel">
          <Outlet />
          {/* Daylight glow shining through the workspace; transparent in other themes. */}
          <div aria-hidden className="daylight-wash pointer-events-none absolute inset-0 z-40" />
        </SidebarInset>
        <BookingDrawer />
      </SidebarProvider>
    </CommandPaletteProvider>
  );
}
