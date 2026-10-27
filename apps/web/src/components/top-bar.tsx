import { PanelRight, Search } from 'lucide-react';
import { useLocation } from 'react-router';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { navItemFor } from '@/lib/nav';

interface TopBarProps {
  agentOpen: boolean;
  onToggleAgent: () => void;
}

export function TopBar({ agentOpen, onToggleAgent }: TopBarProps) {
  const title = navItemFor(useLocation().pathname)?.label ?? 'Not found';
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
      <h1 className="text-sm font-medium">{title}</h1>
      <div className="ml-auto flex items-center gap-1">
        <Button
          variant="outline"
          className="w-56 justify-start text-muted-foreground"
          disabled
          title="Command bar arrives with the agent"
        >
          <Search />
          <span>Ask or search…</span>
          <kbd className="ml-auto rounded border bg-muted px-1.5 font-mono text-[10px]">⌘K</kbd>
        </Button>
        <Button
          variant={agentOpen ? 'secondary' : 'ghost'}
          size="icon"
          aria-label="Toggle agent panel"
          aria-pressed={agentOpen}
          onClick={onToggleAgent}
        >
          <PanelRight />
        </Button>
        <ThemeToggle />
      </div>
    </header>
  );
}
