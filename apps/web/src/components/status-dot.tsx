import { cn } from '@/lib/utils';

/** A small colored dot. Pass a token color class, e.g. `bg-status-hold`. */
export function StatusDot({ className }: { className: string }) {
  return (
    <span aria-hidden className={cn('inline-block size-2 shrink-0 rounded-full', className)} />
  );
}
