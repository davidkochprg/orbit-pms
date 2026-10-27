import { Sparkles } from 'lucide-react';

export function AgentPanel() {
  return (
    <aside className="hidden w-80 shrink-0 flex-col border-l bg-sidebar md:flex">
      <div className="flex h-14 items-center gap-2 border-b px-4 text-sm font-medium">
        <Sparkles className="size-4 text-primary" /> Agent
      </div>
      <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
        The agent is not connected yet.
      </div>
    </aside>
  );
}
