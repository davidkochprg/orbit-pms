import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import type { Change } from '@/lib/reports';
import { cn } from '@/lib/utils';
import { Tip } from '@/components/ui/tooltip';

/** "+12%" or "−3 pts" against an earlier period, green up and red down; `vs` says against what. */
export function ChangeBadge({ change, vs }: { change: Change; vs: string }) {
  const Icon =
    change.direction === 'up' ? ArrowUpRight : change.direction === 'down' ? ArrowDownRight : Minus;
  return (
    <Tip label={vs}>
      <span
        className={cn(
          'inline-flex items-center gap-0.5 text-xs tabular-nums',
          change.direction === 'up' && 'text-success',
          change.direction === 'down' && 'text-destructive',
          change.direction === 'flat' && 'text-muted-foreground',
        )}
      >
        <Icon className="size-3.5" aria-hidden />
        {change.label}
        <span className="sr-only"> {vs}</span>
      </span>
    </Tip>
  );
}
