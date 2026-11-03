import type { ReactNode } from 'react';
import { cn, labelCaps } from '@/lib/utils';

/**
 * The column of folders and filters beside a list, as on Inbox and Invoices: shown from `xl`,
 * where the list still has room beside it.
 */
export function Rail({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <nav
      aria-label={label}
      className={cn(
        'hidden w-52 shrink-0 flex-col gap-0.5 overflow-y-auto border-r px-3.5 py-3 xl:flex',
        className,
      )}
    >
      {children}
    </nav>
  );
}

/** A group's heading in the rail, with room for a button on the right. */
export function RailHeading({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div
      className={cn(
        labelCaps,
        'mt-4 flex h-7 items-center pl-2.5 first:mt-0',
        action ? 'pr-1' : 'pr-2.5',
      )}
    >
      <h2 className="flex-1">{children}</h2>
      {action}
    </div>
  );
}

/** One folder or filter: a row with an optional icon and a count. */
export function RailItem({
  icon,
  active,
  onClick,
  count = 0,
  strong,
  children,
}: {
  icon?: ReactNode;
  active: boolean;
  onClick: () => void;
  count?: number;
  strong?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex h-8 w-full shrink-0 items-center gap-2.5 rounded-lg px-2.5 text-left text-sm text-muted-foreground outline-none transition-colors duration-150 ease-snap hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
        active && 'bg-sidebar-accent text-foreground',
        strong && 'font-medium text-foreground',
      )}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {count > 0 && <span className="text-xs text-muted-foreground tabular-nums">{count}</span>}
    </button>
  );
}
