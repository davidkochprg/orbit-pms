import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface SectionProps {
  title: ReactNode;
  /** Shown after the title, e.g. a count. */
  count?: number;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** A titled group of content inside a page or drawer. */
export function Section({ title, count, actions, children, className }: SectionProps) {
  return (
    <section className={cn('flex flex-col gap-2', className)}>
      <div className="flex h-6 items-center gap-2">
        <h2 className="text-sm font-medium">{title}</h2>
        {count !== undefined && (
          <span className="text-sm text-subtle-foreground tabular-nums">{count}</span>
        )}
        {actions && <div className="ml-auto flex items-center gap-1">{actions}</div>}
      </div>
      {children}
    </section>
  );
}
