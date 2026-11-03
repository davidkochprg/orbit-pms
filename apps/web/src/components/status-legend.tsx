import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface LegendItem {
  key: string;
  label: string;
  /** Classes for the swatch: the status color, or a ring and hatch for empty rooms. */
  swatch: string;
}

/** The key under the house map and the tape chart: one swatch shape, size and spacing for both. */
export function StatusLegend({
  items,
  className,
  children,
}: {
  items: LegendItem[];
  className?: string;
  /** Extra entries after the swatches, e.g. the tape chart's icon key. */
  children?: ReactNode;
}) {
  return (
    <ul
      className={cn(
        'flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground',
        className,
      )}
    >
      {items.map((item) => (
        <li key={item.key} className="flex items-center gap-1.5">
          <span aria-hidden className={cn('size-2.5 shrink-0 rounded-[3px]', item.swatch)} />
          {item.label}
        </li>
      ))}
      {children}
    </ul>
  );
}
