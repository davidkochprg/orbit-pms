import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

/** A card under an agent answer, built from what a tool returned. */
export function AgentCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-stage bg-background p-3 text-sm shadow-[0_1px_2px_var(--shadow-soft)] stroke-lit',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** The card's first line: an icon and title, and on the right a figure or a note. */
export function AgentCardHeader({
  icon: Icon,
  title,
  aside,
}: {
  icon: LucideIcon;
  title: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="flex min-w-0 items-center gap-2 font-medium">
        <Icon className="size-3.5 shrink-0 self-center text-muted-foreground" />
        {title}
      </span>
      {aside}
    </div>
  );
}

/** Money lines, label left and amount right, exactly as the domain worked them out. */
export function Amounts({ lines }: { lines: { label: string; amount: number }[] }) {
  return (
    <ul className="flex flex-col gap-0.5 text-xs">
      {lines.map((l, i) => (
        <li key={i} className="flex items-baseline justify-between gap-4">
          <span className="min-w-0 text-muted-foreground">{l.label}</span>
          <span className="shrink-0 font-mono tabular-nums">{formatMoney(l.amount)}</span>
        </li>
      ))}
    </ul>
  );
}
