import type { ReactNode } from 'react';
import { cn, labelCaps } from '@/lib/utils';

/**
 * The column of folders and filters beside a list, one shape on Inbox, Knowledge and Invoices:
 * the same width, padding and rows, on the panel's own background, with an optional search in a
 * bordered block on top (as tall as the list header beside it). Pages say where it shows, e.g.
 * `hidden xl:flex`.
 */
export function Rail({
  label,
  header,
  children,
  className,
}: {
  label: string;
  /** A search field, and anything that belongs with it, above the scrolling rows. */
  header?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <aside className={cn('w-60 shrink-0 flex-col border-r', className)}>
      {header && <div className="flex shrink-0 flex-col gap-2 border-b p-2">{header}</div>}
      <nav
        aria-label={label}
        className="scroll-fade flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3.5 py-3"
      >
        {children}
      </nav>
    </aside>
  );
}

/** A group's heading in the rail, with room for a button on the right. */
export function RailHeading({
  children,
  action,
  id,
}: {
  children: ReactNode;
  action?: ReactNode;
  id?: string;
}) {
  return (
    <div
      className={cn(
        labelCaps,
        'mt-4 flex h-7 shrink-0 items-center pl-2.5 first:mt-0',
        action ? 'pr-1' : 'pr-2.5',
      )}
    >
      <h2 id={id} className="flex-1">
        {children}
      </h2>
      {action}
    </div>
  );
}

/** The classes of a rail row, for rows that are links or fold rather than buttons. */
export const railRow =
  'flex h-8 w-full shrink-0 items-center gap-2.5 rounded-lg px-2.5 text-left text-sm text-muted-foreground outline-none transition-colors duration-150 ease-snap hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring';

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
        railRow,
        active && 'bg-sidebar-accent text-foreground',
        strong && 'font-medium text-foreground',
      )}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {count > 0 && <RailCount>{count}</RailCount>}
    </button>
  );
}

export function RailCount({ children }: { children: ReactNode }) {
  return <span className="text-xs font-normal text-muted-foreground tabular-nums">{children}</span>;
}
