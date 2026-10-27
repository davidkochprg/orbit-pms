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
        <SidebarInset className="min-h-0 overflow-hidden md:peer-data-[variant=inset]:shadow-panel">
          <Outlet />
        </SidebarInset>
        <BookingDrawer />
      </SidebarProvider>
    </CommandPaletteProvider>
  );
}
