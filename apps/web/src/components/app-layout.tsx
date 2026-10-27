import { Navigate, Outlet, useLocation } from 'react-router';
import { AppSidebar } from '@/components/app-sidebar';
import { BookingDrawer } from '@/components/booking-drawer';
import { BookingEditorProvider } from '@/components/booking-editor';
import { CommandPaletteProvider } from '@/components/command-palette';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { useSession } from '@/hooks/use-session';

export function AppLayout() {
  const { storedId, ready, current } = useSession();
  const location = useLocation();
  // Signed out, or signed in as someone who was deactivated: back to the welcome page.
  if (!storedId || (ready && !current)) {
    const next = location.pathname + location.search;
    return (
      <Navigate
        to={next === '/' ? '/welcome' : `/welcome?next=${encodeURIComponent(next)}`}
        replace
      />
    );
  }

  return (
    <BookingEditorProvider>
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
    </BookingEditorProvider>
  );
}
