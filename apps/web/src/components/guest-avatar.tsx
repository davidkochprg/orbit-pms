import { initials } from '@/lib/format';
import { cn } from '@/lib/utils';

const sizes = {
  sm: 'size-6 text-[10px]',
  md: 'size-8 text-xs',
  lg: 'size-11 text-base',
};

export function GuestAvatar({
  name,
  size = 'sm',
  className,
}: {
  name: string;
  size?: keyof typeof sizes;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-muted font-medium text-muted-foreground ring-1 ring-border',
        sizes[size],
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
