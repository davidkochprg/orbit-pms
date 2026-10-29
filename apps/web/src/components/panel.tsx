import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PanelProps {
  /** The card's caption, in the small row above its content. */
  title?: ReactNode;
  /** Shown after the title, e.g. a count. */
  count?: number;
  /** Controls at the right of the caption row. */
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Classes for the white box that holds the content. */
  contentClassName?: string;
  /** Lay the content straight on the well, without the white box (for its own layout). */
  bare?: boolean;
}

/**
 * The app's card: a pale well in the main panel with a caption row, holding its content in a
 * white, lit box. The box's corners follow the well's, minus the well's padding.
 */
export function Panel({
  title,
  count,
  actions,
  children,
  className,
  contentClassName,
  bare = false,
}: PanelProps) {
  return (
    <section
      className={cn(
        'flex min-w-0 flex-col rounded-card bg-surface-sunken p-1 ring-1 ring-ink/5 ring-inset',
        className,
      )}
    >
      {(title !== undefined || actions) && (
        <div className="flex min-h-9 items-center gap-2 px-3 pt-0.5 pb-1">
          {title !== undefined && (
            <h2 className="truncate text-[0.8125rem] text-muted-foreground">{title}</h2>
          )}
          {count !== undefined && <Count value={count} />}
          {actions && <div className="ml-auto flex items-center gap-1">{actions}</div>}
        </div>
      )}
      <div
        className={cn(
          'relative min-w-0 flex-1',
          !bare &&
            'rounded-stage bg-background p-1 shadow-[0_1px_2px_var(--shadow-soft)] stroke-lit',
          contentClassName,
        )}
      >
        {children}
      </div>
    </section>
  );
}

/** A count next to a caption: a small mono chip. */
export function Count({ value }: { value: number }) {
  return (
    <span className="rounded-full bg-ink/5 px-1.5 font-mono text-[0.6875rem] leading-5 text-muted-foreground">
      {value}
    </span>
  );
}

/**
 * Content that scrolls inside a panel's box (use with `contentClassName="p-0"`). The box keeps
 * its lit edge, which would scroll away with the content if the box itself scrolled.
 */
export function ScrollBox({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('scrollbar-thin overflow-y-auto p-1', className)}>{children}</div>;
}
