import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Label/value pairs in two aligned columns, like a macOS inspector. */
export function PropertyList({ children, className }: { children: ReactNode; className?: string }) {
  return <dl className={cn('grid grid-cols-[7rem_1fr] gap-x-4 gap-y-2', className)}>{children}</dl>;
}

export function Property({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </>
  );
}
