import { cn } from 'cn';

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      className={cn('animate-pulse rounded-control bg-ink/5', className)}
      {...props}
    />
  );
}

export { Skeleton };
