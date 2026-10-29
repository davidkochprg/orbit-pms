import { ArrowUpRight, CornerDownRight } from 'lucide-react';
import type { FollowUp } from '@/lib/agent-follow-ups';

/** Next steps after the latest answer, as small buttons: a question to ask, or a page. */
export function FollowUps({
  followUps: items,
  onPick,
}: {
  followUps: FollowUp[];
  onPick: (followUp: FollowUp) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" aria-label="Next steps">
      {items.map((f) => (
        <button
          key={f.label}
          type="button"
          onClick={() => onPick(f)}
          className="flex h-7 max-w-full items-center gap-1.5 rounded-full border border-border bg-background px-3 text-xs text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          {'ask' in f ? (
            <CornerDownRight className="size-3 shrink-0" />
          ) : (
            <ArrowUpRight className="size-3 shrink-0" />
          )}
          <span className="truncate">{f.label}</span>
        </button>
      ))}
    </div>
  );
}
