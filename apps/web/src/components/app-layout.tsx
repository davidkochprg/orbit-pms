import { useState } from 'react';
import { Outlet } from 'react-router';
import { AgentPanel } from '@/components/agent-panel';
import { AppSidebar } from '@/components/app-sidebar';
import { BookingDrawer } from '@/components/booking-drawer';
import { TopBar } from '@/components/top-bar';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';

export function AppLayout() {
  const [agentOpen, setAgentOpen] = useState(false);
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="flex-row overflow-hidden">
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar agentOpen={agentOpen} onToggleAgent={() => setAgentOpen((o) => !o)} />
          <main className="flex-1 overflow-auto p-6">
            <Outlet />
          </main>
        </div>
        {agentOpen && <AgentPanel />}
        <BookingDrawer />
      </SidebarInset>
    </SidebarProvider>
  );
}
